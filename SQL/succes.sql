-- =====================================================================
--  Succès du Duel des Couronnes (page succes.html, JS/succes.js)
--
--  - succes        : la liste des succès (catégorie, nom, objectif, récompense en or)
--  - player_succes : les succès dont le joueur a déjà réclamé la récompense (et sa vitrine de badges)
--  Rareté (commun, rare, epique, legendaire) et pourcentage de joueurs qui l’ont, comme sur Steam ;
--  jusqu’à 3 succès obtenus épinglés comme badges sur le profil (succes_vitrine, choisir_vitrine_succes).
--
--  La progression n'est PAS enregistrée à part : elle est calculée à chaque fois à partir des
--  données du jeu (duels du Pass de saison, rang classé, cartes, boosters ouverts, mode Histoire,
--  Marché). Les succès déjà mérités avant ce fichier sont donc débloqués tout de suite, et rien
--  ne change dans le code du duel.
--    mes_succes()            -> la liste avec la progression du joueur connecté
--    reclamer_succes(id)     -> vérifie l'objectif CÔTÉ SERVEUR, donne l'or (une seule fois)
--
--  Mesures possibles (colonne mesure) :
--    victoires, victoires_ia, victoires_joueurs (duels terminés, table pass_parties),
--    classe_victoires, cote (table rangs), cartes, exemplaires, legendaires, transcendantes,
--    collection (objectif 0 = toutes les cartes du catalogue), boosters, histoire
--    (objectif 0 = tous les niveaux), echanges (échanges acceptés + contrats ratifiés), ventes.
--  Pour ajouter un succès : une ligne de plus dans la partie 4, puis relancer le fichier.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS les autres fichiers du jeu. Relançable.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.succes (
  id          text primary key,
  categorie   text not null,
  nom         text not null,
  description text not null,
  icone       text not null default '✦',
  mesure      text not null,
  objectif    int  not null default 1 check (objectif >= 0),   -- 0 = « tout » (collection, histoire)
  recompense  int  not null default 0 check (recompense >= 0),  -- en or du jeu
  ordre       int  not null default 0
);

create table if not exists public.player_succes (
  discord_id text not null,
  succes_id  text not null references public.succes(id) on delete cascade,
  reclame_le timestamptz not null default now(),
  primary key (discord_id, succes_id)
);

alter table public.succes        enable row level security;
alter table public.player_succes enable row level security;
drop policy if exists "succès lisibles par tous" on public.succes;
create policy "succès lisibles par tous" on public.succes for select to anon, authenticated using (true);
drop policy if exists "je lis mes succès" on public.player_succes;
create policy "je lis mes succès" on public.player_succes
  for select to authenticated using (discord_id = public.my_discord_id());
revoke insert, update, delete on public.succes, public.player_succes from anon, authenticated;

-- Rareté du succès (comme sur Steam) : commun, rare, epique, legendaire — couleur du badge et
-- animation quand on l'obtient (CSS/succes-badges.css)
alter table public.succes add column if not exists rarete text not null default 'commun';
alter table public.succes drop constraint if exists succes_rarete_check;
alter table public.succes add constraint succes_rarete_check check (rarete in ('commun', 'rare', 'epique', 'legendaire'));

-- Vitrine du profil : jusqu'à 3 succès obtenus, épinglés comme badges (place 1, 2 ou 3)
alter table public.player_succes add column if not exists vitrine smallint check (vitrine between 1 and 3);
create unique index if not exists player_succes_vitrine on public.player_succes (discord_id, vitrine) where vitrine is not null;


