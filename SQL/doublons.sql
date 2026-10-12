-- =====================================================================
--  Doublons : plusieurs exemplaires d'une même carte, et leur recyclage contre de l'or
--
--  - player_cards.quantite : le nombre d'exemplaires d'une carte (une seule pochette du grimoire,
--    marquée « ×N »). Les boosters ajoutent un exemplaire au lieu de convertir le doublon en or
--    (SQL/boosters.sql), les échanges en donnent ou en reçoivent un (SQL/echanges.sql).
--  - Recycler : un exemplaire en trop rapporte de l'or selon sa rareté, et 10 XP de Pass de saison
--    (si SQL/pass_saison.sql est installé). Le dernier exemplaire n'est jamais recyclé.
--       commune 20 · éveillée 40 · mythique 80 · légendaire 150 · transcendante 300
--
--  Fonctions des joueurs :
--    recycler_carte(carte, nombre) -> recycle « nombre » exemplaires en trop d'une carte
--    recycler_doublons()           -> recycle tous les exemplaires en trop de toutes ses cartes
--  Renvoient { exemplaires, or, xp } (et pour une carte : restants).
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_collection.sql ; puis relancer
--  boosters.sql et echanges.sql (qui tiennent compte des exemplaires). Relançable.
-- =====================================================================

-- 1. Les exemplaires
alter table public.player_cards add column if not exists quantite int not null default 1 check (quantite >= 1);

-- 2. Valeur d'un exemplaire recyclé, selon la rareté
create or replace function public.valeur_recyclage(p_rarete text)
returns int
language sql
immutable
as $$
  select coalesce(('{"commune": 20, "eveillee": 40, "mythique": 80, "legendaire": 150, "transcendante": 300}'::jsonb ->> p_rarete)::int, 20);
$$;

-- Or et XP de pass gagnés (commun aux deux fonctions)
create or replace function public.crediter_recyclage(p_moi text, p_or int, p_xp int, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_or > 0 then
    update wallets set balance = balance + p_or where discord_id = p_moi;
    if not found then insert into wallets (discord_id, balance) values (p_moi, p_or); end if;
    insert into transactions (discord_id, amount, source, reason) values (p_moi, p_or, 'boutique_fun', p_raison);
  end if;
  if p_xp > 0 and to_regprocedure('public.pass_ajouter_xp(text,integer)') is not null then
    execute 'select public.pass_ajouter_xp($1, $2)' using p_moi, p_xp;
  end if;
end;
$$;
revoke all on function public.crediter_recyclage(text, int, int, text) from public, anon, authenticated;

-- 3. Recycler des exemplaires d'une carte (on garde toujours le dernier)
create or replace function public.recycler_carte(p_card_id bigint, p_nombre int default 1)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi   text := my_discord_id();
  v_qte   int;
  v_carte cards%rowtype;
  v_or    int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if coalesce(p_nombre, 0) < 1 then raise exception 'Nombre invalide.'; end if;
  select quantite into v_qte from player_cards where discord_id = v_moi and card_id = p_card_id for update;
  if not found then raise exception 'Tu ne possèdes pas cette carte.'; end if;
  if p_nombre > v_qte - 1 then
    raise exception 'Tu peux recycler % exemplaire(s) au plus : le dernier est gardé.', greatest(v_qte - 1, 0);
  end if;
  select * into v_carte from cards where id = p_card_id;

  update player_cards set quantite = quantite - p_nombre where discord_id = v_moi and card_id = p_card_id;
  v_or := valeur_recyclage(v_carte.rarity) * p_nombre;
  perform crediter_recyclage(v_moi, v_or, 10 * p_nombre,
    format('Recyclage : %s ×%s', v_carte.name, p_nombre));
  return json_build_object('exemplaires', p_nombre, 'or', v_or, 'xp', 10 * p_nombre, 'restants', v_qte - p_nombre);
end;
$$;

-- 4. Recycler tous ses doublons d'un coup
create or replace function public.recycler_doublons()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_ex     int;
  v_or     int;
  v_cartes int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  perform pg_advisory_xact_lock(hashtext('player_cards:' || v_moi));
  select coalesce(sum(pc.quantite - 1), 0), coalesce(sum((pc.quantite - 1) * valeur_recyclage(c.rarity)), 0), count(*)
    into v_ex, v_or, v_cartes
  from player_cards pc join cards c on c.id = pc.card_id
  where pc.discord_id = v_moi and pc.quantite > 1;
  if v_ex = 0 then raise exception 'Tu n''as aucun doublon à recycler.'; end if;

  update player_cards set quantite = 1 where discord_id = v_moi and quantite > 1;
  perform crediter_recyclage(v_moi, v_or, 10 * v_ex, format('Recyclage de %s doublon(s)', v_ex));
  return json_build_object('cartes', v_cartes, 'exemplaires', v_ex, 'or', v_or, 'xp', 10 * v_ex);
end;
$$;

revoke all on function public.recycler_carte(bigint, int), public.recycler_doublons() from public, anon;
grant execute on function public.recycler_carte(bigint, int), public.recycler_doublons() to authenticated;

notify pgrst, 'reload schema';
