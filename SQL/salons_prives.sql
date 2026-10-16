-- =====================================================================
--  Salons PRIVÉS du duel en ligne (Supabase Realtime, JS/jeu-cartes-ligne.js)
--
--  Le jeu ouvre ses salons « duel-CODE » en canal privé (config.private = true) : Supabase n'y laisse
--  entrer (écouter, envoyer, apparaître dans la présence) que les joueurs CONNECTÉS qui ont un profil
--  (players). Sans ces règles, n'importe qui avec la clé publique et le code d'un salon pouvait
--  écouter la partie ou y envoyer de faux messages.
--
--  À exécuter dans Supabase > SQL Editor (après cartes_collection.sql : fonction my_discord_id()).
--  Relançable. ⚠️ Sans ce fichier, le mode en ligne ne peut plus se connecter aux salons.
--
--  Ensuite, dans Supabase > Realtime > Settings : décocher « Allow public access » (seuls les canaux
--  privés sont alors acceptés), SAUF si le site Nocthémar ou le bot utilisent eux aussi Realtime avec
--  des canaux publics (dans ce cas, laisser coché : les salons du jeu restent privés quand même).
-- =====================================================================
-- (Pas de « alter table realtime.messages enable row level security » : Supabase l'active déjà,
--  et la table ne nous appartient pas → erreur 42501 « must be owner of table messages ».)

drop policy if exists "duel : les joueurs connectés écoutent les salons" on realtime.messages;
create policy "duel : les joueurs connectés écoutent les salons" on realtime.messages
  for select to authenticated
  using (realtime.topic() like 'duel-%' and public.my_discord_id() is not null);

drop policy if exists "duel : les joueurs connectés parlent dans les salons" on realtime.messages;
create policy "duel : les joueurs connectés parlent dans les salons" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() like 'duel-%' and public.my_discord_id() is not null);