-- ---------------------------------------------------------------------
--  2. Les chiffres d'un joueur (une table absente compte pour 0)
-- ---------------------------------------------------------------------
create or replace function public.succes_stats(p_discord_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s     jsonb := '{}'::jsonb;
  n     int;
  m     int;
  leg   int;
  trans int;
begin
  -- Duels terminés (Pass de saison) : toutes victoires, contre l'Ombre, contre des joueurs
  if to_regclass('public.pass_parties') is not null then
    execute 'select count(*) filter (where victoire), count(*) filter (where victoire and mode = ''ia'')
             from public.pass_parties where discord_id = $1 and termine_le is not null'
      into n, m using p_discord_id;
    s := s || jsonb_build_object('victoires', n, 'victoires_ia', m, 'victoires_joueurs', n - m);
  end if;

  -- Classé : victoires en classé et cote
  if to_regclass('public.rangs') is not null then
    execute 'select coalesce(max(victoires), 0), coalesce(max(cote), 0) from public.rangs where discord_id = $1'
      into n, m using p_discord_id;
    s := s || jsonb_build_object('classe_victoires', n, 'cote', m);
  end if;

  -- Cartes : différentes, exemplaires, légendaires, transcendantes
  select count(*), coalesce(sum(pc.quantite), 0),
         count(*) filter (where c.rarity = 'legendaire'),
         count(*) filter (where c.rarity = 'transcendante')
    into n, m, leg, trans
    from player_cards pc join cards c on c.id = pc.card_id
    where pc.discord_id = p_discord_id;
  s := s || jsonb_build_object('cartes', n, 'exemplaires', m, 'legendaires', leg, 'transcendantes', trans);

  -- Collection : cartes du catalogue possédées (mêmes cartes que la page « Toutes les cartes »)
  select count(*) into n from cards c
    where c.is_available and c.image is not null and c.description is distinct from 'Carte d''exemple'
      and exists (select 1 from player_cards pc where pc.discord_id = p_discord_id and pc.card_id = c.id);
  s := s || jsonb_build_object('collection', n);

  -- Boosters ouverts
  if to_regclass('public.booster_ouvertures') is not null then
    execute 'select count(*) from public.booster_ouvertures where discord_id = $1' into n using p_discord_id;
    s := s || jsonb_build_object('boosters', n);
  end if;

  -- Mode Histoire : niveaux terminés
  if to_regclass('public.histoire_progression') is not null then
    execute 'select count(*) from public.histoire_progression where discord_id = $1' into n using p_discord_id;
    s := s || jsonb_build_object('histoire', n);
  end if;

  -- Marché : échanges acceptés et contrats ratifiés (proposés ou reçus), ventes conclues
  n := 0;
  if to_regclass('public.echanges') is not null then
    execute 'select count(*) from public.echanges where statut = ''accepte'' and (de = $1 or pour = $1)'
      into m using p_discord_id;
    n := n + m;
  end if;
  if to_regclass('public.contrats') is not null then
    execute 'select count(*) from public.contrats where statut = ''ratifie'' and (de = $1 or pour = $1)'
      into m using p_discord_id;
    n := n + m;
  end if;
  s := s || jsonb_build_object('echanges', n);
  if to_regclass('public.annonces') is not null then
    execute 'select count(*) from public.annonces where statut = ''conclue'' and type = ''vente'' and auteur = $1'
      into n using p_discord_id;
    s := s || jsonb_build_object('ventes', n);
  end if;

  return s;
end;
$$;
revoke all on function public.succes_stats(text) from public, anon, authenticated;   -- interne


-- Objectif réel d'un succès : 0 = « tout » (toutes les cartes du catalogue, tous les niveaux)
create or replace function public.succes_objectif(p_mesure text, p_objectif int)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare n int;
begin
  if p_objectif > 0 then return p_objectif; end if;
  if p_mesure = 'collection' then
    select count(*) into n from cards c
      where c.is_available and c.image is not null and c.description is distinct from 'Carte d''exemple';
    return greatest(n, 1);
  end if;
  if p_mesure = 'histoire' and to_regclass('public.histoire_niveaux') is not null then
    execute 'select count(*) from public.histoire_niveaux' into n;
    return greatest(n, 1);
  end if;
  return 1;
end;
$$;
revoke all on function public.succes_objectif(text, int) from public, anon, authenticated;   -- interne


-- ---------------------------------------------------------------------
--  3. Fonctions des joueurs
-- ---------------------------------------------------------------------

-- Comme sur Steam : la part des joueurs (ceux qui ont au moins une carte) qui ont obtenu chaque succès
-- { id: pourcentage (0 à 100, une décimale) }
create or replace function public.succes_pourcentages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(s.id, round(100.0 * coalesce(o.n, 0) / t.total, 1)), '{}'::jsonb)
  from succes s
  cross join (select greatest(count(distinct discord_id), 1) as total from player_cards) t
  left join (select succes_id, count(*) as n from player_succes group by succes_id) o on o.succes_id = s.id;
