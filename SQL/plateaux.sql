-- =====================================================================
--  Plateaux du Duel des Couronnes (Boutique > « L'atelier des plateaux », Profil > Collection > Plateaux)
--
--  - plateaux         : les plateaux vendus (nom, prix en or du jeu, images)
--  - joueur_plateaux  : les plateaux achetés par chaque joueur, et celui qu'il a choisi (equipe)
--
--  Sans plateau choisi, le duel se joue sur le plateau par défaut : l'arène de pierre (gratuite, pour tout le monde,
--  img/Plateaux de carte/plateau-defaut.webp ; elle n'est pas dans cette table).
--  Un plateau acheté la remplace, jusqu'à ce que le joueur le retire.
--  Fonctions des joueurs :
--    acheter_plateau(plateau)  -> paie en or, ajoute le plateau aux siens (une seule fois)
--    equiper_plateau(plateau)  -> choisit ce plateau pour ses duels ; null = retour au plateau par défaut
--  Le plateau choisi se lit dans joueur_plateaux (equipe = true) : JS/jeu-cartes.js, JS/profil.js.
--
--  À exécuter dans Supabase > SQL Editor (après boosters.sql : même fonction my_discord_id()). Relançable.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.plateaux (
  id          text primary key,                       -- 'automne', 'hiver'… : la classe CSS plateau-<id>
  nom         text not null,
  description text,
  prix        int  not null check (prix >= 0),        -- en or du jeu
  image       text not null,                          -- grande image (le duel)
  miniature   text,                                   -- petite image (boutique, profil)
  ordre       int  not null default 0,
  en_vente    boolean not null default true
);

create table if not exists public.joueur_plateaux (
  discord_id text not null,
  plateau_id text not null references public.plateaux(id) on delete cascade,
  equipe     boolean not null default false,
  achete_le  timestamptz not null default now(),
  primary key (discord_id, plateau_id)
);
-- Un seul plateau choisi par joueur
create unique index if not exists joueur_plateaux_un_equipe on public.joueur_plateaux (discord_id) where equipe;


-- ---------------------------------------------------------------------
--  2. Sécurité (RLS) : plateaux lisibles par tous ; chacun lit les siens ; aucune écriture directe
-- ---------------------------------------------------------------------
alter table public.plateaux        enable row level security;
alter table public.joueur_plateaux enable row level security;

drop policy if exists "plateaux lisibles par tous" on public.plateaux;
create policy "plateaux lisibles par tous" on public.plateaux
  for select to anon, authenticated using (true);

drop policy if exists "je lis mes plateaux" on public.joueur_plateaux;
create policy "je lis mes plateaux" on public.joueur_plateaux
  for select to authenticated using (discord_id = public.my_discord_id());

revoke insert, update, delete on public.plateaux, public.joueur_plateaux from anon, authenticated;


-- ---------------------------------------------------------------------
--  3. Fonctions
-- ---------------------------------------------------------------------

-- Acheter un plateau (or du jeu). Renvoie { plateau, prix }
create or replace function public.acheter_plateau(p_plateau_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi     text := my_discord_id();
  v_plateau plateaux%rowtype;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;

  select * into v_plateau from plateaux where id = p_plateau_id;
  if not found or not v_plateau.en_vente then raise exception 'Ce plateau n''est pas en vente.'; end if;

  perform pg_advisory_xact_lock(hashtext('plateau:' || v_moi));
  if exists (select 1 from joueur_plateaux where discord_id = v_moi and plateau_id = p_plateau_id) then
    raise exception 'Tu possèdes déjà ce plateau.';
  end if;

  update wallets set balance = balance - v_plateau.prix
  where discord_id = v_moi and balance >= v_plateau.prix;
  if not found then raise exception 'Pas assez de pièces.'; end if;

  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_plateau.prix, 'boutique_fun', 'Plateau « ' || v_plateau.nom || ' »');

  insert into joueur_plateaux (discord_id, plateau_id) values (v_moi, v_plateau.id);

  return json_build_object('plateau', v_plateau.nom, 'prix', v_plateau.prix);
end;
$$;

-- Choisir le plateau de ses duels (un plateau possédé), ou null pour le plateau par défaut
create or replace function public.equiper_plateau(p_plateau_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_plateau_id is not null
     and not exists (select 1 from joueur_plateaux where discord_id = v_moi and plateau_id = p_plateau_id) then
    raise exception 'Tu ne possèdes pas ce plateau.';
  end if;

  update joueur_plateaux set equipe = false where discord_id = v_moi and equipe;
  if p_plateau_id is not null then
    update joueur_plateaux set equipe = true where discord_id = v_moi and plateau_id = p_plateau_id;
  end if;
end;
$$;

revoke all on function public.acheter_plateau(text), public.equiper_plateau(text) from public, anon;
grant execute on function public.acheter_plateau(text), public.equiper_plateau(text) to authenticated;


-- ---------------------------------------------------------------------
--  4. Les plateaux en vente : les quatre saisons et l’arène aux cristaux d’or
-- ---------------------------------------------------------------------
insert into public.plateaux (id, nom, description, prix, image, miniature, ordre) values
  ('printemps', 'Arène du Printemps',     'L''arène de pierre couverte de lierre et de fleurs de cerisier.',
    500, 'img/Plateaux de carte/plateau-printemps.webp', 'img/Plateaux de carte/plateau-printemps-mini.webp', 1),
  ('ete',       'Arène de l''Été',         'L''arène de pierre envahie de verdure, de mousse et de jeunes sapins.',
    500, 'img/Plateaux de carte/plateau-ete.webp',       'img/Plateaux de carte/plateau-ete-mini.webp',       2),
  ('automne',   'Arène d''Automne',        'L''arène de pierre sous les érables rouges et les feuilles mortes.',
    500, 'img/Plateaux de carte/plateau-automne.webp',   'img/Plateaux de carte/plateau-automne-mini.webp',   3),
  ('hiver',     'Arène de l''Hiver',       'L''arène de pierre prise dans la neige et les cristaux de glace.',
    500, 'img/Plateaux de carte/plateau-hiver.webp',     'img/Plateaux de carte/plateau-hiver-mini.webp',     4),
  ('cristaux',  'Arène des Cristaux d''Or', 'L''arène fissurée, hérissée de cristaux d''or et parcourue de brume dorée.',
    750, 'img/Plateaux de carte/plateau-cristaux.webp',  'img/Plateaux de carte/plateau-cristaux-mini.webp',  5)
on conflict (id) do update set nom = excluded.nom, description = excluded.description, prix = excluded.prix,
  image = excluded.image, miniature = excluded.miniature, ordre = excluded.ordre;
