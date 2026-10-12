-- =====================================================================
--  Échanges de cartes entre joueurs : le marché du grimoire (collection.html, JS/collection-echanges.js)
--
--  Un joueur propose un échange à un autre : les cartes qu'il donne et celles qu'il demande
--  (5 au plus de chaque côté, au moins une carte en tout). L'autre accepte ou refuse ;
--  celui qui propose peut annuler tant que ce n'est pas accepté.
--
--  Tout est vérifié CÔTÉ SERVEUR, au moment de proposer puis encore au moment d'accepter :
--    - chacun possède toujours les cartes qu'il donne ;
--    - l'échange se fait d'un seul bloc, ou pas du tout (grimoire plein, carte partie entre-temps…).
--  Une carte peut avoir plusieurs exemplaires (player_cards.quantite, SQL/doublons.sql) : on en donne un ;
--  la carte ne quitte la collection (et le deck du profil) que si c'était le dernier exemplaire.
--  Une carte qu'on a déjà ajoute un exemplaire ; une nouvelle se range seule dans la première pochette libre.
--
--  Fonctions des joueurs :
--    cartes_du_joueur(joueur)                            -> les cartes d'un joueur (pour choisir quoi demander)
--    proposer_echange(pour, donnees, demandees, message) -> id de la proposition
--    accepter_echange(id) / refuser_echange(id) / annuler_echange(id)
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_collection.sql. Relançable.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Table des propositions
-- ---------------------------------------------------------------------
-- Exemplaires d'une carte (voir SQL/doublons.sql)
alter table public.player_cards add column if not exists quantite int not null default 1 check (quantite >= 1);

create table if not exists public.echanges (
  id               bigint generated always as identity primary key,
  de               text not null references public.players(discord_id) on delete cascade,
  pour             text not null references public.players(discord_id) on delete cascade,
  cartes_donnees   bigint[] not null default '{}',   -- ce que « de » donne
  cartes_demandees bigint[] not null default '{}',   -- ce que « de » demande à « pour »
  message          text check (message is null or char_length(message) <= 200),
  statut           text not null default 'en_attente'
                   check (statut in ('en_attente', 'accepte', 'refuse', 'annule', 'impossible')),
  raison           text,                              -- pourquoi un échange est devenu impossible
  cree_le          timestamptz not null default now(),
  traite_le        timestamptz,
  check (de <> pour),
  check (cardinality(cartes_donnees) <= 5 and cardinality(cartes_demandees) <= 5),
  check (cardinality(cartes_donnees) + cardinality(cartes_demandees) >= 1)
);
create index if not exists echanges_pour on public.echanges (pour, statut);
create index if not exists echanges_de on public.echanges (de, statut);


-- ---------------------------------------------------------------------
--  2. Sécurité : chacun lit les échanges qui le concernent ; aucune écriture directe
-- ---------------------------------------------------------------------
alter table public.echanges enable row level security;

drop policy if exists "je lis mes échanges" on public.echanges;
create policy "je lis mes échanges" on public.echanges
  for select to authenticated using (de = public.my_discord_id() or pour = public.my_discord_id());

revoke insert, update, delete on public.echanges from anon, authenticated;
grant select on public.echanges to authenticated;


-- ---------------------------------------------------------------------
--  3. Fonctions
-- ---------------------------------------------------------------------

-- Les cartes d'un joueur (pour choisir quoi lui demander). La collection n'est sinon lisible
-- que par son propriétaire (RLS de player_cards) ; ici seulement la liste des cartes, sans leur rangement.
create or replace function public.cartes_du_joueur(p_discord_id text)
returns setof public.cards
language sql
stable
security definer
set search_path = public
as $$
  select c.* from player_cards pc join cards c on c.id = pc.card_id
  where pc.discord_id = p_discord_id and my_discord_id() is not null
  order by c.name;
$$;

