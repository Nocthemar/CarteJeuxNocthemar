-- =====================================================================
--  Mode Histoire du Duel des Couronnes
--
--  - histoire_chapitres  : les chapitres (pays), dans l'ordre
--  - histoire_niveaux    : les niveaux, leur ordre, le boss et les RÉCOMPENSES
--                          (c'est ici qu'elles sont décidées, pas dans le navigateur)
--  - histoire_progression: les niveaux terminés par chaque joueur
--  - player_pass         : l'XP de pass de chaque joueur (pour un futur battle pass)
--  - valider_niveau_histoire(p_niveau_id) : appelée après une victoire. Vérifie que le
--    niveau était débloqué et que c'est la première victoire, puis enregistre la
--    progression et donne l'or, l'XP et (boss) une carte au hasard, en une seule transaction.
--
--  Les joueurs lisent leur progression et leur XP, mais ne peuvent rien écrire
--  directement : tout passe par la fonction.
--
--  Les niveaux doivent correspondre à JS/histoire-data.js (mêmes id, même ordre).
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_collection.sql. Relançable.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.histoire_chapitres (
  id    text primary key,
  nom   text not null,
  ordre int  not null unique
);

create table if not exists public.histoire_niveaux (
  id          text primary key,
  chapitre_id text not null references public.histoire_chapitres(id) on delete cascade,
  ordre       int  not null,                       -- 1, 2, 3… dans le chapitre
  nom         text not null,
  est_boss    boolean not null default false,
  or_gagne    int not null default 0 check (or_gagne >= 0),
  xp_gagne    int not null default 0 check (xp_gagne >= 0),
  carte_aleatoire boolean not null default false,  -- une carte au hasard (boss)
  or_si_collection_complete int not null default 100,  -- si le joueur a déjà toutes les cartes
  unique (chapitre_id, ordre)
);

create table if not exists public.histoire_progression (
  discord_id  text not null,
  chapitre_id text not null references public.histoire_chapitres(id) on delete cascade,
  niveau_id   text not null references public.histoire_niveaux(id) on delete cascade,
  termine_le  timestamptz not null default now(),
  primary key (discord_id, niveau_id)
);
create index if not exists histoire_progression_joueur on public.histoire_progression (discord_id);

create table if not exists public.player_pass (
  discord_id text primary key,
  xp         int not null default 0 check (xp >= 0),
  maj_le     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
--  2. Le chapitre de test : Pravorn, 6 niveaux et un boss
--     (relancer ce fichier met à jour les montants)
-- ---------------------------------------------------------------------
insert into public.histoire_chapitres (id, nom, ordre) values
  ('pravorn', 'Pravorn', 1)
on conflict (id) do update set nom = excluded.nom, ordre = excluded.ordre;

insert into public.histoire_niveaux (id, chapitre_id, ordre, nom, est_boss, or_gagne, xp_gagne, carte_aleatoire) values
  ('pravorn-1',    'pravorn', 1, 'La route du Nord',            false,  15,  50, false),
  ('pravorn-2',    'pravorn', 2, 'Le pont gardé',               false,  18,  50, false),
  ('pravorn-3',    'pravorn', 3, 'Le camp des mercenaires',     false,  20,  50, false),
  ('pravorn-4',    'pravorn', 4, 'Les marais du Sud',           false,  24,  50, false),
  ('pravorn-5',    'pravorn', 5, 'Les remparts de la capitale', false,  27,  50, false),
  ('pravorn-6',    'pravorn', 6, 'Les lices du tournoi',        false,  30,  50, false),
  ('pravorn-boss', 'pravorn', 7, 'Le Grand Tournoi',            true,  100, 200, true)
on conflict (id) do update set
  chapitre_id = excluded.chapitre_id, ordre = excluded.ordre, nom = excluded.nom,
  est_boss = excluded.est_boss, or_gagne = excluded.or_gagne, xp_gagne = excluded.xp_gagne,
  carte_aleatoire = excluded.carte_aleatoire;


-- ---------------------------------------------------------------------
--  3. Sécurité (RLS) : lecture seule pour les joueurs, aucune écriture directe
-- ---------------------------------------------------------------------
alter table public.histoire_chapitres   enable row level security;
alter table public.histoire_niveaux     enable row level security;
alter table public.histoire_progression enable row level security;
alter table public.player_pass          enable row level security;

drop policy if exists "chapitres lisibles par tous" on public.histoire_chapitres;
create policy "chapitres lisibles par tous" on public.histoire_chapitres
  for select to anon, authenticated using (true);

drop policy if exists "niveaux lisibles par tous" on public.histoire_niveaux;
create policy "niveaux lisibles par tous" on public.histoire_niveaux
  for select to anon, authenticated using (true);

drop policy if exists "je lis ma progression" on public.histoire_progression;
create policy "je lis ma progression" on public.histoire_progression
  for select to authenticated using (discord_id = public.my_discord_id());

drop policy if exists "je lis mon xp de pass" on public.player_pass;
create policy "je lis mon xp de pass" on public.player_pass
  for select to authenticated using (discord_id = public.my_discord_id());

-- Aucune policy insert / update / delete : seules les fonctions SECURITY DEFINER écrivent.
revoke insert, update, delete on public.histoire_chapitres, public.histoire_niveaux,
  public.histoire_progression, public.player_pass from anon, authenticated;


-- ---------------------------------------------------------------------
--  4. Source « histoire » dans l'historique des pièces (transactions.source)
--     Si une contrainte CHECK limite les valeurs, on y ajoute 'histoire' ;
--     si la colonne est un type énuméré, on ajoute la valeur au type.
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
                   where t.typname = v_type and e.enumlabel = 'histoire') then
      execute format('alter type public.%I add value %L', v_type, 'histoire');
    end if;
  else
    for c in
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.transactions'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%source%'
        and pg_get_constraintdef(oid) not ilike '%histoire%'
    loop
      execute format('alter table public.transactions drop constraint %I', c.conname);
      execute format('alter table public.transactions add constraint %I %s', c.conname,
                     regexp_replace(c.def, 'ARRAY\[', 'ARRAY[''histoire''::text, '));
    end loop;
  end if;
