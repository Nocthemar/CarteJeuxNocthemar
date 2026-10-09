-- =====================================================================
--  Carte à collectionner : le Mange-cœur (créature du Bestiaire)
--  Uniquement dans le catalogue des cartes (pas de page personnage).
--  Rareté Éveillée (rubans verts de l'illustration).
--  Pas de rang : c'est une créature, pas un porteur de Veine.
--  Attaques tirées de sa description du Bestiaire ; les puissances
--  sont des propositions, à ajuster librement.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql.
--  Relançable sans doublon.
-- =====================================================================
insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select 'Mange-cœur', 'img/Cartes/Mange-coeur-Carte.webp', 'eveillee',
       'Prédateur humanoïde qui éventre ses victimes et consomme leur cœur.',
       'recompense', true, null,
       '{"veine": "bete", "nom": "Éventrement", "effet": "Ouvre la poitrine de sa proie pour lui arracher le cœur.", "puissance": 50}',
       '{"veine": "tombeau", "nom": "Voix du Défunt", "effet": "Imite la voix d''une personne récemment tuée.", "puissance": 20}'
where not exists (select 1 from public.cards where name = 'Mange-cœur');

-- Carte déjà insérée avec un rang : on le retire
update public.cards set rank = null where name = 'Mange-cœur';

-- Pour te la donner et la tester dans ton grimoire, retire les deux tirets de la ligne suivante :
-- select grant_card('568371989547319296', id, 'recompense') from public.cards where name = 'Mange-cœur';

select id, name, rarity, rank, attack_1->>'nom' as attaque_1, attack_2->>'nom' as attaque_2
from public.cards order by id;
