-- =====================================================================
--  Réinitialisation COMPLÈTE d'un joueur depuis le panneau MJ du site
--  (bouton « Réinitialiser le joueur », zone sensible : Nochthémar SITE/JS/mj.js -> mj_reset_player)
--
--  Remplace l'ancienne version de mj_reset_player, qui ne remettait à zéro que les pièces,
--  l'inventaire, l'historique et les cosmétiques. Désormais le joueur repart comme s'il venait
--  d'arriver : seul son compte (players) est gardé.
--
--  Effacé :
--    - l'or (bourse à 0) et l'historique des pièces (wallets, transactions)
--    - les cosmétiques et objets possédés (inventory) et ceux équipés sur le profil
--    - toutes les cartes possédées, le grimoire et le deck (player_cards, player_decks, player_deck_cards)
--    - les boosters non ouverts, l'historique des ouvertures et le délai du booster gratuit
--    - le Pass de saison : XP, paliers réclamés, premium, parties, cosmétiques du pass
--    - le mode Histoire : niveaux terminés, partie en cours
--    - les plateaux achetés
--    - le classé : rang et cote, file d'attente, parties classées
--    - le Marché : échanges et contrats (proposés et reçus), annonces, liste de souhaits
--
--  Seuls les MJ (players.is_mj) peuvent l'appeler. Les tables absentes (SQL pas encore lancé)
--  sont simplement ignorées. Ajouter ici toute nouvelle table de données de joueur.
--
--  À exécuter dans Supabase > SQL Editor. Relançable.
-- =====================================================================
drop function if exists public.mj_reset_player(text);

create function public.mj_reset_player(p_discord_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table   text;
  v_effaces int;
  v_total   int := 0;
begin
  if not exists (select 1 from players where user_id = auth.uid() and is_mj) then
    raise exception 'Réservé aux MJ.';
  end if;
  if not exists (select 1 from players where discord_id = p_discord_id) then
    raise exception 'Joueur introuvable.';
  end if;
  perform pg_advisory_xact_lock(hashtext('reset:' || p_discord_id));

  -- 1. Tout ce qui appartient au joueur (colonne discord_id), table par table si elle existe
  foreach v_table in array array[
    'player_deck_cards', 'player_decks', 'player_cards',                  -- cartes, grimoire, deck
    'player_boosters', 'booster_ouvertures', 'player_booster_gratuit',    -- boosters
    'pass_progression', 'pass_parties', 'pass_cosmetiques', 'player_pass',-- Pass de saison
    'histoire_progression', 'histoire_tentatives',                        -- mode Histoire
    'joueur_plateaux',                                                    -- plateaux achetés
    'rangs', 'file_classee', 'parties_classees', 'salons_classes',        -- classé
    'souhaits',                                                           -- liste de souhaits
    'inventory', 'transactions'                                           -- cosmétiques, historique des pièces
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where discord_id = $1', v_table) using p_discord_id;
      get diagnostics v_effaces = row_count;
      v_total := v_total + v_effaces;
    end if;
  end loop;

  -- 2. Le Marché : échanges et contrats proposés ou reçus, annonces publiées
  if to_regclass('public.echanges') is not null then
    delete from echanges where de = p_discord_id or pour = p_discord_id;
  end if;
  if to_regclass('public.contrats') is not null then
    delete from contrats where de = p_discord_id or pour = p_discord_id;
  end if;
  if to_regclass('public.annonces') is not null then
    delete from annonces where auteur = p_discord_id;
  end if;

  -- 3. L'or : bourse à 0
  update wallets set balance = 0 where discord_id = p_discord_id;

  -- 4. Cosmétiques équipés sur le profil (bannière, titre, thème) : retirés
  update players set banner_item_id = null, title_item_id = null, theme_item_id = null
  where discord_id = p_discord_id;

  return json_build_object('joueur', p_discord_id, 'lignes_effacees', v_total);
end;
$$;

revoke all on function public.mj_reset_player(text) from public, anon;
grant execute on function public.mj_reset_player(text) to authenticated;   -- vérifie is_mj

notify pgrst, 'reload schema';