end $$;


-- ---------------------------------------------------------------------
--  5. valider_niveau_histoire : après une victoire en mode Histoire
--     Renvoie { deja, or, xp, carte, carte_image, chapitre_termine }
--     (deja = true : niveau déjà terminé, rien n'est donné, pas d'erreur)
-- ---------------------------------------------------------------------
create or replace function public.valider_niveau_histoire(p_niveau_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_niveau histoire_niveaux%rowtype;
  v_ordre_chapitre int;
  v_boss_precedent text;
  v_carte  cards%rowtype;
  v_or     int;
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;

  select * into v_niveau from histoire_niveaux where id = p_niveau_id;
  if not found then
    raise exception 'Niveau inconnu.';
  end if;

  -- Une validation à la fois par joueur (deux onglets ne donnent pas deux fois la récompense)
  perform pg_advisory_xact_lock(hashtext('histoire:' || v_moi));

  -- Déjà terminé : on peut rejouer, mais sans récompense
  if exists (select 1 from histoire_progression where discord_id = v_moi and niveau_id = p_niveau_id) then
    return json_build_object('deja', true, 'or', 0, 'xp', 0, 'carte', null, 'carte_image', null,
                             'chapitre_termine', false);
  end if;

  -- Le niveau est-il débloqué ?
  if v_niveau.ordre > 1 then
    -- le niveau précédent du même chapitre doit être terminé
    if not exists (
      select 1 from histoire_progression hp
      join histoire_niveaux n on n.id = hp.niveau_id
      where hp.discord_id = v_moi and n.chapitre_id = v_niveau.chapitre_id and n.ordre = v_niveau.ordre - 1
    ) then
      raise exception 'Ce niveau n''est pas encore débloqué.';
    end if;
  else
    -- premier niveau d'un chapitre : le boss du chapitre précédent doit être battu
    select ordre into v_ordre_chapitre from histoire_chapitres where id = v_niveau.chapitre_id;
    select n.id into v_boss_precedent
    from histoire_niveaux n join histoire_chapitres c on c.id = n.chapitre_id
    where n.est_boss and c.ordre = (select max(ordre) from histoire_chapitres where ordre < v_ordre_chapitre)
    limit 1;
    if v_boss_precedent is not null and not exists (
      select 1 from histoire_progression where discord_id = v_moi and niveau_id = v_boss_precedent
    ) then
      raise exception 'Termine d''abord le chapitre précédent.';
    end if;
  end if;

  -- Progression
  insert into histoire_progression (discord_id, chapitre_id, niveau_id)
  values (v_moi, v_niveau.chapitre_id, v_niveau.id);

  v_or := v_niveau.or_gagne;

  -- Boss : une carte au hasard que le joueur n'a pas encore (sinon de l'or en plus)
  if v_niveau.carte_aleatoire then
    select c.* into v_carte from cards c
    where c.is_available and c.image is not null
      and c.description is distinct from 'Carte d''exemple'
      and not exists (select 1 from player_cards pc where pc.discord_id = v_moi and pc.card_id = c.id)
    order by random()
    limit 1;
    if found then
      insert into player_cards (discord_id, card_id, source) values (v_moi, v_carte.id, 'recompense');
    else
      v_or := v_or + v_niveau.or_si_collection_complete;
    end if;
  end if;

  -- Or : ajouté au solde et noté dans l'historique
  if v_or > 0 then
    update wallets set balance = balance + v_or where discord_id = v_moi;
    if not found then
      insert into wallets (discord_id, balance) values (v_moi, v_or);
    end if;
    insert into transactions (discord_id, amount, source, reason)
    values (v_moi, v_or, 'histoire', 'Mode Histoire : ' || v_niveau.nom);
  end if;

  -- XP de pass
  if v_niveau.xp_gagne > 0 then
    insert into player_pass (discord_id, xp) values (v_moi, v_niveau.xp_gagne)
    on conflict (discord_id) do update set xp = player_pass.xp + excluded.xp, maj_le = now();
  end if;

  return json_build_object(
    'deja', false,
    'or', v_or,
    'xp', v_niveau.xp_gagne,
    'carte', v_carte.name,
    'carte_image', v_carte.image,
    'chapitre_termine', v_niveau.est_boss
  );
end;
$$;

revoke all on function public.valider_niveau_histoire(text) from public, anon;
grant execute on function public.valider_niveau_histoire(text) to authenticated;


-- Vérification
select n.ordre, n.id, n.nom, n.est_boss, n.or_gagne, n.xp_gagne, n.carte_aleatoire
from public.histoire_niveaux n order by n.chapitre_id, n.ordre;
