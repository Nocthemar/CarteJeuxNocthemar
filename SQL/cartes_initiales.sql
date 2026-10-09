-- =====================================================================
--  Premières cartes du catalogue : Kaéliss, Dalek et le Maître du Jeu
--  (images déjà présentes dans img/Cartes/), puis don à Jules pour tester.
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_collection.sql.
--  Relançable sans créer de doublons.
-- =====================================================================
begin;

-- Nettoie l'éventuelle carte de test précédente
delete from cards where description = 'Carte de test';

insert into cards (name, image, rarity, description, source, is_available)
select v.name, v.image, v.rarity, v.description, 'recompense', true
from (values
  ('Kaéliss', 'img/Cartes/Kaéliss-Carte.webp', 'legendaire',
   'La Déesse du Sang, détentrice de la Veine du Sang — Rang I, Cœur Immuable.'),
  ('Dalek', 'img/Cartes/Dalek-Carte.webp', 'legendaire',
   'Le Dieu du Rêve, détenteur de la Veine du Rêve — Rang I, Seigneurs des Rêves.'),
  ('Maître du Jeu', 'img/Cartes/Maitre du jeux.webp', 'transcendante',
   'Celui qui tisse les destins de Nocthémar.')
) as v(name, image, rarity, description)
where not exists (select 1 from cards c where c.name = v.name);

-- Donne les 3 cartes à Jules (elles se rangent seules dans les premières pochettes libres)
select c.name, grant_card('568371989547319296', c.id, 'recompense') as nouvelle
from cards c
where c.name in ('Kaéliss', 'Dalek', 'Maître du Jeu')
order by c.id;

commit;
