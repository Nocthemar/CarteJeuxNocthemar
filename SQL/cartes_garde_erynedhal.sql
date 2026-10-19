-- =====================================================================
--  Cartes à collectionner : la garde d'Erynedhal, en deux cartes (comme celles de Pravorn et d'Aelkor)
--    - « Garde d'Erynedhal »   : une gardienne elfe seule, rareté Commune (rubans argentés de l'illustration)
--    - « Gardes d'Erynedhal »  : l'escouade, rareté Éveillée (rubans verts) — c'est l'ancienne
--                                « Garde des Elfes », renommée (même carte, même id : collections, decks,
--                                boosters et échanges ne bougent pas)
--  Les gardiennes encapuchonnées des cols d'Erynedhal, le pays des neiges de l'Elfe des Neiges.
--  Pas de rang : ce sont des soldates, pas des porteuses de Veine. Leurs attaques utilisent la Marée
--  (l'eau devenue glace, comme l'Elfe des Neiges), l'Ombre (l'embuscade dans le blizzard)
--  et le Regard (la vigie des cimes).
--
--  En jeu (calcul de JS/jeu-cartes-moteur.js, uniteDepuisCarte, et capacités UNIQUES) :
--    Garde d'Erynedhal   : coût 2, attaque 2, défense 1, vie 3 ;
--                          « Pas dans la neige » : à son arrivée, gagne Esquive
--    Gardes d'Erynedhal  : coût 3, attaque 3, défense 2, vie 4, Riposte (1re attaque de la Marée) ;
--                          « Vigie d'Erynedhal » : à son arrivée, gèle l'unité adverse la plus forte
--  Elles sortent des boosters des Cendres (1, 3 et 5 cartes) et de l'Offrande du Voyageur (booster gratuit) ;
--  leurs attaques ont leur animation dans JS/jeu-cartes-attaques.js.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql (et boosters.sql pour les boosters).
--  Relançable : une carte déjà présente (même nom) est mise à jour.
-- =====================================================================

-- L'ancienne « Garde des Elfes » devient « Gardes d'Erynedhal » (si elle existe et pas encore renommée)
update public.cards set name = 'Gardes d''Erynedhal'
where name = 'Garde des Elfes'
  and not exists (select 1 from public.cards where name = 'Gardes d''Erynedhal');

with nouvelles (name, image, rarity, description, attack_1, attack_2) as (values
  ('Garde d''Erynedhal', 'img/Cartes/Garde-Erynedhal-Carte.webp', 'commune',
   'Seule sur les crêtes d''Erynedhal, la gardienne ne laisse aucune trace dans la neige. Sous la capuche et le heaume d''acier, ses yeux d''elfe voient venir l''ennemi bien avant qu''il ne l''aperçoive.',
   '{"veine": "maree", "nom": "Pique Glacée", "effet": "La pointe de sa lance, givrée par le vent des cimes, mord la cible d''un froid qui engourdit.", "puissance": 35}',
   '{"veine": "regard", "nom": "Œil des Cimes", "effet": "Elle a repéré la faille bien avant le combat : son coup tombe là où l''armure cède.", "puissance": 45}'),
  ('Gardes d''Erynedhal', 'img/Cartes/Garde-Elfes-Carte.webp', 'eveillee',
   'Nul ne franchit les cols d''Erynedhal sans qu''elles le sachent. Encapuchonnées de noir, le visage caché derrière l''acier, les gardiennes elfes veillent sur les neiges éternelles et sur le sommeil de l''Elfe des Neiges.',
   '{"veine": "maree", "nom": "Lance de Givre", "effet": "Une lance trempée dans les eaux gelées d''Erynedhal : elle transperce et glace la cible.", "puissance": 45}',
   '{"veine": "ombre", "nom": "Embuscade des Neiges", "effet": "Surgies du blizzard, les gardiennes frappent avant même d''avoir été vues.", "puissance": 55}')
),
maj as (
  update public.cards c
  set image = n.image, rarity = n.rarity, description = n.description, rank = null,
      attack_1 = n.attack_1::jsonb, attack_2 = n.attack_2::jsonb, is_available = true
  from nouvelles n
  where c.name = n.name
  returning c.name
)
insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select n.name, n.image, n.rarity, n.description, 'recompense', true, null, n.attack_1::jsonb, n.attack_2::jsonb
from nouvelles n
where not exists (select 1 from public.cards c where c.name = n.name);

-- Dans les boosters des Cendres (1, 3 et 5 cartes) et le booster gratuit (si SQL/boosters.sql est installé)
do $$
begin
  if to_regclass('public.booster_cartes') is not null then
    insert into public.booster_cartes (booster_id, card_id)
    select b.id, c.id from public.cards c join public.boosters b on b.id in ('eclat', 'cendres', 'grand', 'gratuit')
    where c.name in ('Garde d''Erynedhal', 'Gardes d''Erynedhal')
    on conflict do nothing;
  end if;
end $$;

-- Pour te les donner directement et les tester, retire les deux tirets de la ligne suivante (avec ton discord_id) :
-- select grant_card('TON_ID', id, 'recompense') from public.cards where name in ('Garde d''Erynedhal', 'Gardes d''Erynedhal');

select id, name, rarity, attack_1->>'nom' as attaque_1, attack_2->>'nom' as attaque_2
from public.cards where name in ('Garde d''Erynedhal', 'Gardes d''Erynedhal') order by id;
