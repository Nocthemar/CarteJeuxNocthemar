-- =====================================================================
--  Boosters de cartes du Duel des Couronnes (Boutique > « Boosters »)
--
--  - boosters         : les types de booster (nom, prix en or du jeu, nombre de cartes, chances par rareté)
--  - booster_cartes   : les cartes qui peuvent sortir de chaque booster
--  - player_boosters  : les boosters pas encore ouverts de chaque joueur
--  - booster_ouvertures : l'historique des ouvertures (ce qui est sorti)
--
--  Le tirage se fait CÔTÉ SERVEUR (ouvrir_booster) : le navigateur ne fait que jouer l'animation
--  avec le résultat. Fonctions des joueurs :
--    acheter_booster(booster, quantite) -> paie en or, ajoute le booster aux boosters du joueur
--    ouvrir_booster(booster)            -> retire un booster, tire les cartes, les ajoute à la collection
--  Un doublon (carte déjà possédée, ou déjà tirée dans ce booster) est converti en or selon sa rareté,
--  et donne 10 XP de Pass de saison (si SQL/pass_saison.sql est installé).
--  Les boosters gagnés dans le Pass de saison arrivent dans player_boosters (pass_reclamer).
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_collection.sql, et AVANT de (re)lancer
--  pass_saison.sql (qui donne des boosters en récompense). Relançable.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.boosters (
  id        text primary key,
  nom       text not null,
  prix      int  not null check (prix >= 0),          -- en or du jeu
  nb_cartes int  not null default 3 check (nb_cartes between 1 and 10),
  image     text,                                      -- chemin depuis la racine du jeu
  en_vente  boolean not null default true,
  -- chances (en %) de chaque rareté, pour chaque carte tirée
  chances   jsonb not null default '{"commune": 60, "eveillee": 25, "mythique": 10, "legendaire": 4, "transcendante": 1}'
);

create table if not exists public.booster_cartes (
  booster_id text   not null references public.boosters(id) on delete cascade,
  card_id    bigint not null references public.cards(id) on delete cascade,
  primary key (booster_id, card_id)
);

create table if not exists public.player_boosters (
  discord_id text not null,
  booster_id text not null references public.boosters(id) on delete cascade,
  quantite   int  not null default 0 check (quantite >= 0),
  primary key (discord_id, booster_id)
);

create table if not exists public.booster_ouvertures (
  id         bigint generated always as identity primary key,
  discord_id text not null,
  booster_id text not null,
  cartes     jsonb not null,
  ouvert_le  timestamptz not null default now()
);
create index if not exists booster_ouvertures_joueur on public.booster_ouvertures (discord_id, ouvert_le desc);


-- ---------------------------------------------------------------------
--  2. Sécurité (RLS) : boosters et leurs cartes lisibles par tous ;
--     chacun lit ses boosters et ses ouvertures ; aucune écriture directe
-- ---------------------------------------------------------------------
alter table public.boosters           enable row level security;
alter table public.booster_cartes     enable row level security;
alter table public.player_boosters    enable row level security;
alter table public.booster_ouvertures enable row level security;

drop policy if exists "boosters lisibles par tous" on public.boosters;
create policy "boosters lisibles par tous" on public.boosters
  for select to anon, authenticated using (true);

drop policy if exists "cartes des boosters lisibles par tous" on public.booster_cartes;
create policy "cartes des boosters lisibles par tous" on public.booster_cartes
  for select to anon, authenticated using (true);

drop policy if exists "je lis mes boosters" on public.player_boosters;
create policy "je lis mes boosters" on public.player_boosters
  for select to authenticated using (discord_id = public.my_discord_id());

drop policy if exists "je lis mes ouvertures" on public.booster_ouvertures;
create policy "je lis mes ouvertures" on public.booster_ouvertures
  for select to authenticated using (discord_id = public.my_discord_id());

revoke insert, update, delete on public.boosters, public.booster_cartes,
  public.player_boosters, public.booster_ouvertures from anon, authenticated;


-- ---------------------------------------------------------------------
--  3. Fonctions
-- ---------------------------------------------------------------------

