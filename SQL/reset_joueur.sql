-- =====================================================================
--  Remise à zéro d'UN joueur (pour tester) : comme s'il venait d'arriver dans le jeu de cartes.
--  (Même chose depuis le panneau MJ du site : bouton « Réinitialiser le joueur », SQL/mj_reset_joueur.sql)
--
--  1. Trouve ton discord_id :
--       select discord_id, username from public.players where username ilike '%ton pseudo%';
--  2. Remplace 'TON_DISCORD_ID' ci-dessous (une seule fois, ligne v_joueur), puis lance tout le fichier
--     dans Supabase > SQL Editor. ATTENTION : c'est définitif.
--
--  Effacé : cartes et grimoire, deck du profil, boosters (non ouverts et historique), Pass de saison
--  (XP, paliers réclamés, premium, parties, cosmétiques du pass), mode Histoire (niveaux terminés, XP),
--  plateaux achetés, échanges et contrats (proposés et reçus), annonces du tableau de guilde, souhaits.
--  Effacé aussi (partagé avec le bot Discord) : la bourse remise à 0 (wallets), les cosmétiques possédés
--  (inventory : thèmes, titres, bannières de la roue des apparences) et les transactions.
--  Gardé : seulement le compte (players).
--  Les tables absentes (SQL pas encore lancé) sont simplement ignorées.
-- =====================================================================
do $$
declare
  v_joueur text := 'TON_DISCORD_ID';
  v_table  text;
begin
  if not exists (select 1 from public.players where discord_id = v_joueur) then
    raise exception 'Aucun joueur avec le discord_id « % ».', v_joueur;
  end if;

  -- Tout ce qui appartient au jeu de cartes, table par table (si elle existe)
  foreach v_table in array array[
    'player_deck_cards', 'player_decks', 'player_cards',      -- cartes, grimoire, deck
    'player_boosters', 'booster_ouvertures', 'player_booster_gratuit', -- boosters
    'pass_progression', 'pass_parties', 'pass_cosmetiques',   -- Pass de saison
    'histoire_progression', 'player_pass', 'histoire_tentatives', -- mode Histoire
    'joueur_plateaux',                                        -- plateaux achetés
    'rangs', 'file_classee', 'parties_classees', 'salons_classes', -- classé
    'souhaits', 'player_succes'                               -- liste de souhaits, succès réclamés
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where discord_id = $1', v_table) using v_joueur;
    end if;
  end loop;

  -- Échanges proposés ou reçus, contrats et annonces du tableau de guilde
  if to_regclass('public.echanges') is not null then
    delete from public.echanges where de = v_joueur or pour = v_joueur;
  end if;
  if to_regclass('public.contrats') is not null then
    delete from public.contrats where de = v_joueur or pour = v_joueur;
  end if;
  if to_regclass('public.annonces') is not null then
    delete from public.annonces where auteur = v_joueur;
  end if;

  -- Cosmétiques équipés sur le profil (bannière, titre, thème) : retirés
  update public.players set banner_item_id = null, title_item_id = null, theme_item_id = null
  where discord_id = v_joueur;

  -- Partagé avec le bot Discord : bourse, cosmétiques (thèmes, titres, bannières) et transactions.
  -- Pour les garder, remets deux tirets « -- » devant ces trois lignes.
  update public.wallets set balance = 0 where discord_id = v_joueur;     -- bourse à 0
  delete from public.inventory where discord_id = v_joueur;             -- cosmétiques et objets possédés
  delete from public.transactions where discord_id = v_joueur;          -- historique des pièces

  raise notice 'Joueur % remis à zéro.', v_joueur;
end $$;
