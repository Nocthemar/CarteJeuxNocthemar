-- =====================================================================
--  Carte à collectionner : le Slime (créature du Bestiaire, Terrestres)
--  Uniquement dans le catalogue des cartes (pas de page personnage).
--  Rareté Commune (cadre gris cendre de l'illustration).
--  Pas de rang : c'est une créature, pas un porteur de Veine.
--  Attaques tirées de sa description du Bestiaire ; les puissances
--  sont des propositions, à ajuster librement.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql.
--  Relançable sans doublon.
-- =====================================================================
insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select 'Slime', 'img/Cartes/Slime-Carte.png', 'commune',
       'Petite masse gélatineuse translucide se déplaçant lentement. Inoffensive tant qu''on ne la dérange pas, elle se nourrit de matières en décomposition.',
       'recompense', true, null,
       '{"veine": "racine", "nom": "Masse gélatineuse", "effet": "Se répand en travers du passage et englue ceux qui la touchent.", "puissance": 20}',
       '{"veine": "maree", "nom": "Englobement", "effet": "Engloutit une petite proie et la dissout lentement.", "puissance": 30}'
where not exists (select 1 from public.cards where name = 'Slime');

-- Pour te la donner et la tester dans ton grimoire, retire les deux tirets de la ligne suivante :
-- select grant_card('568371989547319296', id, 'recompense') from public.cards where name = 'Slime';

select id, name, rarity, rank, attack_1->>'nom' as attaque_1, attack_2->>'nom' as attaque_2
from public.cards order by id;
