-- =====================================================================
--  Le commerce entre joueurs (marche.html > onglet « Échanges », JS/marche-echanges.js ; ventes : JS/marche.js)
--
--  1. Les CONTRATS (remplacent les lettres de SQL/echanges.sql) : un contrat entre deux joueurs,
--     chaque côté peut mettre des cartes (6 au plus), de l'or et des objets / cosmétiques (4 au plus).
--     Chacun « appose son sceau » quand l'offre lui convient. Toute modification du contrat brise
--     les deux sceaux (il faut revalider). Quand les deux sceaux sont posés, le contrat est ratifié :
--     tout change de main d'un seul bloc, après une dernière vérification.
--  2. La LISTE DE SOUHAITS : les cartes qu'un joueur recherche (visible des autres joueurs).
--  3. Le TABLEAU DE GUILDE (marché public) : des annonces de vente (« je vends cette carte pour N or »)
--     et de recherche (« je cherche cette carte, je paie N or ») ; un autre joueur les conclut d'un clic.
--
--  Protection des favorites : le dernier exemplaire d'une carte du deck du profil (les 5 favorites)
--  ne peut pas être échangé ni vendu ; il faut d'abord la retirer des favorites.
--  Tout est vérifié CÔTÉ SERVEUR (possession, or, objets déjà possédés…), à chaque étape.
--
--  Fonctions des joueurs :
--    objets_du_joueur(joueur)                                  -> ses objets et cosmétiques (inventory)
--    ouvrir_contrat(pour, cartes_de, cartes_pour, or_de, or_pour, objets_de, objets_pour, message) -> id
--    modifier_contrat(id, …mêmes champs…)                      -> nouvelle version (sceaux brisés)
--    apposer_sceau(id, version)                                -> { ratifie, raison }
--    rompre_contrat(id)
--    basculer_souhait(carte)                                   -> true si ajoutée, false si retirée
--    publier_annonce(type, carte, prix, message)               -> id
--    retirer_annonce(id) / conclure_annonce(id)
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_collection.sql, doublons.sql et echanges.sql.
--  Relançable. Les lettres d'échange encore en attente deviennent des contrats ouverts.
-- =====================================================================


-- ---------------------------------------------------------------------
--  0. Source « echange » dans l'historique des pièces (transactions.source)
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
                   where t.typname = v_type and e.enumlabel = 'echange') then
      execute format('alter type public.%I add value %L', v_type, 'echange');
    end if;
  else
    for c in
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.transactions'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%source%'
        and pg_get_constraintdef(oid) not ilike '%''echange''%'
    loop
      execute format('alter table public.transactions drop constraint %I', c.conname);
      execute format('alter table public.transactions add constraint %I %s', c.conname,
                     regexp_replace(c.def, 'ARRAY\[', 'ARRAY[''echange''::text, '));
    end loop;
  end if;
end $$;

-- Exemplaires d'une carte (SQL/doublons.sql)
alter table public.player_cards add column if not exists quantite int not null default 1 check (quantite >= 1);


-- ---------------------------------------------------------------------
--  1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.contrats (
  id          bigint generated always as identity primary key,
  de          text not null references public.players(discord_id) on delete cascade,   -- qui l'a rédigé
  pour        text not null references public.players(discord_id) on delete cascade,
  cartes_de   bigint[] not null default '{}',   -- ce que « de » donne
  cartes_pour bigint[] not null default '{}',   -- ce que « pour » donne
  or_de       int not null default 0 check (or_de between 0 and 1000000),
  or_pour     int not null default 0 check (or_pour between 0 and 1000000),
  objets_de   text[] not null default '{}',     -- objets / cosmétiques (items.id) que « de » donne
  objets_pour text[] not null default '{}',
  message     text check (message is null or char_length(message) <= 200),
  statut      text not null default 'ouvert' check (statut in ('ouvert', 'ratifie', 'rompu', 'impossible')),
  sceau_de    boolean not null default false,
  sceau_pour  boolean not null default false,
  version     int not null default 1,
  modifie_par text,                             -- qui a modifié le contrat en dernier (sceaux brisés)
  raison      text,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  ratifie_le  timestamptz,
  check (de <> pour),
  check (cardinality(cartes_de) <= 6 and cardinality(cartes_pour) <= 6),
  check (cardinality(objets_de) <= 4 and cardinality(objets_pour) <= 4)
);
create index if not exists contrats_de on public.contrats (de, statut);
create index if not exists contrats_pour on public.contrats (pour, statut);