$$;
revoke all on function public.succes_pourcentages() from public, anon, authenticated;   -- interne

-- La liste des succès avec la progression du joueur connecté
-- [{ id, categorie, nom, description, icone, rarete, objectif, recompense, progression, atteint,
--    reclame, reclame_le, vitrine, pourcentage }]
create or replace function public.mes_succes()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi   text := my_discord_id();
  v_stats jsonb;
  v_pct   jsonb;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  v_stats := succes_stats(v_moi);
  v_pct := succes_pourcentages();
  return coalesce((
    select json_agg(json_build_object(
      'id', s.id, 'categorie', s.categorie, 'nom', s.nom, 'description', s.description, 'icone', s.icone,
      'rarete', s.rarete, 'objectif', o.objectif, 'recompense', s.recompense,
      'progression', least(coalesce((v_stats ->> s.mesure)::int, 0), o.objectif),
      'atteint', coalesce((v_stats ->> s.mesure)::int, 0) >= o.objectif,
      'reclame', ps.succes_id is not null, 'reclame_le', ps.reclame_le, 'vitrine', ps.vitrine,
      'pourcentage', coalesce((v_pct ->> s.id)::numeric, 0)
    ) order by s.ordre, s.id)
    from succes s
    cross join lateral (select succes_objectif(s.mesure, s.objectif) as objectif) o
    left join player_succes ps on ps.discord_id = v_moi and ps.succes_id = s.id
  ), '[]'::json);
end;
$$;

