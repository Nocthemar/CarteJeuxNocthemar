-- =====================================================================
--  Cartes à collectionner : la garde de Pravorn, en deux cartes
--    - « Garde de Pravorn »   : un garde seul, rareté Commune (cadre argenté de l'illustration)
--    - « Gardes de Pravorn »  : l'escouade, rareté Éveillée (rubans verts de l'illustration)
--  Soldats du royaume du Grand Tournoi (mode Histoire, chapitre Pravorn). Pas de rang : ce sont
--  des soldats, pas des porteurs de Veine. Leurs attaques utilisent la Forge (l'acier, le bouclier),
--  le Trône (le serment à la Couronne) et la Chaîne (les rangs qui ne rompent pas).
--
--  En jeu (calcul de JS/jeu-cartes-moteur.js, uniteDepuisCarte, et capacités UNIQUES) :
--    Garde de Pravorn   : coût 2, attaque 2, défense 1, vie 3 ;
--                         « Sentinelle de Pravorn » : à son arrivée, prend la Garde
--    Gardes de Pravorn  : coût 3, attaque 3, défense 2, vie 4, Provocation (1re attaque de la Chaîne) ;
--                         « Rangs serrés » : à son arrivée, tes autres unités gagnent +1 Défense
--  Elles sortent des boosters des Cendres (1, 3 et 5 cartes) ; leurs attaques ont leur animation
--  dans JS/jeu-cartes-attaques.js. On les affronte aussi en mode Histoire (JS/histoire-data.js).
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql (et boosters.sql pour les boosters).
--  Relançable : une carte déjà présente (même nom) est mise à jour.
-- =====================================================================
with nouvelles (name, image, rarity, description, attack_1, attack_2) as (values
  ('Garde de Pravorn', 'img/Cartes/Garde-Pravorn-Carte.webp', 'commune',
   'Ils sont des milliers à veiller sur les routes du plus vaste royaume du continent. Sous la cape verte de Pravorn, un garde ne recule jamais : il tient sa place jusqu''à la relève, ou jusqu''à la mort.',
   '{"veine": "forge", "nom": "Écu levé", "effet": "Le garde lève son bouclier et encaisse le coup à la place de ceux qu''il protège.", "puissance": 35}',
   '{"veine": "trone", "nom": "Estocade du Serment", "effet": "Une estocade portée au nom de la Couronne de Pravorn.", "puissance": 45}'),
  ('Gardes de Pravorn', 'img/Cartes/Gardes-Pravorn-Carte.webp', 'eveillee',
   'Quand la cloche des remparts sonne, ils se rangent épaule contre épaule. Lance, épée et bouclier : ensemble, les gardes de Pravorn forment un mur qu''aucun champion du Grand Tournoi n''a jamais franchi.',
   '{"veine": "chaine", "nom": "Mur de Boucliers", "effet": "Les boucliers se serrent les uns contre les autres : nul ne passe tant que la garde tient.", "puissance": 40}',
   '{"veine": "trone", "nom": "Charge de la Garde", "effet": "Lances baissées, la garde charge d''un même pas, comme un seul homme.", "puissance": 60}')
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

-- Dans les boosters des Cendres, 1, 3 et 5 cartes (si SQL/boosters.sql est déjà installé)
do $$
begin
  if to_regclass('public.booster_cartes') is not null then
    insert into public.booster_cartes (booster_id, card_id)
    select b.id, c.id from public.cards c join public.boosters b on b.id in ('eclat', 'cendres', 'grand')
    where c.name in ('Garde de Pravorn', 'Gardes de Pravorn')
    on conflict do nothing;
  end if;
end $$;

-- Pour te les donner directement et les tester, retire les deux tirets de la ligne suivante (avec ton discord_id) :
-- select grant_card('TON_ID', id, 'recompense') from public.cards where name in ('Garde de Pravorn', 'Gardes de Pravorn');

select id, name, rarity, attack_1->>'nom' as attaque_1, attack_2->>'nom' as attaque_2
from public.cards where name in ('Garde de Pravorn', 'Gardes de Pravorn') order by id;
