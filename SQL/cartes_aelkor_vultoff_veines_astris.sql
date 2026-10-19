-- =====================================================================
--  Cartes à collectionner : la garde d'Aelkor, Vultoff, Les Veines et Astris, Reine de Pravorn
--    - « Garde d'Aelkor »   : un garde nain seul, rareté Commune (rubans argentés de l'illustration)
--    - « Gardes d'Aelkor »  : l'escouade naine, rareté Éveillée (rubans verts)
--    - « Vultoff »          : le Sans-Tête, rareté Légendaire (rubans rouges) — description provisoire
--                             (pas encore de page dans le Codex)
--    - « Les Veines »       : les Entités des douze Veines, rareté Transcendante (illustration pleine, cadre doré)
--    - « Astris, Reine de Pravorn » : la souveraine sur son trône, rareté Mythique (rubans bleus) — description
--                             provisoire (Codex : Pravorn est une monarchie héréditaire, née du grand tournoi)
--  Aelkor (Codex, Monde) : le pays des nains de l'ancienne Union, réputé pour son artisanat, sa métallurgie
--  et ses armes, sans dynastie : trois représentants élus par le peuple. Leurs attaques : la Forge (le métal),
--  la Chaîne (les rangs qui ne rompent pas) et le Trône (le serment aux trois élus).
--
--  En jeu (calcul de JS/jeu-cartes-moteur.js, uniteDepuisCarte, et capacités UNIQUES) :
--    Garde d'Aelkor   : coût 2, attaque 2, défense 1, vie 3 ;
--                       « Armure naine » : à son arrivée, gagne Bouclier (les premiers dégâts sont annulés)
--    Gardes d'Aelkor  : coût 3, attaque 3, défense 2, vie 4, Bouclier (1re attaque de la Forge) ;
--                       « Marteaux d'Aelkor » : à son arrivée, tes autres unités gagnent +1 Attaque
--    Vultoff          : coût 5, attaque 4, défense 4, vie 7, Riposte (Tombeau) et Drain (Sang) ;
--                       « Le Sans-Tête » : à son arrivée, inflige 3 dégâts au héros adverse,
--                       et ton héros récupère autant de PV
--    Les Veines       : coût 7 (2 actions, il faut déjà une de tes unités en jeu), attaque 6, défense 4,
--                       vie 7, Soin (Esprit) et Inspiration (Trône) ;
--                       « Éveil des Entités » : à son arrivée, tes autres unités gagnent +1 Attaque
--                       et +1 Défense, et ton héros récupère 4 PV
--    Astris           : coût 4, attaque 3, défense 3, vie 5, Inspiration (Trône) et Provocation (Chaîne) ;
--                       « Appel de la Couronne » : à son arrivée, un Milicien de la Couronne (2 / 1 / 2)
--                       rejoint ta rangée s'il reste une place
--  Elles sortent des boosters des Cendres (1, 3 et 5 cartes) et de l'Offrande du Voyageur (booster gratuit) ;
--  leurs attaques ont leur animation dans JS/jeu-cartes-attaques.js.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql (et boosters.sql pour les boosters).
--  Relançable : une carte déjà présente (même nom) est mise à jour.
-- =====================================================================
with nouvelles (name, image, rarity, description, attack_1, attack_2) as (values
  ('Garde d''Aelkor', 'img/Cartes/Garde-Aelkor-Carte.webp', 'commune',
   'Forgée dans les ateliers d''Aelkor, son armure ne craint ni la lame ni le feu. Le garde nain ne sert ni roi ni dynastie : marteau en main, il veille sur les trois élus du peuple.',
   '{"veine": "forge", "nom": "Coup de Marteau", "effet": "Un marteau de guerre nain s''abat de tout son poids : l''acier plie, la pierre se fend.", "puissance": 40}',
   '{"veine": "trone", "nom": "Serment des Trois", "effet": "Le garde frappe au nom des trois élus d''Aelkor, et son serment lui donne la force de deux.", "puissance": 50}'),
  ('Gardes d''Aelkor', 'img/Cartes/Gardes-Aelkor-Carte.webp', 'eveillee',
   'Quand les cloches des forges se taisent, la garde d''Aelkor descend les escaliers de pierre. Trois marteaux, un même pas : les nains ne reculent jamais devant ce qu''ils ont juré de protéger.',
   '{"veine": "forge", "nom": "Marteaux en Cadence", "effet": "Les marteaux tombent l''un après l''autre, au rythme des enclumes d''Aelkor.", "puissance": 45}',
   '{"veine": "chaine", "nom": "Rang d''Acier", "effet": "Épaule contre épaule, la garde avance comme un mur de métal que rien ne fait plier.", "puissance": 55}'),
  ('Vultoff', 'img/Cartes/Vultoff-Carte.webp', 'legendaire',
   'Assis sur un autel en ruine, sous la lune, Vultoff tient sa propre tête au creux de la main. Nul ne sait qui l''a décapité, ni pourquoi la mort a refusé de le prendre.',
   '{"veine": "tombeau", "nom": "Sentence du Sans-Tête", "effet": "Le regard de la tête tranchée se pose sur la cible : la mort qu''il a refusée, il la rend.", "puissance": 70}',
   '{"veine": "sang", "nom": "Moisson Pourpre", "effet": "Ses haillons rouges se déploient et boivent le sang de tout ce qu''ils touchent.", "puissance": 80}'),
  ('Les Veines', 'img/Cartes/Veines-Carte.webp', 'transcendante',
   'Les forces fondamentales du monde, rendues perceptibles sous la forme de leurs Entités : des silhouettes astrales qui ne servent personne, car chacune est la Veine elle-même.',
   '{"veine": "esprit", "nom": "Éveil des Entités", "effet": "Les Entités prennent forme autour du monde : leur seule présence fait plier la réalité.", "puissance": 90}',
   '{"veine": "trone", "nom": "Convergence des Douze", "effet": "Les douze Veines s''unissent un instant en un seul flot de pouvoir qui balaie tout.", "puissance": 120}'),
  ('Astris, Reine de Pravorn', 'img/Cartes/Astris-Carte.webp', 'mythique',
   'Héritière de la lignée née du grand tournoi, Astris règne sur le plus vaste royaume du continent. Sur son trône d''émeraude, elle n''élève jamais la voix : à Pravorn, un seul regard de la reine suffit à lever une armée.',
   '{"veine": "trone", "nom": "Décret de la Couronne", "effet": "Un ordre de la reine, et le royaume entier s''abat sur la cible.", "puissance": 50}',
   '{"veine": "chaine", "nom": "Loi du Tournoi", "effet": "La loi ancienne de Pravorn lie la cible : nul ne se dérobe au jugement de la Couronne.", "puissance": 60}')
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
    where c.name in ('Garde d''Aelkor', 'Gardes d''Aelkor', 'Vultoff', 'Les Veines', 'Astris, Reine de Pravorn')
    on conflict do nothing;
  end if;
end $$;

-- Pour te les donner directement et les tester, retire les deux tirets de la ligne suivante (avec ton discord_id) :
-- select grant_card('TON_ID', id, 'recompense') from public.cards where name in ('Garde d''Aelkor', 'Gardes d''Aelkor', 'Vultoff', 'Les Veines', 'Astris, Reine de Pravorn');

select id, name, rarity, attack_1->>'nom' as attaque_1, attack_2->>'nom' as attaque_2
from public.cards where name in ('Garde d''Aelkor', 'Gardes d''Aelkor', 'Vultoff', 'Les Veines', 'Astris, Reine de Pravorn') order by id;
