-- =====================================================================
--  Suppression de son compte (page Paramètres, parametres.html, JS/parametres.js)
--
--  supprimer_mon_compte('SUPPRIMER') efface DÉFINITIVEMENT, pour le joueur connecté :
--    - tout le jeu de cartes : cartes, grimoire, deck, boosters, Pass de saison, mode Histoire,
--      plateaux, échanges et contrats, ventes du Marché, souhaits, rang et parties classées ;
--    - ce qui est partagé avec le bot Discord : bourse (wallets), objets et cosmétiques (inventory),
--      historique des pièces (transactions) ;
--    - son profil (players) puis son compte de connexion (auth.users).
--  Le mot « SUPPRIMER » doit être passé tel quel : une simple erreur de clic ne supprime rien.
--  Les tables absentes (SQL pas encore lancé) sont simplement ignorées.
--
--  À exécuter dans Supabase > SQL Editor (après cartes_collection.sql : fonction my_discord_id()).
--  Relançable.
-- =====================================================================
create or replace function public.supprimer_mon_compte(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_uid    uuid := auth.uid();
  v_table  text;
begin
  if v_moi is null or v_uid is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_confirmation is distinct from 'SUPPRIMER' then
    raise exception 'Pour supprimer ton compte, tape SUPPRIMER en majuscules.';
  end if;

  -- Tout ce qui appartient au joueur, table par table (si elle existe)
  foreach v_table in array array[
    'player_deck_cards', 'player_decks', 'player_cards', 'player_boosters', 'booster_ouvertures',
    'pass_progression', 'pass_parties', 'pass_cosmetiques', 'histoire_progression', 'player_pass', 'histoire_tentatives',
    'joueur_plateaux', 'souhaits', 'rangs', 'file_classee', 'parties_classees', 'salons_classes',
    'inventory', 'wallets', 'transactions'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where discord_id = $1', v_table) using v_moi;
    end if;
  end loop;
  if to_regclass('public.echanges') is not null then
    delete from public.echanges where de = v_moi or pour = v_moi;
  end if;
  if to_regclass('public.contrats') is not null then
    delete from public.contrats where de = v_moi or pour = v_moi;
  end if;
  if to_regclass('public.annonces') is not null then
    delete from public.annonces where auteur = v_moi;
  end if;

  -- Le profil, puis le compte de connexion
  delete from public.players where discord_id = v_moi;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.supprimer_mon_compte(text) from public, anon;
grant execute on function public.supprimer_mon_compte(text) to authenticated;

notify pgrst, 'reload schema';