-- Acheter des boosters en boutique (or du jeu). Renvoie { booster, quantite, prix }
create or replace function public.acheter_booster(p_booster_id text, p_quantite int default 1)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi     text := my_discord_id();
  v_booster boosters%rowtype;
  v_total   int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if coalesce(p_quantite, 0) not between 1 and 10 then raise exception 'Quantité invalide.'; end if;

  select * into v_booster from boosters where id = p_booster_id;
  if not found or not v_booster.en_vente then raise exception 'Ce booster n''est pas en vente.'; end if;

  v_total := v_booster.prix * p_quantite;
  update wallets set balance = balance - v_total
  where discord_id = v_moi and balance >= v_total;
  if not found then raise exception 'Pas assez de pièces.'; end if;

  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_total, 'boutique_fun',
          v_booster.nom || case when p_quantite > 1 then ' ×' || p_quantite else '' end);

  insert into player_boosters (discord_id, booster_id, quantite) values (v_moi, v_booster.id, p_quantite)
  on conflict (discord_id, booster_id) do update set quantite = player_boosters.quantite + excluded.quantite;

  return json_build_object('booster', v_booster.nom, 'quantite', p_quantite, 'prix', v_total);
end;
$$;

-- Ouvrir un booster. Renvoie
-- { booster, cartes: [{ nom, image, rarete, nouvelle, or }], or, xp, meilleure_rarete, restants }
create or replace function public.ouvrir_booster(p_booster_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi      text := my_discord_id();
  v_booster  boosters%rowtype;
  v_raretes  text[] := array['commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
  v_or_doublon jsonb := '{"commune": 20, "eveillee": 40, "mythique": 80, "legendaire": 150, "transcendante": 300}';
  v_dispo    text[];        -- raretés qui ont au moins une carte dans ce booster
  v_total    numeric;
  v_tirage   numeric;
  v_rarete   text;
  v_idx      int;
  v_carte    cards%rowtype;
  v_tirees   bigint[] := '{}';
  v_resultat jsonb := '[]'::jsonb;
  v_nouvelle boolean;
  v_or       int;
  v_or_total int := 0;
  v_xp_total int := 0;
  v_meilleur int := 0;
  v_restants int;
  i          int;
  r          text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_booster from boosters where id = p_booster_id;
  if not found then raise exception 'Booster inconnu.'; end if;

  perform pg_advisory_xact_lock(hashtext('booster:' || v_moi));

  update player_boosters set quantite = quantite - 1
  where discord_id = v_moi and booster_id = p_booster_id and quantite > 0
  returning quantite into v_restants;
  if not found then raise exception 'Tu n''as pas de booster à ouvrir.'; end if;

  select array_agg(distinct c.rarity) into v_dispo
  from booster_cartes bc join cards c on c.id = bc.card_id
  where bc.booster_id = p_booster_id;
  if v_dispo is null then raise exception 'Ce booster ne contient encore aucune carte.'; end if;

  for i in 1 .. v_booster.nb_cartes loop
    -- 1. Rareté, selon les chances du booster
    select coalesce(sum((v_booster.chances ->> x)::numeric), 0) into v_total from unnest(v_raretes) x;
    v_tirage := random() * greatest(v_total, 1);
    v_rarete := 'commune';
    foreach r in array v_raretes loop
      v_tirage := v_tirage - coalesce((v_booster.chances ->> r)::numeric, 0);
      if v_tirage < 0 then v_rarete := r; exit; end if;
    end loop;

    -- 2. Pas de carte de cette rareté dans le booster : on descend d'une rareté (sinon on remonte)
    if not v_rarete = any(v_dispo) then
      v_idx := array_position(v_raretes, v_rarete);
      v_rarete := null;
      for j in reverse v_idx - 1 .. 1 loop
        if v_raretes[j] = any(v_dispo) then v_rarete := v_raretes[j]; exit; end if;
      end loop;
      if v_rarete is null then
        for j in v_idx + 1 .. array_length(v_raretes, 1) loop
          if v_raretes[j] = any(v_dispo) then v_rarete := v_raretes[j]; exit; end if;
        end loop;
      end if;
    end if;

    -- 3. Une carte au hasard de cette rareté
    select c.* into v_carte from booster_cartes bc join cards c on c.id = bc.card_id
    where bc.booster_id = p_booster_id and c.rarity = v_rarete
    order by random() limit 1;

    -- 4. Nouvelle carte, ou doublon converti en or (+ 10 XP de pass)
    v_nouvelle := not (v_carte.id = any(v_tirees))
      and not exists (select 1 from player_cards where discord_id = v_moi and card_id = v_carte.id);
    v_or := 0;
    if v_nouvelle then
      insert into player_cards (discord_id, card_id, source) values (v_moi, v_carte.id, 'recompense');
    else
      v_or := coalesce((v_or_doublon ->> v_rarete)::int, 20);
      v_or_total := v_or_total + v_or;
      v_xp_total := v_xp_total + 10;
    end if;
    v_tirees := v_tirees || v_carte.id;
    v_meilleur := greatest(v_meilleur, array_position(v_raretes, v_rarete));

    v_resultat := v_resultat || jsonb_build_object(
      'nom', v_carte.name, 'image', v_carte.image, 'rarete', v_rarete,
      'nouvelle', v_nouvelle, 'or', v_or);
  end loop;

  -- Or des doublons
  if v_or_total > 0 then
    update wallets set balance = balance + v_or_total where discord_id = v_moi;
    if not found then insert into wallets (discord_id, balance) values (v_moi, v_or_total); end if;
    insert into transactions (discord_id, amount, source, reason)
    values (v_moi, v_or_total, 'boutique_fun', v_booster.nom || ' : doublons convertis');
  end if;

  -- XP de pass des doublons (si le Pass de saison est installé)
  if v_xp_total > 0 and to_regprocedure('public.pass_ajouter_xp(text,integer)') is not null then
    execute 'select public.pass_ajouter_xp($1, $2)' using v_moi, v_xp_total;
  end if;

  insert into booster_ouvertures (discord_id, booster_id, cartes) values (v_moi, p_booster_id, v_resultat);

  return json_build_object(
    'booster', v_booster.nom,
    'cartes', v_resultat,
    'or', v_or_total,
    'xp', v_xp_total,
    'meilleure_rarete', v_raretes[v_meilleur],
    'restants', v_restants
  );
end;
$$;

revoke all on function public.acheter_booster(text, int) from public, anon;
revoke all on function public.ouvrir_booster(text)       from public, anon;
grant execute on function public.acheter_booster(text, int) to authenticated;
grant execute on function public.ouvrir_booster(text)       to authenticated;


-- ---------------------------------------------------------------------
--  4. Les boosters des Cendres : 1 carte (100 or), 3 cartes (250 or), 5 cartes (375 or), mêmes cartes et chances
--     Cartes : TOUTES les cartes du catalogue (Slime, Mange-cœur, Elfe des Neiges, Kaéliss, Dalek,
--     Seigneur des Marais, Maître du Jeu, Elfe des Neiges dorée…). Relancer ce fichier ajoute aussi
--     les nouvelles cartes créées depuis.
--     Pour ajouter une carte : insert into booster_cartes (booster_id, card_id)
--       select b.id, c.id from cards c, (values ('eclat'), ('cendres'), ('grand')) b(id) where c.name = '…';
-- ---------------------------------------------------------------------
insert into public.boosters (id, nom, prix, nb_cartes, image) values
  ('eclat',   'Éclat des Cendres',         100, 1, 'img/Booster/Booster.webp'),   -- 1 carte : 100 or la carte
  ('cendres', 'Booster des Cendres',       250, 3, 'img/Booster/Booster.webp'),   -- 3 cartes : ~83 or la carte
  ('grand',   'Grand Booster des Cendres', 375, 5, 'img/Booster/Booster.webp')    -- 5 cartes : 75 or la carte
on conflict (id) do update set nom = excluded.nom, prix = excluded.prix,
  nb_cartes = excluded.nb_cartes, image = excluded.image;

insert into public.booster_cartes (booster_id, card_id)
select b.id, c.id from public.cards c cross join (values ('eclat'), ('cendres'), ('grand')) as b(id)
-- Toutes les vraies cartes du catalogue (illustrées et disponibles), sauf la carte d'exemple
where c.is_available and c.image is not null and c.description is distinct from 'Carte d''exemple'
on conflict do nothing;
-- (le Seigneur des Marais et les Elfes des Neiges ne sont ajoutés que si leurs fichiers SQL
--  ont déjà été lancés ; sinon, ce sont ces fichiers-là qui les ajoutent aux boosters)

notify pgrst, 'reload schema';


-- Vérification : les cartes de chaque booster (3 boosters × 3 cartes, × 4 avec le Seigneur des Marais)
select b.nom as booster, c.name as carte, c.rarity as rarete
from public.booster_cartes bc
join public.boosters b on b.id = bc.booster_id
join public.cards c on c.id = bc.card_id
order by b.nom, c.rarity;
