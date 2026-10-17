-- =====================================================================
--  Booster gratuit de la boutique : 3 cartes offertes toutes les 10 minutes
--  (Boutique > « Boosters », au-dessus des boosters en vente ; JS/boutique-boosters.js)
--
--  - le booster « gratuit » (Offrande du Voyageur) : mêmes cartes et mêmes chances que le
--    Booster des Cendres, jamais en vente
--  - player_booster_gratuit : quand chaque joueur a ouvert son dernier booster gratuit
--
--  Le délai est vérifié CÔTÉ SERVEUR : changer l'heure de son ordinateur ou appeler la fonction
--  en boucle ne donne rien de plus.
--    booster_gratuit_etat()    -> { secondes } : temps avant le prochain (0 = disponible)
--    ouvrir_booster_gratuit()  -> comme ouvrir_booster, plus { secondes } (prochain dans 600 s)
--
--  À exécuter dans Supabase > SQL Editor, APRÈS boosters.sql (qui crée ouvrir_booster). Relançable.
--  Pour changer le délai : modifier « interval '10 minutes' » et « 600 » ci-dessous, puis relancer.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Le booster gratuit (pas en vente : il ne s'achète pas et n'apparaît pas dans l'étal)
-- ---------------------------------------------------------------------
insert into public.boosters (id, nom, prix, nb_cartes, image, en_vente) values
  ('gratuit', 'Offrande du Voyageur', 0, 3, 'img/Booster/Booster.webp', false)
on conflict (id) do update set nom = excluded.nom, prix = excluded.prix, nb_cartes = excluded.nb_cartes,
  image = excluded.image, en_vente = false;

-- Mêmes chances et mêmes cartes que le Booster des Cendres
update public.boosters g set chances = c.chances
from public.boosters c where g.id = 'gratuit' and c.id = 'cendres';

insert into public.booster_cartes (booster_id, card_id)
select 'gratuit', card_id from public.booster_cartes where booster_id = 'cendres'
on conflict do nothing;


-- ---------------------------------------------------------------------
--  2. Le dernier booster gratuit de chaque joueur
-- ---------------------------------------------------------------------
create table if not exists public.player_booster_gratuit (
  discord_id text primary key,
  dernier    timestamptz not null default now()
);
alter table public.player_booster_gratuit enable row level security;
drop policy if exists "je lis mon booster gratuit" on public.player_booster_gratuit;
create policy "je lis mon booster gratuit" on public.player_booster_gratuit
  for select to authenticated using (discord_id = public.my_discord_id());
revoke insert, update, delete on public.player_booster_gratuit from anon, authenticated;


-- ---------------------------------------------------------------------
--  3. Fonctions
-- ---------------------------------------------------------------------

-- Temps (en secondes) avant le prochain booster gratuit : 0 = disponible maintenant
create or replace function public.booster_gratuit_etat()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi     text := my_discord_id();
  v_dernier timestamptz;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select dernier into v_dernier from player_booster_gratuit where discord_id = v_moi;
  return json_build_object('secondes',
    greatest(0, ceil(extract(epoch from (v_dernier + interval '10 minutes') - now())))::int);
end;
$$;

-- Ouvrir le booster gratuit (si les 10 minutes sont passées)
create or replace function public.ouvrir_booster_gratuit()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi      text := my_discord_id();
  v_resultat jsonb;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  perform pg_advisory_xact_lock(hashtext('booster-gratuit:' || v_moi));

  -- Réclame le booster : seulement si le dernier date d'au moins 10 minutes (ou s'il n'y en a jamais eu)
  insert into player_booster_gratuit (discord_id, dernier) values (v_moi, now())
  on conflict (discord_id) do update set dernier = now()
  where player_booster_gratuit.dernier <= now() - interval '10 minutes';
  if not found then raise exception 'Ton prochain booster gratuit n''est pas encore prêt.'; end if;

  -- Le booster rejoint les boosters du joueur, puis s'ouvre aussitôt (même tirage que les autres)
  insert into player_boosters (discord_id, booster_id, quantite) values (v_moi, 'gratuit', 1)
  on conflict (discord_id, booster_id) do update set quantite = player_boosters.quantite + 1;
  v_resultat := ouvrir_booster('gratuit')::jsonb;

  return (v_resultat || jsonb_build_object('secondes', 600))::json;
end;
$$;

revoke all on function public.booster_gratuit_etat()   from public, anon;
revoke all on function public.ouvrir_booster_gratuit() from public, anon;
grant execute on function public.booster_gratuit_etat()   to authenticated;
grant execute on function public.ouvrir_booster_gratuit() to authenticated;

notify pgrst, 'reload schema';


-- Vérification : le booster gratuit et ses cartes
select b.nom as booster, b.nb_cartes, b.en_vente, count(bc.card_id) as cartes_possibles
from public.boosters b left join public.booster_cartes bc on bc.booster_id = b.id
where b.id = 'gratuit' group by b.id;
