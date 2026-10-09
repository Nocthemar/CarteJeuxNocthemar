-- =====================================================================
--  Cartes à collectionner : catalogue, collection (grimoire) et deck du profil.
--  Purement cosmétique : aucune carte ne donne d'avantage en jeu.
--
--  À exécuter une fois dans Supabase > SQL Editor.
--
--  Règle d'or : un joueur ne peut JAMAIS se donner une carte lui-même.
--  - Il peut lire ses cartes et changer leur emplacement dans le grimoire.
--  - Il peut composer son deck (5 cartes max) avec des cartes qu'il possède.
--  - Les cartes arrivent uniquement par buy_card (boutique) ou grant_card
--    (récompenses, événements, bot Discord, MJ), côté serveur.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
--  1) Catalogue des cartes (lisible par tous)
-- ---------------------------------------------------------------------
create table if not exists public.cards (
  id           bigint generated always as identity primary key,
  name         text not null,
  image        text,                    -- chemin depuis la racine du site, ex : img/Cartes/Dalek-Carte.webp
  rarity       text not null default 'commune'
               check (rarity in ('commune', 'eveillee', 'mythique', 'legendaire', 'transcendante')),
  description  text,
  price        integer check (price is null or price >= 0),   -- null = pas en vente
  source       text not null default 'boutique'
               check (source in ('boutique', 'recompense', 'evenement', 'discord')),
  is_available boolean not null default false,               -- en vente / distribuable en ce moment
  payload      jsonb not null default '{}'::jsonb,           -- extensions futures (série, numéro, effet visuel…)
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  2) Cartes possédées, avec leur emplacement dans le grimoire
--     (page 1 à 100, 9 pochettes par page)
-- ---------------------------------------------------------------------
create table if not exists public.player_cards (
  discord_id  text     not null references public.players(discord_id) on delete cascade,
  card_id     bigint   not null references public.cards(id) on delete cascade,
  page        smallint not null check (page between 1 and 100),
  slot        smallint not null check (slot between 1 and 9),
  source      text     not null default 'boutique',
  obtained_at timestamptz not null default now(),
  primary key (discord_id, card_id),
  -- Vérifiée en fin de transaction : permet d'échanger deux cartes de place
  constraint player_cards_emplacement_unique unique (discord_id, page, slot) deferrable initially deferred
);

