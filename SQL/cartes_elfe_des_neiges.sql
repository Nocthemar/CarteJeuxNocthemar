-- =====================================================================
--  Cartes à collectionner : l'Elfe des Neiges (ancien nom : Fée des Neiges), en deux versions
--    - « Elfe des Neiges »        : version bleue, rareté Mythique (cadre bleu)
--    - « Elfe des Neiges dorée »  : version dorée, rareté Transcendante (illustration pleine, sans cadre noir)
--  Créature des neiges d'Erynedhal (pas encore de page dans le Codex : description provisoire).
--  Pas de rang. Ses attaques utilisent les Veines du Rêve (la douceur, le sommeil de la neige)
--  et de la Marée (l'eau devenue glace).
--
--  En jeu (calcul de JS/jeu-cartes-moteur.js, uniteDepuisCarte) :
--    Elfe des Neiges        : coût 4, attaque 4, vie 5, Charge (1re attaque de la Marée)
--    Elfe des Neiges dorée  : coût 6, attaque 7, vie 6 (attaques puissantes : +1 attaque, -1 vie)
--  Elles sortent des boosters des Cendres (1, 3 et 5 cartes) ; leurs attaques ont leur
--  animation dans JS/jeu-cartes-attaques.js.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql (et boosters.sql pour les boosters).
--  Relançable sans doublon.
-- =====================================================================

-- Changement de nom : « Fée des Neiges » devient « Elfe des Neiges » (les cartes gardent leur id :
-- collections, decks, boosters et échanges ne bougent pas)
update public.cards set name = 'Elfe des Neiges' where name = 'Fée des Neiges';
update public.cards set name = 'Elfe des Neiges dorée',
  description = 'Une nuit par siècle, l''Elfe des Neiges s''éveille sous l''aurore d''Erynedhal. Ses larmes deviennent cristal, et l''hiver entier lui obéit.'
  where name = 'Fée des Neiges dorée';

insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select 'Elfe des Neiges', 'img/Cartes/féedesneiges-bleux.png', 'mythique',
       'Elle danse dans les tempêtes d''Erynedhal, et la neige tombe là où elle passe. Ceux qui la suivent ne retrouvent jamais leur chemin.',
       'recompense', true, null,
       '{"veine": "maree", "nom": "Souffle de Givre", "effet": "Un souffle glacé fige la cible sous une fine couche de givre.", "puissance": 45}',
       '{"veine": "reve", "nom": "Berceuse des Neiges", "effet": "Un chant doux plonge la cible dans le sommeil froid de l''hiver.", "puissance": 55}'
where not exists (select 1 from public.cards where name = 'Elfe des Neiges');

insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select 'Elfe des Neiges dorée', 'img/Cartes/féedesneiges.png', 'transcendante',
       'Une nuit par siècle, l''Elfe des Neiges s''éveille sous l''aurore d''Erynedhal. Ses larmes deviennent cristal, et l''hiver entier lui obéit.',
       'recompense', true, null,
       '{"veine": "reve", "nom": "Larmes de Cristal", "effet": "Ses larmes se changent en éclats de cristal qui transpercent la cible.", "puissance": 80}',
       '{"veine": "maree", "nom": "Blizzard d''Erynedhal", "effet": "Le blizzard éternel des montagnes s''abat sur le champ de bataille.", "puissance": 120}'
where not exists (select 1 from public.cards where name = 'Elfe des Neiges dorée');

-- Dans les boosters des Cendres, 1, 3 et 5 cartes (si SQL/boosters.sql est déjà installé)
do $$
begin
  if to_regclass('public.booster_cartes') is not null then
    insert into public.booster_cartes (booster_id, card_id)
    select b.id, c.id from public.cards c join public.boosters b on b.id in ('eclat', 'cendres', 'grand')
    where c.name in ('Elfe des Neiges', 'Elfe des Neiges dorée')
    on conflict do nothing;
  end if;
end $$;

-- Pour te les donner directement et les tester, retire les deux tirets de la ligne suivante (avec ton discord_id) :
-- select grant_card('TON_ID', id, 'recompense') from public.cards where name in ('Elfe des Neiges', 'Elfe des Neiges dorée');

select id, name, rarity, attack_1->>'nom' as attaque_1, attack_2->>'nom' as attaque_2
from public.cards where name in ('Elfe des Neiges', 'Elfe des Neiges dorée') order by id;
