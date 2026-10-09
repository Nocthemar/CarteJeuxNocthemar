-- =====================================================================
--  Informations des cartes des personnages (Kaéliss, Dalek), affichées
--  dans le cadre noir, sur leur page et dans le grimoire / le deck.
--  Attaques tirées des pouvoirs de leur Veine (pages « Rangs de Puissance »).
--  Les valeurs de puissance sont des propositions, à ajuster librement.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql.
-- =====================================================================
begin;

-- Kaéliss — Veine du Sang, Rang I (Cœur Immuable)
update public.cards set
  rank = 1,
  attack_1 = '{"veine": "sang", "nom": "Maître du Flot", "effet": "Vide ou remplit le sang d''une cible à distance.", "puissance": 80}',
  attack_2 = '{"veine": "sang", "nom": "Cœur Immuable", "effet": "Prend le contrôle total de tout ennemi qui saigne.", "puissance": 120}'
where name = 'Kaéliss';

-- Dalek — Veine du Rêve, Rang I (Seigneurs des Rêves)
update public.cards set
  rank = 1,
  attack_1 = '{"veine": "reve", "nom": "Marcheur d''Esprit", "effet": "Plonge une cible éveillée dans un sommeil forcé.", "puissance": 70}',
  attack_2 = '{"veine": "reve", "nom": "Seigneur des Rêves", "effet": "Un rêve partagé dont les blessures suivent le réveil.", "puissance": 110}'
where name = 'Dalek';

commit;

select name, rarity, rank, attack_1->>'nom' as attaque_1, attack_2->>'nom' as attaque_2
from public.cards order by id;
