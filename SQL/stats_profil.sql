-- =====================================================================
--  Statistiques du profil (profil.html, JS/profil.js : panneau « Rang et statistiques »)
--
--  stats_joueur(discord_id) -> totaux PUBLICS d'un joueur, calculés à partir des données existantes :
--    - victoires / defaites : ses duels terminés, enregistrés par le Pass de saison (table pass_parties,
--      un ticket par duel contre l'Ombre ou contre un joueur, classé compris). Ne comptent pas :
--      le mode Histoire, les duels abandonnés ou quittés en cours, les duels joués sans être connecté
--      et ceux d'avant le Pass de saison.
--      Détail : ia_* (contre l'Ombre) et joueurs_* (contre des joueurs, en ligne).
--    - cartes      : cartes différentes possédées (table player_cards)
--    - exemplaires : exemplaires possédés, doublons compris
--  Le rang classé (cote, paliers, victoires et défaites en classé) vient de la table rangs (SQL/classe.sql),
--  déjà lisible par tous.
--
--  Lecture seule : rien n'est créé, modifié ni effacé. La table pass_parties reste illisible depuis le
--  navigateur : seuls ces totaux sortent.
--  À exécuter dans Supabase > SQL Editor, APRÈS pass_saison.sql et echanges.sql. Relançable.
-- =====================================================================
create or replace function public.stats_joueur(p_discord_id text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'victoires',         count(*) filter (where victoire),
    'defaites',          count(*) filter (where not victoire),
    'ia_victoires',      count(*) filter (where victoire and mode = 'ia'),
    'ia_defaites',       count(*) filter (where not victoire and mode = 'ia'),
    'joueurs_victoires', count(*) filter (where victoire and mode = 'ami'),
    'joueurs_defaites',  count(*) filter (where not victoire and mode = 'ami'),
    'cartes',            (select count(*) from player_cards where discord_id = p_discord_id),
    'exemplaires',       (select coalesce(sum(quantite), 0) from player_cards where discord_id = p_discord_id)
  )
  from pass_parties
  where discord_id = p_discord_id and termine_le is not null and victoire is not null;
$$;

revoke all on function public.stats_joueur(text) from public;
grant execute on function public.stats_joueur(text) to anon, authenticated;

notify pgrst, 'reload schema';