-- Proposer un échange
create or replace function public.proposer_echange(p_pour text, p_donnees bigint[], p_demandees bigint[], p_message text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi      text := my_discord_id();
  v_donnees  bigint[] := coalesce((select array_agg(distinct x) from unnest(p_donnees) x where x is not null), '{}');
  v_demandes bigint[] := coalesce((select array_agg(distinct x) from unnest(p_demandees) x where x is not null), '{}');
  v_carte    text;
  v_id       bigint;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_pour is null or p_pour = v_moi then raise exception 'Choisis un autre joueur.'; end if;
  if not exists (select 1 from players where discord_id = p_pour) then raise exception 'Ce joueur est introuvable.'; end if;
  if cardinality(v_donnees) + cardinality(v_demandes) = 0 then raise exception 'Choisis au moins une carte.'; end if;
  if cardinality(v_donnees) > 5 or cardinality(v_demandes) > 5 then raise exception '5 cartes au plus de chaque côté.'; end if;
  if (select count(*) from echanges where de = v_moi and statut = 'en_attente') >= 10 then
    raise exception 'Tu as déjà 10 propositions en attente : attends des réponses ou annule-en.';
  end if;

  -- Je possède ce que je donne, il possède ce que je demande
  select c.name into v_carte from unnest(v_donnees) x join cards c on c.id = x
  where not exists (select 1 from player_cards where discord_id = v_moi and card_id = x) limit 1;
  if v_carte is not null then raise exception 'Tu ne possèdes pas « % ».', v_carte; end if;
  select c.name into v_carte from unnest(v_demandes) x join cards c on c.id = x
  where not exists (select 1 from player_cards where discord_id = p_pour and card_id = x) limit 1;
  if v_carte is not null then raise exception 'Ce joueur ne possède pas « % ».', v_carte; end if;

  insert into echanges (de, pour, cartes_donnees, cartes_demandees, message)
  values (v_moi, p_pour, v_donnees, v_demandes, nullif(btrim(left(p_message, 200)), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Accepter : tout est revérifié, puis les cartes changent de main d'un seul bloc
create or replace function public.accepter_echange(p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_e      echanges%rowtype;
  v_carte  text;
  v_raison text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_e from echanges where id = p_id for update;
  if not found or v_e.pour <> v_moi then raise exception 'Échange introuvable.'; end if;
  if v_e.statut <> 'en_attente' then raise exception 'Cet échange n''est plus en attente.'; end if;

  -- Les deux collections bougent ensemble : verrous dans un ordre fixe (pas d'interblocage)
  perform pg_advisory_xact_lock(hashtext('player_cards:' || least(v_e.de, v_e.pour)));
  perform pg_advisory_xact_lock(hashtext('player_cards:' || greatest(v_e.de, v_e.pour)));

  -- La situation a pu changer depuis la proposition
  select c.name into v_carte from unnest(v_e.cartes_donnees) x join cards c on c.id = x
  where not exists (select 1 from player_cards where discord_id = v_e.de and card_id = x) limit 1;
  if v_carte is not null then v_raison := format('« %s » n''est plus dans la collection de l''autre joueur.', v_carte); end if;
  if v_raison is null then
    select c.name into v_carte from unnest(v_e.cartes_demandees) x join cards c on c.id = x
    where not exists (select 1 from player_cards where discord_id = v_e.pour and card_id = x) limit 1;
    if v_carte is not null then v_raison := format('Tu n''as plus « %s ».', v_carte); end if;
  end if;
  if v_raison is not null then
    update echanges set statut = 'impossible', raison = v_raison, traite_le = now() where id = p_id;
    return json_build_object('ok', false, 'raison', v_raison);
  end if;

  -- Un exemplaire de chaque carte part (la carte quitte la collection, et le deck, si c'était le dernier)…
  -- (d'abord les derniers exemplaires, qui partent ; ensuite les autres, qui perdent un exemplaire)
  delete from player_cards where discord_id = v_e.de and card_id = any(v_e.cartes_donnees) and quantite = 1;
  update player_cards set quantite = quantite - 1 where discord_id = v_e.de and card_id = any(v_e.cartes_donnees);
  delete from player_cards where discord_id = v_e.pour and card_id = any(v_e.cartes_demandees) and quantite = 1;
  update player_cards set quantite = quantite - 1 where discord_id = v_e.pour and card_id = any(v_e.cartes_demandees);
  -- …et arrive chez son nouveau propriétaire : un exemplaire de plus, ou une nouvelle carte rangée
  -- dans la première pochette libre
  insert into player_cards (discord_id, card_id, source) select v_e.pour, x, 'echange' from unnest(v_e.cartes_donnees) x
  on conflict (discord_id, card_id) do update set quantite = player_cards.quantite + 1;
  insert into player_cards (discord_id, card_id, source) select v_e.de, x, 'echange' from unnest(v_e.cartes_demandees) x
  on conflict (discord_id, card_id) do update set quantite = player_cards.quantite + 1;

  update echanges set statut = 'accepte', traite_le = now() where id = p_id;
  -- Les autres propositions qui touchaient ces cartes ne tiennent plus forcément : elles seront revérifiées
  -- au moment où on voudra les accepter.
  return json_build_object('ok', true);
end;
$$;

create or replace function public.refuser_echange(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update echanges set statut = 'refuse', traite_le = now()
  where id = p_id and pour = my_discord_id() and statut = 'en_attente';
  if not found then raise exception 'Échange introuvable ou déjà traité.'; end if;
end;
$$;

create or replace function public.annuler_echange(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update echanges set statut = 'annule', traite_le = now()
  where id = p_id and de = my_discord_id() and statut = 'en_attente';
  if not found then raise exception 'Échange introuvable ou déjà traité.'; end if;
end;
$$;

revoke all on function public.cartes_du_joueur(text), public.proposer_echange(text, bigint[], bigint[], text),
  public.accepter_echange(bigint), public.refuser_echange(bigint), public.annuler_echange(bigint) from public, anon;
grant execute on function public.cartes_du_joueur(text), public.proposer_echange(text, bigint[], bigint[], text),
  public.accepter_echange(bigint), public.refuser_echange(bigint), public.annuler_echange(bigint) to authenticated;

notify pgrst, 'reload schema';
