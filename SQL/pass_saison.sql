-- =====================================================================
--  Pass de saison du Duel des Couronnes (page pass.html)
--
--  - saisons           : nom, dates, prix de la piste premium (en OR du jeu, jamais d'argent réel)
--  - pass_paliers      : les 30 paliers × 2 pistes (gratuite / premium) et leur récompense
--  - pass_progression  : XP du joueur dans la saison, premium débloqué, paliers réclamés,
--                        compteurs du jour (plafonds des duels contre l'IA et contre un ami)
--  - pass_parties      : les « tickets » de partie (anti-triche des duels, voir plus bas)
--  - récompenses : or, cartes (une carte précise, ou une carte au hasard d'une rareté),
--                   boosters (SQL/boosters.sql) et cosmétiques
--  - pass_cosmetiques  : les cosmétiques gagnés (dos de cartes, cadres, titres, fonds de plateau),
--                        enregistrés seulement : leur affichage n'existe pas encore
--
--  Les joueurs LISENT leurs données ; ils n'écrivent jamais directement : tout passe par
--  les fonctions SECURITY DEFINER, qui vérifient tout côté serveur :
--    pass_commencer_partie(mode, salon, difficulte) -> ticket   au début d'un duel (IA ou ami)
--    pass_fin_partie(ticket, victoire)   -> XP         à la fin du duel
--    pass_reclamer(numero, piste)        -> récompense
--    pass_debloquer_premium()            -> paie la piste premium en or
--  Le mode Histoire donne son XP via valider_niveau_histoire (SQL/mode_histoire.sql),
--  qui appelle pass_ajouter_xp.
--
--  Anti-triche des duels (le serveur ne voit pas la partie, qui se joue dans le navigateur) :
--    - un ticket par partie, demandé au début, utilisable une seule fois ;
--      en demander un nouveau annule le précédent ;
--    - au plus 3 heures entre le ticket et la fin (pas de durée minimale : le plafond du jour suffit) ;
--    - contre l'IA : 100 (victoire) / 30 (défaite), 1000 XP par jour au plus ;
--      une victoire rapporte aussi de l'or selon la difficulté : 2 (facile), 5 (normal), 10 (difficile),
--      jusqu'au plafond d'XP du jour (10 victoires au plus) ;
--    - contre un ami : 150 / 50, 1500 XP par jour au plus ; l'adversaire doit être un autre
--      compte, avec son propre ticket dans le même salon ; une seule victoire par partie ;
--    - un abandon ne rapporte rien (le jeu ne déclare pas la fin de la partie).
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_collection.sql, mode_histoire.sql et boosters.sql.
--  Relançable (les paliers de la saison 1 sont remis à jour, la progression est gardée).
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.saisons (
  id            bigint generated always as identity primary key,
  nom           text not null,
  date_debut    timestamptz not null,
  date_fin      timestamptz not null,
  active        boolean not null default false,
  prix_premium  int not null default 1500 check (prix_premium >= 0),   -- en or du jeu
  xp_par_palier int not null default 1000 check (xp_par_palier > 0),
  nb_paliers    int not null default 30 check (nb_paliers > 0),
  check (date_fin > date_debut)
);
-- Une seule saison active à la fois
create unique index if not exists saisons_une_seule_active on public.saisons (active) where active;

create table if not exists public.pass_paliers (
  saison_id       bigint not null references public.saisons(id) on delete cascade,
  numero          int    not null check (numero >= 1),
  piste           text   not null check (piste in ('gratuite', 'premium')),
  type_recompense text   not null check (type_recompense in
                    ('or', 'carte', 'carte_rarete', 'booster', 'dos_carte', 'cadre_portrait', 'titre', 'fond_plateau')),
  -- or : {"montant": 150}
  -- carte : {"nom": "Dalek", "or_si_deja": 300}   (nom exact dans la table cards ; or donné si déjà possédée)
  -- carte_rarete : {"rarete": "mythique", "or_si_deja": 200}
  --   une carte au hasard de cette rareté, de préférence une que le joueur n'a pas ; s'il les a toutes :
  --   un exemplaire de plus (doublon, SQL/doublons.sql), ou l'or si les doublons ne sont pas installés
  -- booster : {"booster": "cendres", "quantite": 1}  (SQL/boosters.sql ; il s'ouvre dans la Boutique)
  -- cosmétiques : {"nom": "Dos de l'Éveil"}
  valeur          jsonb  not null default '{}'::jsonb,
  primary key (saison_id, numero, piste)
);

-- Table déjà créée avant : on ajoute les types « booster » et « carte_rarete »
alter table public.pass_paliers drop constraint if exists pass_paliers_type_recompense_check;
alter table public.pass_paliers add constraint pass_paliers_type_recompense_check check (type_recompense in
  ('or', 'carte', 'carte_rarete', 'booster', 'dos_carte', 'cadre_portrait', 'titre', 'fond_plateau'));

create table if not exists public.pass_progression (
  discord_id        text   not null,
  saison_id         bigint not null references public.saisons(id) on delete cascade,
  xp                int    not null default 0 check (xp >= 0),
  premium           boolean not null default false,
  reclames_gratuite int[]  not null default '{}',
  reclames_premium  int[]  not null default '{}',
  -- plafonds du jour (heure de Paris)
  jour_ia           date,
  xp_ia_jour        int not null default 0,
  jour_ami          date,
  xp_ami_jour       int not null default 0,
  maj_le            timestamptz not null default now(),
  primary key (discord_id, saison_id)
);

create table if not exists public.pass_parties (
  id          uuid primary key default gen_random_uuid(),
  discord_id  text not null,
  mode        text not null check (mode in ('ia', 'ami')),
  salon       text,                          -- code du salon (duel contre un ami)
  commence_le timestamptz not null default now(),
  termine_le  timestamptz,
  victoire    boolean,
  xp          int not null default 0
);
-- Difficulté du duel contre l'IA (l'or d'une victoire en dépend)
alter table public.pass_parties add column if not exists difficulte text not null default 'normal'
  check (difficulte in ('facile', 'normal', 'difficile'));
create index if not exists pass_parties_joueur on public.pass_parties (discord_id, commence_le desc);
create index if not exists pass_parties_salon on public.pass_parties (salon, commence_le desc) where salon is not null;

create table if not exists public.pass_cosmetiques (
  discord_id text not null,
  type       text not null check (type in ('dos_carte', 'cadre_portrait', 'titre', 'fond_plateau')),
  nom        text not null,
  saison_id  bigint references public.saisons(id) on delete set null,
  obtenu_le  timestamptz not null default now(),
  primary key (discord_id, type, nom)
);


-- ---------------------------------------------------------------------
--  2. Sécurité (RLS) : saisons et paliers lisibles par tous ;
--     progression et cosmétiques : chacun lit les siens ; aucune écriture directe
-- ---------------------------------------------------------------------
alter table public.saisons          enable row level security;
alter table public.pass_paliers     enable row level security;
alter table public.pass_progression enable row level security;
alter table public.pass_parties     enable row level security;
alter table public.pass_cosmetiques enable row level security;

drop policy if exists "saisons lisibles par tous" on public.saisons;
create policy "saisons lisibles par tous" on public.saisons
  for select to anon, authenticated using (true);

drop policy if exists "paliers lisibles par tous" on public.pass_paliers;
create policy "paliers lisibles par tous" on public.pass_paliers
  for select to anon, authenticated using (true);

drop policy if exists "je lis ma progression de pass" on public.pass_progression;
create policy "je lis ma progression de pass" on public.pass_progression
  for select to authenticated using (discord_id = public.my_discord_id());

drop policy if exists "je lis mes cosmetiques de pass" on public.pass_cosmetiques;
create policy "je lis mes cosmetiques de pass" on public.pass_cosmetiques
  for select to authenticated using (discord_id = public.my_discord_id());

-- pass_parties : aucune policy (personne ne la lit depuis le navigateur)
revoke insert, update, delete on public.saisons, public.pass_paliers, public.pass_progression,
  public.pass_parties, public.pass_cosmetiques from anon, authenticated;
revoke select on public.pass_parties from anon, authenticated;


-- ---------------------------------------------------------------------
--  3. Source « pass » dans l'historique des pièces (transactions.source),
--     comme pour « histoire » (contrainte CHECK ou type énuméré)
-- ---------------------------------------------------------------------
do $$
declare
  c record;
  v_type text;
begin
  select data_type, udt_name into c from information_schema.columns
  where table_schema = 'public' and table_name = 'transactions' and column_name = 'source';
  if c.data_type = 'USER-DEFINED' then
    v_type := c.udt_name;
    if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                   where t.typname = v_type and e.enumlabel = 'pass') then
      execute format('alter type public.%I add value %L', v_type, 'pass');
    end if;
  else
    for c in
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.transactions'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%source%'
        and pg_get_constraintdef(oid) not ilike '%''pass''%'
    loop
      execute format('alter table public.transactions drop constraint %I', c.conname);
      execute format('alter table public.transactions add constraint %I %s', c.conname,
                     regexp_replace(c.def, 'ARRAY\[', 'ARRAY[''pass''::text, '));
    end loop;
  end if;
end $$;


-- ---------------------------------------------------------------------
--  4. Fonctions internes (pas appelables depuis le navigateur)
-- ---------------------------------------------------------------------

-- La saison en cours (active et dans ses dates), ou null
create or replace function public.pass_saison_en_cours()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id from saisons where active and now() between date_debut and date_fin limit 1;
$$;

-- Ajoute de l'XP au joueur dans la saison en cours ; renvoie son XP totale (ou null sans saison)
create or replace function public.pass_ajouter_xp(p_discord_id text, p_xp int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saison bigint := pass_saison_en_cours();
  v_xp int;
begin
  if v_saison is null or p_discord_id is null or coalesce(p_xp, 0) <= 0 then
    return null;
  end if;
  insert into pass_progression (discord_id, saison_id, xp) values (p_discord_id, v_saison, p_xp)
  on conflict (discord_id, saison_id) do update
    set xp = pass_progression.xp + excluded.xp, maj_le = now()
  returning xp into v_xp;
  return v_xp;
end;
$$;

-- Ajoute de l'or au joueur et le note dans l'historique
create or replace function public.pass_donner_or(p_discord_id text, p_montant int, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_montant, 0) <= 0 then return; end if;
  update wallets set balance = balance + p_montant where discord_id = p_discord_id;
  if not found then
    insert into wallets (discord_id, balance) values (p_discord_id, p_montant);
  end if;
  insert into transactions (discord_id, amount, source, reason)
  values (p_discord_id, p_montant, 'pass', p_raison);
end;
$$;


-- ---------------------------------------------------------------------
--  5. Fonctions des joueurs
-- ---------------------------------------------------------------------

-- Début d'un duel : renvoie un ticket (uuid), ou null s'il n'y a pas de saison en cours.
-- p_difficulte : la difficulté choisie contre l'IA (facile, normal, difficile)
drop function if exists public.pass_commencer_partie(text, text);
create or replace function public.pass_commencer_partie(p_mode text, p_salon text default null, p_difficulte text default 'normal')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_id  uuid;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_mode not in ('ia', 'ami') then raise exception 'Mode inconnu.'; end if;
  if p_mode = 'ami' and coalesce(p_salon, '') !~ '^[A-Z0-9]{5}$' then raise exception 'Salon invalide.'; end if;
  if pass_saison_en_cours() is null then return null; end if;

  -- Un seul ticket ouvert par joueur : le précédent est annulé (sans XP)
  update pass_parties set termine_le = now(), victoire = null, xp = 0
  where discord_id = v_moi and termine_le is null;

  insert into pass_parties (discord_id, mode, salon, difficulte)
  values (v_moi, p_mode, case when p_mode = 'ami' then p_salon end,
          case when p_difficulte in ('facile', 'normal', 'difficile') then p_difficulte else 'normal' end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Fin d'un duel : donne l'XP selon le mode et le résultat, dans la limite du jour.
-- Renvoie { xp, or, raison, xp_total, palier } ; raison explique un 0 (plafond, ticket…)
create or replace function public.pass_fin_partie(p_ticket uuid, p_victoire boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi     text := my_discord_id();
  v_partie  pass_parties%rowtype;
  v_adverse pass_parties%rowtype;
  v_vict_salon int;
  v_joueurs_salon int;
  v_saison  saisons%rowtype;
  v_prog    pass_progression%rowtype;
  v_jour    date := (now() at time zone 'Europe/Paris')::date;
  v_vict    boolean := coalesce(p_victoire, false);
  v_xp      int;
  v_deja    int;
  v_plafond int;
  v_total   int;
  v_raison  text := null;
  v_or      int := 0;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;

  perform pg_advisory_xact_lock(hashtext('pass:' || v_moi));

  select * into v_partie from pass_parties where id = p_ticket and discord_id = v_moi for update;
  if not found or v_partie.termine_le is not null then
    return json_build_object('xp', 0, 'raison', 'ticket');
  end if;

  select * into v_saison from saisons where id = pass_saison_en_cours();
  if not found then
    update pass_parties set termine_le = now() where id = p_ticket;
    return json_build_object('xp', 0, 'raison', 'saison');
  end if;

  -- Durée : pas de minimum (une partie peut être courte), au plus 3 heures
  if now() - v_partie.commence_le > interval '3 hours' then
    update pass_parties set termine_le = now(), victoire = v_vict where id = p_ticket;
    return json_build_object('xp', 0, 'raison', 'ticket');
  end if;

  if v_partie.mode = 'ami' then
    -- L'adversaire : un autre compte, avec un ticket dans le même salon, commencé à peu près en même temps
    perform pg_advisory_xact_lock(hashtext('pass-salon:' || v_partie.salon));
    select * into v_adverse from pass_parties
    where salon = v_partie.salon and mode = 'ami' and discord_id <> v_moi
      and abs(extract(epoch from (commence_le - v_partie.commence_le))) < 600
    order by abs(extract(epoch from (commence_le - v_partie.commence_le)))
    limit 1;
    if not found then
      update pass_parties set termine_le = now(), victoire = v_vict where id = p_ticket;
      return json_build_object('xp', 0, 'raison', 'adversaire');
    end if;
    -- Autant de victoires que de joueurs dans l'équipe gagnante (la moitié du salon : 1 en 1v1, 2 en 2v2) :
    -- si elles sont déjà toutes déclarées, c'est une défaite
    if v_vict then
      select count(*) filter (where victoire is true and id <> p_ticket), count(*)
      into v_vict_salon, v_joueurs_salon
      from pass_parties
      where salon = v_partie.salon and mode = 'ami'
        and abs(extract(epoch from (commence_le - v_partie.commence_le))) < 600;
      if v_vict_salon >= greatest(1, v_joueurs_salon / 2) then v_vict := false; end if;
    end if;
    v_xp := case when v_vict then 150 else 50 end;
    v_plafond := 1500;
  else
    v_xp := case when v_vict then 100 else 30 end;
    v_plafond := 1000;
  end if;

  -- Plafond du jour
  insert into pass_progression (discord_id, saison_id) values (v_moi, v_saison.id)
  on conflict (discord_id, saison_id) do nothing;
  select * into v_prog from pass_progression where discord_id = v_moi and saison_id = v_saison.id for update;
  if v_partie.mode = 'ami' then
    v_deja := case when v_prog.jour_ami = v_jour then v_prog.xp_ami_jour else 0 end;
  else
    v_deja := case when v_prog.jour_ia = v_jour then v_prog.xp_ia_jour else 0 end;
  end if;
  if v_deja + v_xp > v_plafond then
    v_xp := greatest(0, v_plafond - v_deja);
    v_raison := 'plafond';
  end if;

  if v_partie.mode = 'ami' then
    update pass_progression set jour_ami = v_jour, xp_ami_jour = v_deja + v_xp
    where discord_id = v_moi and saison_id = v_saison.id;
  else
    update pass_progression set jour_ia = v_jour, xp_ia_jour = v_deja + v_xp
    where discord_id = v_moi and saison_id = v_saison.id;
  end if;

  update pass_parties set termine_le = now(), victoire = v_vict, xp = v_xp where id = p_ticket;
  v_total := coalesce(pass_ajouter_xp(v_moi, v_xp), v_prog.xp);

  -- Victoire contre l'Ombre : de l'or selon la difficulté (2 / 5 / 10), tant que le plafond d'XP du jour n'est pas atteint
  if v_partie.mode = 'ia' and v_vict and v_xp > 0 then
    v_or := case v_partie.difficulte when 'facile' then 2 when 'difficile' then 10 else 5 end;
    perform pass_donner_or(v_moi, v_or, 'Victoire contre l''Ombre');
  end if;

  return json_build_object(
    'xp', v_xp,
    'or', v_or,
    'raison', v_raison,
    'victoire', v_vict,
    'xp_total', v_total,
    'palier', least(v_saison.nb_paliers, v_total / v_saison.xp_par_palier)
  );
end;
$$;

-- Réclamer la récompense d'un palier atteint. Renvoie { type, nom, or, carte_image, rarete, deja_possedee, quantite }
create or replace function public.pass_reclamer(p_numero int, p_piste text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_saison saisons%rowtype;
  v_prog   pass_progression%rowtype;
  v_palier pass_paliers%rowtype;
  v_carte  cards%rowtype;
  v_or     int := 0;
  v_deja   boolean := false;
  v_nom    text;
  v_rarete text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_saison from saisons where id = pass_saison_en_cours();
  if not found then raise exception 'Aucune saison en cours.'; end if;

  perform pg_advisory_xact_lock(hashtext('pass:' || v_moi));

  select * into v_palier from pass_paliers
  where saison_id = v_saison.id and numero = p_numero and piste = p_piste;
  if not found then raise exception 'Palier inconnu.'; end if;

  select * into v_prog from pass_progression where discord_id = v_moi and saison_id = v_saison.id for update;
  if not found or v_prog.xp < p_numero * v_saison.xp_par_palier then
    raise exception 'Ce palier n''est pas encore atteint.';
  end if;
  if p_piste = 'premium' and not v_prog.premium then
    raise exception 'Débloque d''abord la piste premium.';
  end if;
  if (p_piste = 'gratuite' and p_numero = any(v_prog.reclames_gratuite))
     or (p_piste = 'premium' and p_numero = any(v_prog.reclames_premium)) then
    raise exception 'Récompense déjà réclamée.';
  end if;

  v_nom := v_palier.valeur ->> 'nom';

  if v_palier.type_recompense = 'or' then
    v_or := coalesce((v_palier.valeur ->> 'montant')::int, 0);

  elsif v_palier.type_recompense = 'carte' then
    select * into v_carte from cards where name = v_nom limit 1;
    if not found then raise exception 'Carte introuvable : %', v_nom; end if;
    if exists (select 1 from player_cards where discord_id = v_moi and card_id = v_carte.id) then
      v_deja := true;
      v_or := coalesce((v_palier.valeur ->> 'or_si_deja')::int, 200);
    else
      insert into player_cards (discord_id, card_id, source) values (v_moi, v_carte.id, 'recompense');
    end if;

  elsif v_palier.type_recompense = 'carte_rarete' then
    -- Une carte au hasard de cette rareté (les vraies cartes du catalogue, comme les boosters),
    -- d'abord parmi celles que le joueur n'a pas encore
    v_rarete := coalesce(v_palier.valeur ->> 'rarete', 'mythique');
    select c.* into v_carte from cards c
    where c.rarity = v_rarete and c.is_available and c.image is not null
      and c.description is distinct from 'Carte d''exemple'
      and not exists (select 1 from player_cards pc where pc.discord_id = v_moi and pc.card_id = c.id)
    order by random() limit 1;
    if found then
      insert into player_cards (discord_id, card_id, source) values (v_moi, v_carte.id, 'recompense');
    else
      -- Il les a toutes : un exemplaire de plus d'une d'elles (à recycler dans le grimoire)
      select c.* into v_carte from cards c
      where c.rarity = v_rarete and c.is_available and c.image is not null
        and c.description is distinct from 'Carte d''exemple'
      order by random() limit 1;
      v_deja := true;
      if not found then
        -- aucune carte de cette rareté dans le catalogue : de l'or, pour ne pas bloquer le palier
        v_nom := 'Carte ' || v_rarete;
        v_or := coalesce((v_palier.valeur ->> 'or_si_deja')::int, 200);
      elsif exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'player_cards' and column_name = 'quantite') then
        execute 'update public.player_cards set quantite = quantite + 1 where discord_id = $1 and card_id = $2'
          using v_moi, v_carte.id;
      else
        v_or := coalesce((v_palier.valeur ->> 'or_si_deja')::int, 200);
      end if;
    end if;

  elsif v_palier.type_recompense = 'booster' then
    -- Booster : ajouté aux boosters du joueur (SQL/boosters.sql), à ouvrir dans la Boutique
    select nom into v_nom from boosters where id = coalesce(v_palier.valeur ->> 'booster', 'cendres');
    if not found then raise exception 'Booster introuvable.'; end if;
    insert into player_boosters (discord_id, booster_id, quantite)
    values (v_moi, coalesce(v_palier.valeur ->> 'booster', 'cendres'), coalesce((v_palier.valeur ->> 'quantite')::int, 1))
    on conflict (discord_id, booster_id) do update set quantite = player_boosters.quantite + excluded.quantite;

  else
    -- Cosmétique : enregistré (son affichage viendra plus tard)
    insert into pass_cosmetiques (discord_id, type, nom, saison_id)
    values (v_moi, v_palier.type_recompense, coalesce(v_nom, 'Sans nom'), v_saison.id)
    on conflict do nothing;
  end if;

  perform pass_donner_or(v_moi, v_or,
    'Pass de saison : palier ' || p_numero || case when p_piste = 'premium' then ' (premium)' else '' end);

  if p_piste = 'gratuite' then
    update pass_progression set reclames_gratuite = array_append(reclames_gratuite, p_numero), maj_le = now()
    where discord_id = v_moi and saison_id = v_saison.id;
  else
    update pass_progression set reclames_premium = array_append(reclames_premium, p_numero), maj_le = now()
    where discord_id = v_moi and saison_id = v_saison.id;
  end if;

  return json_build_object(
    'type', v_palier.type_recompense,
    'nom', coalesce(v_carte.name, v_nom),
    'or', v_or,
    'carte_image', v_carte.image,
    'rarete', coalesce(v_carte.rarity, v_rarete),
    'deja_possedee', v_deja,
    'quantite', case when v_palier.type_recompense = 'booster' then coalesce((v_palier.valeur ->> 'quantite')::int, 1) end
  );
end;
$$;

-- Débloquer la piste premium : payée avec l'or du jeu, une fois par saison
create or replace function public.pass_debloquer_premium()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_saison saisons%rowtype;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_saison from saisons where id = pass_saison_en_cours();
  if not found then raise exception 'Aucune saison en cours.'; end if;

  perform pg_advisory_xact_lock(hashtext('pass:' || v_moi));

  if exists (select 1 from pass_progression where discord_id = v_moi and saison_id = v_saison.id and premium) then
    raise exception 'La piste premium est déjà débloquée.';
  end if;

  update wallets set balance = balance - v_saison.prix_premium
  where discord_id = v_moi and balance >= v_saison.prix_premium;
  if not found then
    raise exception 'Pas assez d''or : il en faut %.', v_saison.prix_premium;
  end if;
  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_saison.prix_premium, 'pass', 'Pass de saison : piste premium (' || v_saison.nom || ')');

  insert into pass_progression (discord_id, saison_id, premium) values (v_moi, v_saison.id, true)
  on conflict (discord_id, saison_id) do update set premium = true, maj_le = now();

  return json_build_object('prix', v_saison.prix_premium);
end;
$$;

-- Droits : les fonctions internes ne sont appelables par personne depuis le navigateur
revoke all on function public.pass_saison_en_cours()            from public, anon, authenticated;
revoke all on function public.pass_ajouter_xp(text, int)        from public, anon, authenticated;
revoke all on function public.pass_donner_or(text, int, text)   from public, anon, authenticated;
revoke all on function public.pass_commencer_partie(text, text, text) from public, anon;
revoke all on function public.pass_fin_partie(uuid, boolean)    from public, anon;
revoke all on function public.pass_reclamer(int, text)          from public, anon;
revoke all on function public.pass_debloquer_premium()          from public, anon;
grant execute on function public.pass_commencer_partie(text, text, text) to authenticated;
grant execute on function public.pass_fin_partie(uuid, boolean)    to authenticated;
grant execute on function public.pass_reclamer(int, text)          to authenticated;
grant execute on function public.pass_debloquer_premium()          to authenticated;


-- ---------------------------------------------------------------------
--  6. Saison 1 : « Les Cendres de Pravorn », 8 semaines à partir d'aujourd'hui
--     (nom provisoire ; pour le changer : update saisons set nom = '…' where id = …)
--     Relancer ce fichier ne recrée pas la saison : il remet seulement ses paliers à jour.
-- ---------------------------------------------------------------------
insert into public.saisons (nom, date_debut, date_fin, active, prix_premium)
select 'Les Cendres de Pravorn', date_trunc('day', now()), date_trunc('day', now()) + interval '56 days', true, 1500
where not exists (select 1 from public.saisons where nom = 'Les Cendres de Pravorn');

with s as (select id from public.saisons where nom = 'Les Cendres de Pravorn'),
paliers (numero, piste, type_recompense, valeur) as (values
  -- Équilibre (1 000 XP par palier ; une victoire contre l'IA = 100 XP, 1 000 XP par jour au plus) :
  --   gratuite : 2 425 or, 5 Boosters des Cendres + 1 Grand Booster, 5 cartes au hasard
  --              (1 éveillée, 3 mythiques, 1 légendaire), 2 titres
  --   premium (1 500 or) : 1 550 or (son prix revient en allant au bout), 3 Boosters + 3 Grands Boosters,
  --              1 transcendante, 2 légendaires, 2 mythiques, et tous les cosmétiques
  -- Piste gratuite : de l'or qui monte doucement, un booster tous les 5 paliers, une carte aux paliers ronds
  ( 1, 'gratuite', 'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  ( 2, 'gratuite', 'or',             '{"montant": 75}'),
  ( 3, 'gratuite', 'booster',        '{"booster": "cendres", "quantite": 1}'),
  ( 4, 'gratuite', 'or',             '{"montant": 75}'),
  ( 5, 'gratuite', 'carte_rarete',   '{"rarete": "eveillee", "or_si_deja": 100}'),
  ( 6, 'gratuite', 'or',             '{"montant": 100}'),
  ( 7, 'gratuite', 'or',             '{"montant": 100}'),
  ( 8, 'gratuite', 'booster',        '{"booster": "cendres", "quantite": 1}'),
  ( 9, 'gratuite', 'or',             '{"montant": 100}'),
  (10, 'gratuite', 'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  (11, 'gratuite', 'or',             '{"montant": 125}'),
  (12, 'gratuite', 'or',             '{"montant": 125}'),
  (13, 'gratuite', 'booster',        '{"booster": "cendres", "quantite": 1}'),
  (14, 'gratuite', 'or',             '{"montant": 125}'),
  (15, 'gratuite', 'titre',          '{"nom": "Pèlerin des Cendres"}'),
  (16, 'gratuite', 'or',             '{"montant": 150}'),
  (17, 'gratuite', 'or',             '{"montant": 150}'),
  (18, 'gratuite', 'booster',        '{"booster": "cendres", "quantite": 1}'),
  (19, 'gratuite', 'or',             '{"montant": 150}'),
  (20, 'gratuite', 'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  (21, 'gratuite', 'or',             '{"montant": 150}'),
  (22, 'gratuite', 'or',             '{"montant": 175}'),
  (23, 'gratuite', 'booster',        '{"booster": "cendres", "quantite": 1}'),
  (24, 'gratuite', 'or',             '{"montant": 175}'),
  (25, 'gratuite', 'booster',        '{"booster": "grand", "quantite": 1}'),
  (26, 'gratuite', 'or',             '{"montant": 200}'),
  (27, 'gratuite', 'or',             '{"montant": 200}'),
  (28, 'gratuite', 'carte_rarete',   '{"rarete": "legendaire", "or_si_deja": 400}'),
  (29, 'gratuite', 'or',             '{"montant": 250}'),
  (30, 'gratuite', 'titre',          '{"nom": "Vétéran de Pravorn"}'),
  -- Piste premium : une transcendante dès le palier 1, des Grands Boosters, les légendaires, tous les cosmétiques
  -- (le Maître du Jeu n'est plus dans le pass : il sort des boosters, SQL/boosters.sql)
  ( 1, 'premium',  'carte_rarete',   '{"rarete": "transcendante", "or_si_deja": 800}'),
  ( 2, 'premium',  'dos_carte',      '{"nom": "Dos des Cendres"}'),
  ( 3, 'premium',  'or',             '{"montant": 125}'),
  ( 4, 'premium',  'booster',        '{"booster": "cendres", "quantite": 1}'),
  ( 5, 'premium',  'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  ( 6, 'premium',  'or',             '{"montant": 125}'),
  ( 7, 'premium',  'cadre_portrait', '{"nom": "Cadre de braise"}'),
  ( 8, 'premium',  'or',             '{"montant": 150}'),
  ( 9, 'premium',  'booster',        '{"booster": "cendres", "quantite": 1}'),
  (10, 'premium',  'fond_plateau',   '{"nom": "Plateau du crépuscule"}'),
  (11, 'premium',  'or',             '{"montant": 150}'),
  (12, 'premium',  'titre',          '{"nom": "Porteur de Couronne"}'),
  (13, 'premium',  'or',             '{"montant": 150}'),
  (14, 'premium',  'booster',        '{"booster": "grand", "quantite": 1}'),
  (15, 'premium',  'carte_rarete',   '{"rarete": "legendaire", "or_si_deja": 400}'),
  (16, 'premium',  'or',             '{"montant": 150}'),
  (17, 'premium',  'dos_carte',      '{"nom": "Dos du Codex doré"}'),
  (18, 'premium',  'or',             '{"montant": 175}'),
  (19, 'premium',  'booster',        '{"booster": "cendres", "quantite": 1}'),
  (20, 'premium',  'cadre_portrait', '{"nom": "Cadre royal"}'),
  (21, 'premium',  'or',             '{"montant": 175}'),
  (22, 'premium',  'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  (23, 'premium',  'fond_plateau',   '{"nom": "Plateau des Couronnes"}'),
  (24, 'premium',  'booster',        '{"booster": "grand", "quantite": 1}'),
  (25, 'premium',  'carte_rarete',   '{"rarete": "legendaire", "or_si_deja": 400}'),
  (26, 'premium',  'or',             '{"montant": 175}'),
  (27, 'premium',  'or',             '{"montant": 175}'),
  (28, 'premium',  'titre',          '{"nom": "Main du Destin"}'),
  (29, 'premium',  'booster',        '{"booster": "grand", "quantite": 1}'),
  (30, 'premium',  'titre',          '{"nom": "Souverain des Cendres"}')
)
insert into public.pass_paliers (saison_id, numero, piste, type_recompense, valeur)
select s.id, p.numero, p.piste, p.type_recompense, p.valeur::jsonb from s, paliers p
on conflict (saison_id, numero, piste) do update
  set type_recompense = excluded.type_recompense, valeur = excluded.valeur;

notify pgrst, 'reload schema';


-- Vérification : la saison et ses cartes (une ligne « carte introuvable » = nom à corriger)
select s.nom, s.date_debut, s.date_fin, s.active, count(p.*) as paliers
from public.saisons s left join public.pass_paliers p on p.saison_id = s.id
group by s.id order by s.id;

select p.numero, p.piste, p.valeur ->> 'nom' as carte,
       case when c.id is null then 'carte introuvable' else 'ok' end as etat
from public.pass_paliers p left join public.cards c on c.name = p.valeur ->> 'nom'
where p.type_recompense = 'carte' order by p.piste, p.numero;

-- Cartes au hasard : combien de cartes de chaque rareté peuvent sortir (0 = de l'or à la place)
select p.numero, p.piste, p.valeur ->> 'rarete' as rarete,
       (select count(*) from public.cards c where c.rarity = p.valeur ->> 'rarete' and c.is_available
          and c.image is not null and c.description is distinct from 'Carte d''exemple') as cartes_possibles
from public.pass_paliers p
where p.type_recompense = 'carte_rarete' order by p.piste, p.numero;