create table if not exists public.souhaits (
  discord_id text   not null references public.players(discord_id) on delete cascade,
  card_id    bigint not null references public.cards(id) on delete cascade,
  cree_le    timestamptz not null default now(),
  primary key (discord_id, card_id)
);

create table if not exists public.annonces (
  id         bigint generated always as identity primary key,
  auteur     text   not null references public.players(discord_id) on delete cascade,
  type       text   not null check (type in ('vente', 'recherche')),
  card_id    bigint not null references public.cards(id) on delete cascade,
  prix       int    not null check (prix between 1 and 1000000),
  message    text check (message is null or char_length(message) <= 140),
  statut     text   not null default 'ouverte' check (statut in ('ouverte', 'conclue', 'retiree', 'impossible')),
  conclu_par text,
  raison     text,
  cree_le    timestamptz not null default now(),
  conclu_le  timestamptz
);
create index if not exists annonces_ouvertes on public.annonces (statut, cree_le desc);
create index if not exists annonces_auteur on public.annonces (auteur, statut);


-- ---------------------------------------------------------------------
--  2. Sécurité : contrats lisibles par leurs deux joueurs ; souhaits et annonces lisibles par tous
--     les joueurs connectés ; aucune écriture directe
-- ---------------------------------------------------------------------
alter table public.contrats enable row level security;
alter table public.souhaits enable row level security;
alter table public.annonces enable row level security;

drop policy if exists "je lis mes contrats" on public.contrats;
create policy "je lis mes contrats" on public.contrats
  for select to authenticated using (de = public.my_discord_id() or pour = public.my_discord_id());
drop policy if exists "souhaits lisibles" on public.souhaits;
create policy "souhaits lisibles" on public.souhaits for select to authenticated using (true);
drop policy if exists "annonces lisibles" on public.annonces;
create policy "annonces lisibles" on public.annonces for select to authenticated using (true);

revoke insert, update, delete on public.contrats, public.souhaits, public.annonces from anon, authenticated;
grant select on public.contrats, public.souhaits, public.annonces to authenticated;


-- ---------------------------------------------------------------------
--  3. Fonctions internes (pas appelables depuis le navigateur)
-- ---------------------------------------------------------------------

-- Ce qu'un joueur donne est-il possible ? Renvoie null, ou la raison (en français)
create or replace function public.commerce_verifier(p_joueur text, p_cartes bigint[], p_or int, p_objets text[])
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nom   text;
  v_qui   text := coalesce((select username from players where discord_id = p_joueur), 'Un joueur');
begin
  -- Les cartes : possédées, et pas le dernier exemplaire d'une favorite
  select c.name into v_nom from unnest(p_cartes) x join cards c on c.id = x
  where not exists (select 1 from player_cards where discord_id = p_joueur and card_id = x) limit 1;
  if v_nom is not null then return format('%s n''a plus « %s ».', v_qui, v_nom); end if;
  select c.name into v_nom from unnest(p_cartes) x join cards c on c.id = x
  join player_cards pc on pc.discord_id = p_joueur and pc.card_id = x
  where pc.quantite = 1 and exists (select 1 from player_deck_cards d where d.discord_id = p_joueur and d.card_id = x) limit 1;
  if v_nom is not null then
    return format('« %s » est une favorite de %s (dernier exemplaire) : elle doit d''abord quitter les favorites.', v_nom, v_qui);
  end if;
  -- L'or
  if coalesce(p_or, 0) > 0 and coalesce((select balance from wallets where discord_id = p_joueur), 0) < p_or then
    return format('%s n''a pas assez d''or (%s demandés).', v_qui, p_or);
  end if;
  -- Les objets
  select x into v_nom from unnest(p_objets) x
  where not exists (select 1 from inventory where discord_id = p_joueur and item_id::text = x) limit 1;
  if v_nom is not null then
    return format('%s n''a plus l''objet « %s ».', v_qui, coalesce((select name from items where id::text = v_nom), v_nom));
  end if;
  return null;
end;
$$;

-- Un objet que le receveur possède déjà ? Renvoie null, ou la raison
create or replace function public.commerce_objets_deja(p_receveur text, p_objets text[])
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format('%s a déjà « %s ».', coalesce((select username from players where discord_id = p_receveur), 'Ce joueur'),
                coalesce((select name from items where id::text = x), x))
  from unnest(p_objets) x
  where exists (select 1 from inventory where discord_id = p_receveur and item_id::text = x)
  limit 1;