-- ---------------------------------------------------------------------
--  3) Deck du profil : un nom + 5 emplacements
-- ---------------------------------------------------------------------
create table if not exists public.player_decks (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  name       text not null default 'Deck de cartes' check (char_length(name) between 1 and 40),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_deck_cards (
  discord_id text     not null,
  position   smallint not null check (position between 1 and 5),
  card_id    bigint   not null references public.cards(id) on delete cascade,
  primary key (discord_id, position),
  unique (discord_id, card_id),
  -- Une carte du deck doit être possédée ; si elle quitte la collection, elle quitte le deck
  foreign key (discord_id, card_id) references public.player_cards(discord_id, card_id) on delete cascade
);


-- ---------------------------------------------------------------------
--  Joueur connecté -> son discord_id
-- ---------------------------------------------------------------------
create or replace function public.my_discord_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select discord_id from players where user_id = auth.uid();
$$;


-- ---------------------------------------------------------------------
--  Placement automatique : une nouvelle carte sans emplacement va
--  dans la première pochette libre du grimoire.
-- ---------------------------------------------------------------------
create or replace function public.place_new_card()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.page is null or new.slot is null then
    -- Deux cartes reçues en même temps ne doivent pas viser la même pochette
    perform pg_advisory_xact_lock(hashtext('player_cards:' || new.discord_id));

    select p.page, s.slot into new.page, new.slot
    from generate_series(1, 100) as p(page)
    cross join generate_series(1, 9) as s(slot)
    where not exists (
      select 1 from player_cards pc
      where pc.discord_id = new.discord_id and pc.page = p.page and pc.slot = s.slot
    )
    order by p.page, s.slot
    limit 1;

    if new.page is null then
      raise exception 'Le grimoire de ce joueur est plein.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists player_cards_place_new on public.player_cards;
create trigger player_cards_place_new
  before insert on public.player_cards
  for each row execute function public.place_new_card();


-- ---------------------------------------------------------------------
--  RLS + droits
--  Supabase donne par défaut tous les droits aux rôles anon/authenticated
--  sur les nouvelles tables : on les retire, puis on rouvre le strict nécessaire.
-- ---------------------------------------------------------------------
alter table public.cards             enable row level security;
alter table public.player_cards      enable row level security;
alter table public.player_decks      enable row level security;
alter table public.player_deck_cards enable row level security;

revoke all on public.cards, public.player_cards, public.player_decks, public.player_deck_cards
  from anon, authenticated;

-- Catalogue et decks : publics en lecture (les decks s'affichent sur les profils)
grant select on public.cards, public.player_decks, public.player_deck_cards to anon, authenticated;

drop policy if exists "cartes lisibles par tous" on public.cards;
create policy "cartes lisibles par tous" on public.cards
  for select to anon, authenticated using (true);

drop policy if exists "decks lisibles par tous" on public.player_decks;
create policy "decks lisibles par tous" on public.player_decks
  for select to anon, authenticated using (true);

drop policy if exists "cartes des decks lisibles par tous" on public.player_deck_cards;
create policy "cartes des decks lisibles par tous" on public.player_deck_cards
  for select to anon, authenticated using (true);

-- Collection : le joueur lit ses cartes et ne peut modifier QUE leur emplacement.
-- Pas d'INSERT ni de DELETE : impossible de s'ajouter (ou de dupliquer) une carte.
grant select on public.player_cards to authenticated;
grant update (page, slot) on public.player_cards to authenticated;

drop policy if exists "je lis mes cartes" on public.player_cards;
create policy "je lis mes cartes" on public.player_cards
  for select to authenticated using (discord_id = public.my_discord_id());

drop policy if exists "je range mes cartes" on public.player_cards;
create policy "je range mes cartes" on public.player_cards
  for update to authenticated
  using (discord_id = public.my_discord_id())
  with check (discord_id = public.my_discord_id());


-- ---------------------------------------------------------------------
--  move_card : range une carte dans une pochette.
--  Si la pochette est occupée, les deux cartes échangent leur place.
-- ---------------------------------------------------------------------
create or replace function public.move_card(p_card_id bigint, p_page int, p_slot int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_page smallint;
  v_slot smallint;
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;
  if p_page not between 1 and 100 or p_slot not between 1 and 9 then
    raise exception 'Emplacement invalide.';
  end if;

  select page, slot into v_page, v_slot
  from player_cards
  where discord_id = v_moi and card_id = p_card_id
  for update;

  if not found then
    raise exception 'Tu ne possèdes pas cette carte.';
  end if;
  if v_page = p_page and v_slot = p_slot then
    return;
  end if;

  -- La carte déjà présente (s'il y en a une) prend l'ancienne place
  update player_cards set page = v_page, slot = v_slot
  where discord_id = v_moi and page = p_page and slot = p_slot;

  update player_cards set page = p_page, slot = p_slot
  where discord_id = v_moi and card_id = p_card_id;
end;
$$;


-- ---------------------------------------------------------------------
--  set_deck : remplace tout le deck.
--  p_card_ids = 5 valeurs max, dans l'ordre ; null = emplacement vide.
-- ---------------------------------------------------------------------
create or replace function public.set_deck(p_card_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;
  if coalesce(array_length(p_card_ids, 1), 0) > 5 then
    raise exception 'Un deck contient 5 cartes au maximum.';
  end if;
  if (select count(c) <> count(distinct c) from unnest(p_card_ids) c) then
    raise exception 'Une carte ne peut figurer qu''une fois dans le deck.';
  end if;
  if exists (
    select 1 from unnest(p_card_ids) c
    where c is not null
      and not exists (select 1 from player_cards pc where pc.discord_id = v_moi and pc.card_id = c)
  ) then
    raise exception 'Tu ne peux mettre dans ton deck que des cartes que tu possèdes.';
  end if;

  insert into player_decks (discord_id) values (v_moi)
  on conflict (discord_id) do update set updated_at = now();

  delete from player_deck_cards where discord_id = v_moi;

  insert into player_deck_cards (discord_id, position, card_id)
  select v_moi, t.pos, t.c
  from unnest(p_card_ids) with ordinality as t(c, pos)
  where t.c is not null;
end;
$$;


-- ---------------------------------------------------------------------
--  rename_deck : nom personnalisé de la section deck (1 à 40 caractères)
-- ---------------------------------------------------------------------
create or replace function public.rename_deck(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_nom text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;
  if char_length(v_nom) not between 1 and 40 then
    raise exception 'Le nom du deck doit faire entre 1 et 40 caractères.';
  end if;

  insert into player_decks (discord_id, name) values (v_moi, v_nom)
  on conflict (discord_id) do update set name = excluded.name, updated_at = now();

  return v_nom;
end;
$$;


-- ---------------------------------------------------------------------
--  grant_card : donne une carte à un joueur (récompense, événement, bot…).
--  Réservé au serveur (clé service_role du bot) et aux MJ.
--  Renvoie false si le joueur l'avait déjà.
-- ---------------------------------------------------------------------
create or replace function public.grant_card(p_discord_id text, p_card_id bigint, p_source text default 'recompense')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() est null pour le bot (service_role) ; un joueur connecté doit être MJ
  if auth.uid() is not null
     and not exists (select 1 from players where user_id = auth.uid() and is_mj) then
    raise exception 'Réservé aux MJ.';
  end if;
  if not exists (select 1 from cards where id = p_card_id) then
    raise exception 'Carte inconnue.';
  end if;

  insert into player_cards (discord_id, card_id, source)
  values (p_discord_id, p_card_id, coalesce(p_source, 'recompense'))
  on conflict (discord_id, card_id) do nothing;

  return found;
end;
$$;


-- ---------------------------------------------------------------------
--  buy_card : achat d'une carte en boutique (même principe que buy_fun_item).
--  Solde, disponibilité et doublon vérifiés ici, pas dans le navigateur.
-- ---------------------------------------------------------------------
create or replace function public.buy_card(p_card_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi  text := my_discord_id();
  v_card cards%rowtype;
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;

  select * into v_card from cards where id = p_card_id;
  if not found or not v_card.is_available or v_card.price is null or v_card.source <> 'boutique' then
    raise exception 'Cette carte n''est pas en vente.';
  end if;
  if exists (select 1 from player_cards where discord_id = v_moi and card_id = p_card_id) then
    raise exception 'Tu possèdes déjà cette carte.';
  end if;

  update wallets set balance = balance - v_card.price
  where discord_id = v_moi and balance >= v_card.price;
  if not found then
    raise exception 'Pas assez de pièces.';
  end if;

  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_card.price, 'boutique_fun', 'Carte : ' || v_card.name);

  insert into player_cards (discord_id, card_id, source) values (v_moi, p_card_id, 'boutique');

  return json_build_object('card', v_card.name, 'price', v_card.price);
end;
$$;


-- Fonctions : jamais appelables sans connexion
revoke all on function public.my_discord_id()                    from public, anon;
revoke all on function public.move_card(bigint, int, int)        from public, anon;
revoke all on function public.set_deck(bigint[])                 from public, anon;
revoke all on function public.rename_deck(text)                  from public, anon;
revoke all on function public.grant_card(text, bigint, text)     from public, anon;
revoke all on function public.buy_card(bigint)                   from public, anon;
revoke all on function public.place_new_card()                   from public, anon, authenticated;

grant execute on function public.my_discord_id()                 to authenticated;
grant execute on function public.move_card(bigint, int, int)     to authenticated;
grant execute on function public.set_deck(bigint[])              to authenticated;
grant execute on function public.rename_deck(text)               to authenticated;
grant execute on function public.grant_card(text, bigint, text)  to authenticated;  -- vérifie is_mj
grant execute on function public.buy_card(bigint)                to authenticated;

commit;

notify pgrst, 'reload schema';
