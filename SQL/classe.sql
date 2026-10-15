-- =====================================================================
--  Le mode en ligne CLASSÉ du Duel des Couronnes (jeu-cartes.html > « En ligne », JS/jeu-cartes.js)
--
--  - rangs           : la cote de chaque joueur (1 000 au départ), ses victoires et défaites en classé
--  - file_classee    : les joueurs qui cherchent une partie ; quand deux joueurs de cote proche s'y
--                      trouvent, le serveur leur donne un salon (code) : le plus ancien est l'hôte
--  - parties_classees: les résultats déclarés par chaque joueur ; la cote bouge quand les deux
--                      déclarations concordent (une victoire et une défaite)
--  - salons_classes  : qui joue dans quel salon classé, dans quelle équipe (2v2), et ses points gagnés
--
--  2v2 (camp partagé) : quand quatre joueurs de cote proche cherchent, le serveur forme deux équipes
--  équilibrées (le 1er et le 4e de cote contre le 2e et le 3e) ; le plus ancien dans la file est l'hôte.
--  La cote d'une équipe est la moyenne de ses deux joueurs ; les deux joueurs gagnent (ou perdent)
--  les mêmes points. La partie est comptée dès qu'un joueur de chaque équipe a déclaré son résultat
--  et que les deux concordent.
--
--  Fonctions des joueurs :
--    chercher_classee(mode)          -> { salon, role, equipe } si la partie est trouvée, sinon { attente: true }
--                                       (mode : '1v1' ou '2v2' ; equipe : 'A' ou 'B' en 2v2)
--                                       (à rappeler toutes les 2 à 3 secondes : l'écart de cote accepté
--                                       grandit avec l'attente)
--    quitter_classee()               -> sort de la file
--    resultat_classe(salon, victoire)-> { ok, cote, ecart } quand la partie est comptée, sinon { attente: true }
--
--  Cote : système Elo (K = 32). Paliers affichés : Bronze < 1 100 ≤ Argent < 1 250 ≤ Or < 1 400
--  ≤ Platine < 1 550 ≤ Diamant < 1 700 ≤ Couronne.
--  Le duel se joue dans le navigateur de l'hôte ; contre la triche sur les résultats :
--    - deux victoires déclarées = LITIGE : défaite pour les deux camps (mentir ne sauve pas une défaite) ;
--    - un camp qui ne déclare rien (onglet fermé…) : au bout de 10 minutes, la déclaration de l'autre
--      camp est comptée (classe_regler_en_suspens, lancée à chaque recherche de partie).
--  Le 1v1 utilise aussi salons_classes (équipe A = l'hôte, B = l'invité) : on sait qui jouait contre qui.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_collection.sql. Relançable.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.rangs (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  cote       int  not null default 1000,
  victoires  int  not null default 0,
  defaites   int  not null default 0,
  maj_le     timestamptz not null default now()
);

create table if not exists public.file_classee (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  mode       text not null default '1v1' check (mode in ('1v1', '2v2')),
  cote       int  not null default 1000,
  entree     timestamptz not null default now(),
  vu_le      timestamptz not null default now(),   -- dernier appel (un joueur parti sort de la file)
  salon      text,                                   -- attribué quand l'adversaire est trouvé
  role       text check (role in ('hote', 'invite'))
);

create table if not exists public.parties_classees (
  id         bigint generated always as identity primary key,
  salon      text not null,
  discord_id text not null,
  victoire   boolean not null,
  compte     boolean not null default false,          -- la cote a été mise à jour
  cree_le    timestamptz not null default now(),
  unique (salon, discord_id)
);
create index if not exists parties_classees_salon on public.parties_classees (salon);

-- 2v2 : l'équipe de chaque joueur dans la file
alter table public.file_classee add column if not exists equipe text check (equipe in ('A', 'B'));

create table if not exists public.salons_classes (
  salon      text not null,
  discord_id text not null,
  mode       text not null default '2v2',
  equipe     text,
  ecart      int,                                     -- points gagnés (ou perdus) quand la partie est comptée
  cree_le    timestamptz not null default now(),
  primary key (salon, discord_id)
);


-- ---------------------------------------------------------------------
--  2. Sécurité : les rangs sont lisibles par tous (classement) ; le reste passe par les fonctions
-- ---------------------------------------------------------------------
alter table public.rangs enable row level security;
alter table public.file_classee enable row level security;
alter table public.parties_classees enable row level security;
alter table public.salons_classes enable row level security;

drop policy if exists "rangs lisibles" on public.rangs;
create policy "rangs lisibles" on public.rangs for select to anon, authenticated using (true);
drop policy if exists "je lis ma place dans la file" on public.file_classee;
create policy "je lis ma place dans la file" on public.file_classee
  for select to authenticated using (discord_id = public.my_discord_id());

revoke insert, update, delete on public.rangs, public.file_classee, public.parties_classees from anon, authenticated;
revoke select on public.parties_classees from anon, authenticated;
revoke all on public.salons_classes from anon, authenticated;
grant select on public.rangs to anon, authenticated;
grant select on public.file_classee to authenticated;


-- ---------------------------------------------------------------------
--  3. Fonctions
-- ---------------------------------------------------------------------

-- Chercher (ou continuer à chercher) une partie classée
create or replace function public.chercher_classee(p_mode text default '1v1')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_moi_f  file_classee%rowtype;
  v_adv    file_classee%rowtype;
  v_cote   int;
  v_ecart  int;
  v_code   text;
  v_lettres text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_autres text[];
  v_nb     int;
  v_role   text;
  v_equipe text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_mode not in ('1v1', '2v2') then raise exception 'Mode de partie classée inconnu.'; end if;

  -- Un seul appariement à la fois : verrou commun à toute la file
  perform pg_advisory_xact_lock(hashtext('file_classee'));
  -- Les joueurs partis sortent de la file : sans appel depuis 20 secondes s'ils cherchent encore ;
  -- au bout de 3 heures s'ils ont été appariés (leur partie est finie depuis longtemps)
  delete from file_classee where (salon is null and vu_le < now() - interval '20 seconds')
    or (salon is not null and vu_le < now() - interval '3 hours');
  delete from salons_classes where cree_le < now() - interval '7 days';
  delete from parties_classees where cree_le < now() - interval '30 days';
  -- Les parties dont un seul camp a déclaré son résultat depuis 10 minutes sont comptées
  perform classe_regler_en_suspens();

  insert into rangs (discord_id) values (v_moi) on conflict do nothing;
  select cote into v_cote from rangs where discord_id = v_moi;

  insert into file_classee (discord_id, mode, cote) values (v_moi, p_mode, v_cote)
  on conflict (discord_id) do update set vu_le = now(), mode = excluded.mode,
    -- une nouvelle recherche après une partie : on repart de zéro
    entree = case when file_classee.salon is not null and file_classee.vu_le < now() - interval '60 seconds' then now() else file_classee.entree end,
    salon = case when file_classee.vu_le < now() - interval '60 seconds' then null else file_classee.salon end,
    role = case when file_classee.vu_le < now() - interval '60 seconds' then null else file_classee.role end,
    equipe = case when file_classee.vu_le < now() - interval '60 seconds' then null else file_classee.equipe end;
  select * into v_moi_f from file_classee where discord_id = v_moi;

  -- Déjà apparié (par l'autre joueur) : le salon
  if v_moi_f.salon is not null then
    return json_build_object('salon', v_moi_f.salon, 'role', v_moi_f.role, 'equipe', v_moi_f.equipe);
  end if;

  -- L'écart de cote accepté grandit avec l'attente : 100, puis +25 toutes les 5 secondes (500 au plus)
  v_ecart := least(500, 100 + 25 * floor(extract(epoch from (now() - v_moi_f.entree)) / 5)::int);

  -- 2v2 : trois autres joueurs de cote proche, les plus anciens dans la file
  if p_mode = '2v2' then
    select array_agg(t.discord_id order by t.entree) into v_autres from (
      select discord_id, entree from file_classee
      where discord_id <> v_moi and mode = '2v2' and salon is null and abs(cote - v_cote) <= v_ecart
      order by entree limit 3
    ) t;
    v_nb := coalesce(array_length(v_autres, 1), 0);
    if v_nb < 3 then
      return json_build_object('attente', true, 'ecart', v_ecart, 'trouves', v_nb);
    end if;
    loop
      v_code := '';
      for i in 1..5 loop v_code := v_code || substr(v_lettres, 1 + floor(random() * length(v_lettres))::int, 1); end loop;
      exit when not exists (select 1 from file_classee where salon = v_code)
        and not exists (select 1 from parties_classees where salon = v_code)
        and not exists (select 1 from salons_classes where salon = v_code);
    end loop;
    -- Équipes équilibrées : le 1er et le 4e de cote contre le 2e et le 3e
    update file_classee f set salon = v_code, role = 'invite',
      equipe = case when q.rang in (1, 4) then 'A' else 'B' end
    from (
      select discord_id, row_number() over (order by cote desc, entree) as rang
      from file_classee where discord_id = any (v_autres || v_moi)
    ) q
    where f.discord_id = q.discord_id;
    -- L'hôte : le plus ancien dans la file
    update file_classee set role = 'hote'
    where discord_id = (select discord_id from file_classee where salon = v_code order by entree limit 1);
    insert into salons_classes (salon, discord_id, mode, equipe)
    select salon, discord_id, '2v2', equipe from file_classee where salon = v_code;
    select role, equipe into v_role, v_equipe from file_classee where discord_id = v_moi;
    return json_build_object('salon', v_code, 'role', v_role, 'equipe', v_equipe);
  end if;

  select * into v_adv from file_classee
  where discord_id <> v_moi and mode = p_mode and salon is null and abs(cote - v_cote) <= v_ecart
  order by entree limit 1;
  if not found then
    return json_build_object('attente', true, 'ecart', v_ecart);
  end if;

  -- Un salon pour les deux : le plus ancien dans la file est l'hôte (équipe A), l'autre l'équipe B
  loop
    v_code := '';
    for i in 1..5 loop v_code := v_code || substr(v_lettres, 1 + floor(random() * length(v_lettres))::int, 1); end loop;
    exit when not exists (select 1 from file_classee where salon = v_code)
      and not exists (select 1 from parties_classees where salon = v_code)
      and not exists (select 1 from salons_classes where salon = v_code);
  end loop;
  update file_classee set salon = v_code, role = case when discord_id = v_adv.discord_id then 'hote' else 'invite' end
  where discord_id in (v_moi, v_adv.discord_id);
  insert into salons_classes (salon, discord_id, mode, equipe) values
    (v_code, v_adv.discord_id, '1v1', 'A'), (v_code, v_moi, '1v1', 'B');
  return json_build_object('salon', v_code, 'role', 'invite');
end;
$$;

create or replace function public.quitter_classee()
returns void
language sql
security definer
set search_path = public
as $$
  delete from file_classee where discord_id = my_discord_id();
$$;

-- Compte une partie (1v1 ou 2v2 : les équipes A et B de salons_classes, une seule personne par équipe
-- en 1v1). Elo par équipe (K = 32, 4 points au moins), sur la cote moyenne de chaque équipe :
-- l'équipe gagnante prend d'autant plus de points que l'autre était mieux classée.
-- p_gagnante null = LITIGE (les deux camps ont déclaré une victoire) : les deux équipes perdent, chacune
-- comme si l'autre avait gagné. Mentir sur une défaite ne rapporte donc jamais rien.
-- Les points de chaque joueur sont notés dans salons_classes.ecart.
create or replace function public.classe_compter(p_salon text, p_gagnante text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cote_a  numeric;
  v_cote_b  numeric;
  v_gain_a  int;   -- points de l'équipe A si elle gagne
  v_gain_b  int;
begin
  insert into rangs (discord_id) select discord_id from salons_classes where salon = p_salon on conflict do nothing;
  perform 1 from rangs where discord_id in (select discord_id from salons_classes where salon = p_salon)
  order by discord_id for update;
  select avg(r.cote) into v_cote_a from rangs r join salons_classes s on s.discord_id = r.discord_id
  where s.salon = p_salon and s.equipe = 'A';
  select avg(r.cote) into v_cote_b from rangs r join salons_classes s on s.discord_id = r.discord_id
  where s.salon = p_salon and s.equipe = 'B';
  v_gain_a := greatest(4, round(32 * (1 - 1 / (1 + power(10, (v_cote_b - v_cote_a) / 400.0))))::int);
  v_gain_b := greatest(4, round(32 * (1 - 1 / (1 + power(10, (v_cote_a - v_cote_b) / 400.0))))::int);

  update salons_classes set ecart = case
      when p_gagnante is null then -(case when equipe = 'A' then v_gain_b else v_gain_a end)
      when equipe = p_gagnante then (case when equipe = 'A' then v_gain_a else v_gain_b end)
      else -(case when p_gagnante = 'A' then v_gain_a else v_gain_b end)
    end
  where salon = p_salon;
  update rangs r set cote = greatest(0, r.cote + s.ecart),
    victoires = r.victoires + (s.ecart > 0)::int,
    defaites  = r.defaites + (s.ecart < 0)::int,
    maj_le = now()
  from salons_classes s where s.salon = p_salon and s.discord_id = r.discord_id;
  update parties_classees set compte = true where salon = p_salon;
end;
$$;

-- Les parties où un seul camp a déclaré son résultat depuis plus de 10 minutes (l'autre a fermé
-- l'onglet, perdu la connexion ou refuse de déclarer sa défaite) : la déclaration reçue est comptée.
-- Appelée par chercher_classee (sous le verrou de la file : une seule à la fois).
create or replace function public.classe_regler_en_suspens()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_vict   boolean;
  v_equipe text;
begin
  for r in
    select s.salon from salons_classes s
    group by s.salon
    having not exists (select 1 from parties_classees pc where pc.salon = s.salon and pc.compte)
       and (select min(pc.cree_le) from parties_classees pc where pc.salon = s.salon) < now() - interval '10 minutes'
    order by s.salon
  loop
    perform pg_advisory_xact_lock(hashtext('classe:' || r.salon));
    continue when exists (select 1 from parties_classees where salon = r.salon and compte);
    v_equipe := null;
    select pc.victoire, sc.equipe into v_vict, v_equipe
    from parties_classees pc join salons_classes sc on sc.salon = pc.salon and sc.discord_id = pc.discord_id
    where pc.salon = r.salon order by pc.cree_le limit 1;
    continue when v_equipe is null;
    -- Les deux camps ont déclaré : c'est resultat_classe qui tranche
    continue when exists (
      select 1 from parties_classees pc join salons_classes sc on sc.salon = pc.salon and sc.discord_id = pc.discord_id
      where pc.salon = r.salon and sc.equipe <> v_equipe);
    perform classe_compter(r.salon, case when v_vict then v_equipe when v_equipe = 'A' then 'B' else 'A' end);
  end loop;
end;
$$;

-- L'ancienne fonction du 2v2 est remplacée par le décompte commun ci-dessus
drop function if exists public.resultat_classe_2v2(text, text, boolean);

-- Fin d'une partie classée : chacun déclare son résultat. La partie est comptée dès qu'un joueur de
-- chaque équipe a déclaré : une victoire et une défaite -> la cote bouge ; deux victoires -> litige,
-- défaite pour les deux camps ; deux défaites -> partie non comptée.
-- Sans déclaration de l'autre camp, elle est comptée au bout de 10 minutes (classe_regler_en_suspens).
create or replace function public.resultat_classe(p_salon text, p_victoire boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi      text := my_discord_id();
  v_vict     boolean := coalesce(p_victoire, false);
  v_equipe   text;
  v_adv_vict boolean;
  v_cote     int;
  v_ecart    int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if coalesce(p_salon, '') !~ '^[A-Z0-9]{5}$' then raise exception 'Salon invalide.'; end if;
  -- La partie doit venir de la file classée (le salon attribué par chercher_classee)
  select equipe into v_equipe from salons_classes where salon = p_salon and discord_id = v_moi;
  if v_equipe is null then raise exception 'Cette partie n''est pas une partie classée.'; end if;

  perform pg_advisory_xact_lock(hashtext('classe:' || p_salon));
  insert into parties_classees (salon, discord_id, victoire) values (p_salon, v_moi, v_vict)
  on conflict (salon, discord_id) do nothing;
  delete from file_classee where discord_id = v_moi;

  -- Déjà comptée (par un autre joueur de la partie, ou au bout des 10 minutes)
  if exists (select 1 from parties_classees where salon = p_salon and compte) then
    select cote into v_cote from rangs where discord_id = v_moi;
    select ecart into v_ecart from salons_classes where salon = p_salon and discord_id = v_moi;
    return json_build_object('ok', true, 'cote', coalesce(v_cote, 1000), 'ecart', v_ecart, 'deja', true);
  end if;

  -- La déclaration d'un joueur de l'autre équipe (la première arrivée)
  select pc.victoire into v_adv_vict
  from parties_classees pc
  join salons_classes sc on sc.salon = pc.salon and sc.discord_id = pc.discord_id
  where pc.salon = p_salon and sc.equipe <> v_equipe
  order by pc.cree_le limit 1;
  if not found then return json_build_object('attente', true); end if;

  if v_adv_vict = v_vict and not v_vict then
    update parties_classees set compte = true where salon = p_salon;
    return json_build_object('ok', false, 'raison', 'Les deux camps ont déclaré une défaite : la partie n''est pas comptée.');
  end if;

  perform classe_compter(p_salon,
    case when v_adv_vict = v_vict then null              -- deux victoires : litige
         when v_vict then v_equipe
         when v_equipe = 'A' then 'B' else 'A' end);
  select cote into v_cote from rangs where discord_id = v_moi;
  select ecart into v_ecart from salons_classes where salon = p_salon and discord_id = v_moi;
  return json_build_object('ok', true, 'cote', v_cote, 'ecart', v_ecart, 'litige', v_adv_vict = v_vict);
end;
$$;

revoke all on function public.chercher_classee(text), public.quitter_classee(), public.resultat_classe(text, boolean) from public, anon;
revoke all on function public.classe_compter(text, text), public.classe_regler_en_suspens() from public, anon, authenticated;
grant execute on function public.chercher_classee(text), public.quitter_classee(), public.resultat_classe(text, boolean) to authenticated;

notify pgrst, 'reload schema';