-- Les badges épinglés sur le profil d'un joueur : PUBLIC (visible par tous les visiteurs du profil)
-- [{ id, nom, description, icone, rarete, reclame_le, pourcentage }] dans l'ordre de la vitrine
create or replace function public.succes_vitrine(p_discord_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_pct jsonb := succes_pourcentages();
begin
  return coalesce((
    select json_agg(json_build_object(
      'id', s.id, 'nom', s.nom, 'description', s.description, 'icone', s.icone, 'rarete', s.rarete,
      'reclame_le', ps.reclame_le, 'pourcentage', coalesce((v_pct ->> s.id)::numeric, 0)
    ) order by ps.vitrine)
    from player_succes ps join succes s on s.id = ps.succes_id
    where ps.discord_id = p_discord_id and ps.vitrine is not null
  ), '[]'::json);
end;
$$;

-- Choisir les badges de sa vitrine : jusqu'à 3 succès OBTENUS, dans l'ordre donné ([] = vitrine vide)
create or replace function public.choisir_vitrine_succes(p_ids text[])
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  i     int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  p_ids := coalesce(p_ids, '{}');
  if cardinality(p_ids) > 3 then raise exception 'Trois badges au plus sur ton profil.'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then raise exception 'Badge en double.'; end if;
  if exists (select 1 from unnest(p_ids) x
             where not exists (select 1 from player_succes where discord_id = v_moi and succes_id = x)) then
    raise exception 'Tu ne peux épingler que des succès obtenus.';
  end if;

  update player_succes set vitrine = null where discord_id = v_moi and vitrine is not null;
  for i in 1 .. cardinality(p_ids) loop
    update player_succes set vitrine = i where discord_id = v_moi and succes_id = p_ids[i];
  end loop;
  return succes_vitrine(v_moi);
end;
$$;

-- Réclamer la récompense d'un succès atteint. Renvoie { id, nom, description, icone, rarete, recompense, pourcentage }
create or replace function public.reclamer_succes(p_succes_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_succes succes%rowtype;
  v_valeur int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  perform pg_advisory_xact_lock(hashtext('succes:' || v_moi));

  select * into v_succes from succes where id = p_succes_id;
  if not found then raise exception 'Succès inconnu.'; end if;
  if exists (select 1 from player_succes where discord_id = v_moi and succes_id = p_succes_id) then
    raise exception 'Tu as déjà réclamé ce succès.';
  end if;

  v_valeur := coalesce((succes_stats(v_moi) ->> v_succes.mesure)::int, 0);
  if v_valeur < succes_objectif(v_succes.mesure, v_succes.objectif) then
    raise exception 'Ce succès n''est pas encore atteint.';
  end if;

  insert into player_succes (discord_id, succes_id) values (v_moi, p_succes_id);

  if v_succes.recompense > 0 then
    update wallets set balance = balance + v_succes.recompense where discord_id = v_moi;
    if not found then
      insert into wallets (discord_id, balance) values (v_moi, v_succes.recompense);
    end if;
    -- Historique des pièces (table partagée avec le bot) : ignoré s'il refuse cette source
    begin
      insert into transactions (discord_id, amount, source, reason)
      values (v_moi, v_succes.recompense, 'succes', 'Succès : ' || v_succes.nom);
    exception when others then null;
    end;
  end if;

  return json_build_object('id', v_succes.id, 'nom', v_succes.nom, 'description', v_succes.description,
    'icone', v_succes.icone, 'rarete', v_succes.rarete, 'recompense', v_succes.recompense,
    'pourcentage', coalesce((succes_pourcentages() ->> v_succes.id)::numeric, 0));
end;
$$;

revoke all on function public.mes_succes()            from public, anon;
revoke all on function public.reclamer_succes(text)   from public, anon;
grant execute on function public.mes_succes()          to authenticated;
grant execute on function public.reclamer_succes(text) to authenticated;
revoke all on function public.succes_vitrine(text)               from public;
revoke all on function public.choisir_vitrine_succes(text[])     from public, anon;
grant execute on function public.succes_vitrine(text)             to anon, authenticated;   -- profils publics
grant execute on function public.choisir_vitrine_succes(text[])   to authenticated;


-- ---------------------------------------------------------------------
--  4. Les succès (relancer le fichier met à jour noms, objectifs et récompenses)
-- ---------------------------------------------------------------------
--  Rareté : commun (premiers pas), rare, epique, legendaire (les plus grands exploits)
insert into public.succes (id, categorie, nom, description, icone, mesure, objectif, recompense, ordre, rarete) values
  -- Duels
  ('premier-sang',      'Duels', 'Premier sang',        'Remporte ton premier duel.',                         '⚔',  'victoires',          1,   50,  10, 'commun'),
  ('guerrier',          'Duels', 'Guerrier aguerri',    'Remporte 10 duels.',                                 '⚔',  'victoires',         10,  150,  11, 'rare'),
  ('champion',          'Duels', 'Champion des arènes', 'Remporte 50 duels.',                                 '⚔',  'victoires',         50,  400,  12, 'epique'),
  ('legende-vivante',   'Duels', 'Légende vivante',     'Remporte 100 duels.',                                '⚔',  'victoires',        100,  800,  13, 'legendaire'),
  ('chasseur-ombre',    'Duels', 'Chasseur d''Ombre',   'Bats l''Ombre 10 fois.',                             '🌑', 'victoires_ia',      10,  150,  14, 'rare'),
  ('premier-rival',     'Duels', 'Premier rival',       'Bats un autre joueur en ligne.',                     '🤝', 'victoires_joueurs',  1,  100,  15, 'commun'),
  ('terreur-salons',    'Duels', 'Terreur des salons',  'Bats 10 joueurs en ligne.',                          '🤝', 'victoires_joueurs', 10,  300,  16, 'epique'),
  -- Classé
  ('classe-1',          'Classé', 'Entrée dans l''arène', 'Remporte une partie classée.',                     '🏆', 'classe_victoires',   1,  100,  20, 'commun'),
  ('classe-10',         'Classé', 'Gladiateur',           'Remporte 10 parties classées.',                    '🏆', 'classe_victoires',  10,  300,  21, 'epique'),
  ('rang-argent',       'Classé', 'Rang d''Argent',       'Atteins le rang d''Argent (1 100 points).',        '🥈', 'cote',            1100,  200,  22, 'rare'),
  ('rang-or',           'Classé', 'Rang d''Or',           'Atteins le rang d''Or (1 250 points).',            '🥇', 'cote',            1250,  400,  23, 'epique'),
  -- Collection
  ('collection-5',      'Collection', 'Apprenti collectionneur', 'Possède 5 cartes différentes.',             '🃏', 'cartes',             5,  100,  30, 'commun'),
  ('collection-10',     'Collection', 'Collectionneur',          'Possède 10 cartes différentes.',            '🃏', 'cartes',            10,  250,  31, 'rare'),
  ('collection-complete','Collection', 'Le grimoire complet',     'Possède toutes les cartes du jeu.',         '📖', 'collection',         0, 1000,  32, 'legendaire'),
  ('legendaire',        'Collection', 'Touché par la légende',   'Possède une carte légendaire.',             '🔴', 'legendaires',        1,  150,  33, 'rare'),
  ('transcendante',     'Collection', 'Au-delà du voile',        'Possède une carte transcendante.',          '🌟', 'transcendantes',     1,  300,  34, 'epique'),
  -- Boosters
  ('booster-1',         'Boosters', 'Première porte',     'Ouvre ton premier booster.',                       '🚪', 'boosters',           1,   50,  40, 'commun'),
  ('booster-10',        'Boosters', 'Briseur de portes',  'Ouvre 10 boosters.',                               '🚪', 'boosters',          10,  200,  41, 'rare'),
  ('booster-50',        'Boosters', 'Mille éclats',       'Ouvre 50 boosters.',                               '🚪', 'boosters',          50,  500,  42, 'epique'),
  -- Histoire
  ('histoire-1',        'Histoire', 'Premiers pas',       'Termine un niveau du mode Histoire.',              '🗺', 'histoire',           1,  100,  50, 'commun'),
  ('histoire-5',        'Histoire', 'Voyageur',           'Termine 5 niveaux du mode Histoire.',              '🗺', 'histoire',           5,  250,  51, 'rare'),
  ('histoire-complete', 'Histoire', 'Le récit achevé',    'Termine tous les niveaux du mode Histoire.',       '👑', 'histoire',           0, 1000,  52, 'legendaire'),
  -- Marché
  ('echange-1',         'Marché', 'Poignée de main',      'Conclus un échange ou un contrat avec un joueur.', '📜', 'echanges',           1,  100,  60, 'commun'),
  ('echange-10',        'Marché', 'Négociant',            'Conclus 10 échanges ou contrats.',                 '📜', 'echanges',          10,  300,  61, 'epique'),
  ('vente-1',           'Marché', 'Première vente',       'Vends une carte sur le tableau de la guilde.',     '💰', 'ventes',             1,  100,  62, 'rare')
on conflict (id) do update set categorie = excluded.categorie, nom = excluded.nom, description = excluded.description,
  icone = excluded.icone, mesure = excluded.mesure, objectif = excluded.objectif,
  recompense = excluded.recompense, ordre = excluded.ordre, rarete = excluded.rarete;

notify pgrst, 'reload schema';
