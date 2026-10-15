-- =====================================================================
--  Vérification (LECTURE SEULE) des droits des tables partagées avec le site Nocthémar et le bot :
--  players, wallets, inventory, items, transactions. Leurs règles ne sont pas dans ce dossier,
--  mais la sécurité du jeu en dépend. Rien n'est modifié.
--
--  À exécuter dans Supabase > SQL Editor, puis lire les résultats avec ces repères :
--
--  1. RLS activée partout (colonne rls_activee = true pour les 5 tables).
--  2. Règles (policies) :
--     - players : AUCUNE règle UPDATE / INSERT / ALL pour anon ou authenticated qui laisserait un joueur
--       changer is_mj ou user_id (grant_card fait confiance à players.is_mj). Si une règle UPDATE existe
--       pour que le joueur modifie son profil, il faut qu'elle soit limitée à des colonnes sans danger
--       (voir la partie 3 : droits par colonne).
--     - wallets, inventory, transactions : AUCUNE règle INSERT / UPDATE / DELETE / ALL pour anon ou
--       authenticated (sinon un joueur peut se donner de l'or ou des objets).
--     - items : lecture seule.
--  3. Droits par colonne sur players : pour authenticated, pas d'UPDATE sur is_mj, user_id, discord_id.
--  4. La dernière requête montre les colonnes d'inventory : s'il y a une colonne de quantité
--     (quantity, quantite…), signale-le : les contrats du Marché déplacent la ligne entière (toute la pile).
-- =====================================================================

-- 1. RLS activée ?
select c.relname as table_, c.relrowsecurity as rls_activee
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('players', 'wallets', 'inventory', 'items', 'transactions')
order by 1;

-- 2. Règles (policies)
select tablename as table_, policyname as regle, cmd as action, roles, qual as condition, with_check
from pg_policies
where schemaname = 'public' and tablename in ('players', 'wallets', 'inventory', 'items', 'transactions')
order by tablename, cmd;

-- 3. Droits d'écriture des rôles du navigateur (table entière, puis par colonne)
select table_name as table_, grantee as role, privilege_type as droit
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('players', 'wallets', 'inventory', 'items', 'transactions')
  and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
order by 1, 2, 3;

select table_name as table_, column_name as colonne, grantee as role, privilege_type as droit
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'players'
  and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE')
  and column_name in ('is_mj', 'user_id', 'discord_id')
order by 1, 2, 3;

-- 4. Colonnes de l'inventaire
select column_name as colonne, data_type as type
from information_schema.columns
where table_schema = 'public' and table_name = 'inventory'
order by ordinal_position;