$$;

-- Fait passer un exemplaire de chaque carte, l'or et les objets de « de » à « pour »
create or replace function public.commerce_transferer(p_de text, p_pour text, p_cartes bigint[], p_or int, p_objets text[], p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x text;
begin
  -- Cartes : d'abord les derniers exemplaires (qui partent), ensuite les autres (un de moins)
  delete from player_cards where discord_id = p_de and card_id = any(p_cartes) and quantite = 1;
  update player_cards set quantite = quantite - 1 where discord_id = p_de and card_id = any(p_cartes);
  insert into player_cards (discord_id, card_id, source) select p_pour, c, 'echange' from unnest(p_cartes) c
  on conflict (discord_id, card_id) do update set quantite = player_cards.quantite + 1;

  -- Or
  if coalesce(p_or, 0) > 0 then
    update wallets set balance = balance - p_or where discord_id = p_de and balance >= p_or;
    if not found then raise exception 'Pas assez d''or.'; end if;
    update wallets set balance = balance + p_or where discord_id = p_pour;
    if not found then insert into wallets (discord_id, balance) values (p_pour, p_or); end if;
    insert into transactions (discord_id, amount, source, reason) values
      (p_de, -p_or, 'echange', p_raison),
      (p_pour, p_or, 'echange', p_raison);
  end if;

  -- Objets : la ligne d'inventaire change de propriétaire ; l'objet n'est plus équipé par l'ancien
  foreach x in array p_objets loop
    update inventory set discord_id = p_pour
    where ctid = (select ctid from inventory where discord_id = p_de and item_id::text = x limit 1);
    update players set banner_item_id = case when banner_item_id::text = x then null else banner_item_id end,
                       title_item_id  = case when title_item_id::text  = x then null else title_item_id  end,
                       theme_item_id  = case when theme_item_id::text  = x then null else theme_item_id  end
    where discord_id = p_de;
  end loop;
end;
$$;

-- Nettoie et contrôle les champs d'un contrat ; lève une erreur si quelque chose cloche
create or replace function public.commerce_normaliser(
  p_cartes bigint[], p_objets text[], p_or int, out cartes bigint[], out objets text[], out montant int)
language plpgsql
immutable
as $$
begin
  cartes := coalesce((select array_agg(distinct x) from unnest(p_cartes) x where x is not null), '{}');
  objets := coalesce((select array_agg(distinct x) from unnest(p_objets) x where x is not null and x <> ''), '{}');
  montant := greatest(0, coalesce(p_or, 0));
  if cardinality(cartes) > 6 then raise exception '6 cartes au plus de chaque côté.'; end if;
  if cardinality(objets) > 4 then raise exception '4 objets au plus de chaque côté.'; end if;
  if montant > 1000000 then raise exception 'Un million d''or au plus.'; end if;
end;
$$;


-- ---------------------------------------------------------------------
--  4. Contrats
-- ---------------------------------------------------------------------

-- Les objets et cosmétiques d'un joueur (pour choisir quoi lui demander)
create or replace function public.objets_du_joueur(p_discord_id text)
returns setof public.items
language sql
stable
security definer
set search_path = public
as $$
  select i.* from inventory inv join items i on i.id = inv.item_id
  where inv.discord_id = p_discord_id and my_discord_id() is not null
  order by i.name;
$$;

create or replace function public.ouvrir_contrat(
  p_pour text, p_cartes_de bigint[], p_cartes_pour bigint[], p_or_de int, p_or_pour int,
  p_objets_de text[], p_objets_pour text[], p_message text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  a record; b record;
  v_raison text;
  v_id bigint;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_pour is null or p_pour = v_moi then raise exception 'Choisis un autre joueur.'; end if;
  if not exists (select 1 from players where discord_id = p_pour) then raise exception 'Ce joueur est introuvable.'; end if;
  select * into a from commerce_normaliser(p_cartes_de, p_objets_de, p_or_de);
  select * into b from commerce_normaliser(p_cartes_pour, p_objets_pour, p_or_pour);
  if cardinality(a.cartes) + cardinality(b.cartes) + cardinality(a.objets) + cardinality(b.objets) = 0 then
    raise exception 'Mets au moins une carte ou un objet dans le contrat.';
  end if;
  if (select count(*) from contrats where (de = v_moi or pour = v_moi) and statut = 'ouvert') >= 15 then
    raise exception 'Tu as déjà 15 contrats ouverts : ratifie-les ou romps-en.';
  end if;
  v_raison := coalesce(commerce_verifier(v_moi, a.cartes, a.montant, a.objets), commerce_verifier(p_pour, b.cartes, 0, b.objets),
                       commerce_objets_deja(p_pour, a.objets), commerce_objets_deja(v_moi, b.objets));
  if v_raison is not null then raise exception '%', v_raison; end if;

  insert into contrats (de, pour, cartes_de, cartes_pour, or_de, or_pour, objets_de, objets_pour, message, modifie_par)
  values (v_moi, p_pour, a.cartes, b.cartes, a.montant, b.montant, a.objets, b.objets, nullif(btrim(left(p_message, 200)), ''), v_moi)
  returning id into v_id;
  return v_id;
end;
$$;

-- Modifier un contrat ouvert (l'un ou l'autre des deux joueurs) : les deux sceaux se brisent
create or replace function public.modifier_contrat(
  p_id bigint, p_cartes_de bigint[], p_cartes_pour bigint[], p_or_de int, p_or_pour int,
  p_objets_de text[], p_objets_pour text[], p_message text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_c contrats%rowtype;
  a record; b record;
  v_raison text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_c from contrats where id = p_id for update;
  if not found or v_moi not in (v_c.de, v_c.pour) then raise exception 'Contrat introuvable.'; end if;
  if v_c.statut <> 'ouvert' then raise exception 'Ce contrat n''est plus ouvert.'; end if;
  select * into a from commerce_normaliser(p_cartes_de, p_objets_de, p_or_de);
  select * into b from commerce_normaliser(p_cartes_pour, p_objets_pour, p_or_pour);
  if cardinality(a.cartes) + cardinality(b.cartes) + cardinality(a.objets) + cardinality(b.objets) = 0 then
    raise exception 'Mets au moins une carte ou un objet dans le contrat.';
  end if;
  v_raison := coalesce(commerce_verifier(v_c.de, a.cartes, 0, a.objets), commerce_verifier(v_c.pour, b.cartes, 0, b.objets),
                       commerce_objets_deja(v_c.pour, a.objets), commerce_objets_deja(v_c.de, b.objets));
  if v_raison is not null then raise exception '%', v_raison; end if;

  update contrats set cartes_de = a.cartes, cartes_pour = b.cartes, or_de = a.montant, or_pour = b.montant,
    objets_de = a.objets, objets_pour = b.objets,
    message = coalesce(nullif(btrim(left(p_message, 200)), ''), message),
    sceau_de = false, sceau_pour = false, version = version + 1, modifie_par = v_moi, raison = null, maj_le = now()
  where id = p_id;
  return v_c.version + 1;
end;
$$;

-- Apposer son sceau (sur la version qu'on a lue) ; le second sceau ratifie le contrat
create or replace function public.apposer_sceau(p_id bigint, p_version int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_c contrats%rowtype;
  v_raison text;
  v_texte text;
  v_sceau_de boolean;
  v_sceau_pour boolean;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_c from contrats where id = p_id for update;
  if not found or v_moi not in (v_c.de, v_c.pour) then raise exception 'Contrat introuvable.'; end if;
  if v_c.statut <> 'ouvert' then raise exception 'Ce contrat n''est plus ouvert.'; end if;
  if v_c.version <> p_version then raise exception 'Le contrat vient d''être modifié : relis-le avant d''apposer ton sceau.'; end if;

  -- Ce que je donne doit être possible
  v_raison := case when v_moi = v_c.de then commerce_verifier(v_moi, v_c.cartes_de, v_c.or_de, v_c.objets_de)
                   else commerce_verifier(v_moi, v_c.cartes_pour, v_c.or_pour, v_c.objets_pour) end;
  if v_raison is not null then raise exception '%', v_raison; end if;

  v_sceau_de := v_c.sceau_de or v_moi = v_c.de;
  v_sceau_pour := v_c.sceau_pour or v_moi = v_c.pour;
  update contrats set sceau_de = v_sceau_de, sceau_pour = v_sceau_pour, maj_le = now() where id = p_id;
  if not (v_sceau_de and v_sceau_pour) then
    return json_build_object('ratifie', false);
  end if;

  -- Les deux sceaux : ratification. Les deux collections bougent ensemble (verrous dans un ordre fixe)
  perform pg_advisory_xact_lock(hashtext('player_cards:' || least(v_c.de, v_c.pour)));
  perform pg_advisory_xact_lock(hashtext('player_cards:' || greatest(v_c.de, v_c.pour)));
  v_raison := coalesce(commerce_verifier(v_c.de, v_c.cartes_de, v_c.or_de, v_c.objets_de),
                       commerce_verifier(v_c.pour, v_c.cartes_pour, v_c.or_pour, v_c.objets_pour),
                       commerce_objets_deja(v_c.pour, v_c.objets_de), commerce_objets_deja(v_c.de, v_c.objets_pour));
  if v_raison is not null then
    -- Rien ne bouge : les sceaux se brisent, le contrat reste ouvert pour être corrigé
    update contrats set sceau_de = false, sceau_pour = false, raison = v_raison, maj_le = now() where id = p_id;
    return json_build_object('ratifie', false, 'raison', v_raison);
  end if;

  v_texte := format('Contrat n°%s ratifié', p_id);
  perform commerce_transferer(v_c.de, v_c.pour, v_c.cartes_de, v_c.or_de, v_c.objets_de, v_texte);
  perform commerce_transferer(v_c.pour, v_c.de, v_c.cartes_pour, v_c.or_pour, v_c.objets_pour, v_texte);
  update contrats set statut = 'ratifie', ratifie_le = now(), maj_le = now(), raison = null where id = p_id;
  return json_build_object('ratifie', true);
end;
$$;

create or replace function public.rompre_contrat(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update contrats set statut = 'rompu', maj_le = now(), modifie_par = my_discord_id()
  where id = p_id and statut = 'ouvert' and my_discord_id() in (de, pour);
  if not found then raise exception 'Contrat introuvable ou déjà clos.'; end if;
end;
$$;


-- ---------------------------------------------------------------------
--  5. Liste de souhaits
-- ---------------------------------------------------------------------
create or replace function public.basculer_souhait(p_card_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  delete from souhaits where discord_id = v_moi and card_id = p_card_id;
  if found then return false; end if;
  if (select count(*) from souhaits where discord_id = v_moi) >= 30 then raise exception '30 souhaits au plus.'; end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Carte introuvable.'; end if;
  insert into souhaits (discord_id, card_id) values (v_moi, p_card_id);
  return true;
end;
$$;


-- ---------------------------------------------------------------------
--  6. Le tableau de guilde : annonces de vente et de recherche (14 jours)
-- ---------------------------------------------------------------------
create or replace function public.publier_annonce(p_type text, p_card_id bigint, p_prix int, p_message text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_raison text;
  v_id bigint;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_type not in ('vente', 'recherche') then raise exception 'Type d''annonce inconnu.'; end if;
  if coalesce(p_prix, 0) < 1 or p_prix > 1000000 then raise exception 'Le prix doit être entre 1 et 1 000 000 d''or.'; end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Carte introuvable.'; end if;
  if (select count(*) from annonces where auteur = v_moi and statut = 'ouverte' and cree_le > now() - interval '14 days') >= 10 then
    raise exception 'Tu as déjà 10 annonces sur le tableau : retires-en une.';
  end if;
  if exists (select 1 from annonces where auteur = v_moi and statut = 'ouverte' and type = p_type and card_id = p_card_id
             and cree_le > now() - interval '14 days') then
    raise exception 'Tu as déjà une annonce pour cette carte.';
  end if;
  v_raison := case when p_type = 'vente' then commerce_verifier(v_moi, array[p_card_id], 0, '{}')
                   else commerce_verifier(v_moi, '{}', p_prix, '{}') end;
  if v_raison is not null then raise exception '%', v_raison; end if;
  insert into annonces (auteur, type, card_id, prix, message)
  values (v_moi, p_type, p_card_id, p_prix, nullif(btrim(left(p_message, 140)), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.retirer_annonce(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update annonces set statut = 'retiree', conclu_le = now() where id = p_id and auteur = my_discord_id() and statut = 'ouverte';
  if not found then raise exception 'Annonce introuvable ou déjà close.'; end if;
end;
$$;

-- Conclure une annonce : acheter (vente) ou fournir la carte recherchée (recherche)
create or replace function public.conclure_annonce(p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_a annonces%rowtype;
  v_vendeur text; v_acheteur text;
  v_raison text;
  v_nom text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_a from annonces where id = p_id for update;
  if not found then raise exception 'Annonce introuvable.'; end if;
  if v_a.statut <> 'ouverte' or v_a.cree_le < now() - interval '14 days' then raise exception 'Cette annonce n''est plus sur le tableau.'; end if;
  if v_a.auteur = v_moi then raise exception 'C''est ta propre annonce.'; end if;

  v_vendeur  := case when v_a.type = 'vente' then v_a.auteur else v_moi end;
  v_acheteur := case when v_a.type = 'vente' then v_moi else v_a.auteur end;
  perform pg_advisory_xact_lock(hashtext('player_cards:' || least(v_vendeur, v_acheteur)));
  perform pg_advisory_xact_lock(hashtext('player_cards:' || greatest(v_vendeur, v_acheteur)));

  -- L'auteur peut-il encore tenir son annonce ? Sinon elle quitte le tableau
  v_raison := case when v_a.type = 'vente' then commerce_verifier(v_a.auteur, array[v_a.card_id], 0, '{}')
                   else commerce_verifier(v_a.auteur, '{}', v_a.prix, '{}') end;
  if v_raison is not null then
    update annonces set statut = 'impossible', raison = v_raison, conclu_le = now() where id = p_id;
    return json_build_object('ok', false, 'raison', v_raison);
  end if;
  -- Et moi, ai-je l'or (achat) ou la carte (recherche) ?
  v_raison := case when v_a.type = 'vente' then commerce_verifier(v_moi, '{}', v_a.prix, '{}')
                   else commerce_verifier(v_moi, array[v_a.card_id], 0, '{}') end;
  if v_raison is not null then return json_build_object('ok', false, 'raison', v_raison); end if;

  select name into v_nom from cards where id = v_a.card_id;
  perform commerce_transferer(v_vendeur, v_acheteur, array[v_a.card_id], 0, '{}', format('Tableau de guilde : « %s »', v_nom));
  perform commerce_transferer(v_acheteur, v_vendeur, '{}', v_a.prix, '{}', format('Tableau de guilde : « %s »', v_nom));
  update annonces set statut = 'conclue', conclu_par = v_moi, conclu_le = now() where id = p_id;
  return json_build_object('ok', true, 'carte', v_nom, 'prix', v_a.prix, 'type', v_a.type);
end;
$$;


-- ---------------------------------------------------------------------
--  7. Droits
-- ---------------------------------------------------------------------
revoke all on function public.commerce_verifier(text, bigint[], int, text[]),
  public.commerce_objets_deja(text, text[]),
  public.commerce_transferer(text, text, bigint[], int, text[], text) from public, anon, authenticated;
revoke all on function public.objets_du_joueur(text),
  public.ouvrir_contrat(text, bigint[], bigint[], int, int, text[], text[], text),
  public.modifier_contrat(bigint, bigint[], bigint[], int, int, text[], text[], text),
  public.apposer_sceau(bigint, int), public.rompre_contrat(bigint), public.basculer_souhait(bigint),
  public.publier_annonce(text, bigint, int, text), public.retirer_annonce(bigint), public.conclure_annonce(bigint) from public, anon;
grant execute on function public.objets_du_joueur(text),
  public.ouvrir_contrat(text, bigint[], bigint[], int, int, text[], text[], text),
  public.modifier_contrat(bigint, bigint[], bigint[], int, int, text[], text[], text),
  public.apposer_sceau(bigint, int), public.rompre_contrat(bigint), public.basculer_souhait(bigint),
  public.publier_annonce(text, bigint, int, text), public.retirer_annonce(bigint), public.conclure_annonce(bigint) to authenticated;


-- ---------------------------------------------------------------------
--  8. Les lettres d'échange encore en attente (SQL/echanges.sql) deviennent des contrats ouverts
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.echanges') is not null then
    insert into public.contrats (de, pour, cartes_de, cartes_pour, message, modifie_par, cree_le)
    select e.de, e.pour, e.cartes_donnees[1:6], e.cartes_demandees[1:6], e.message, e.de, e.cree_le
    from public.echanges e
    where e.statut = 'en_attente';
    update public.echanges set statut = 'annule', raison = 'Devenu un contrat du marché', traite_le = now()
    where statut = 'en_attente';
  end if;
end $$;

notify pgrst, 'reload schema';
