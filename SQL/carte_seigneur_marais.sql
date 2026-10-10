-- =====================================================================
--  Carte à collectionner : le Seigneur des Marais (Personnages > Seigneur des Marais)
--  Divinité méconnue, porteuse de la « Veine des Marais » (hors des douze Veines recensées) :
--  ses attaques utilisent les Veines les plus proches, la Racine (la vase qui retient)
--  et la Marée (les eaux troubles).
--  Rareté Légendaire (cadre rouge de l'illustration). Pas de rang : le Codex l'ignore (« Rang ? »).
--
--  En jeu (calcul de JS/jeu-cartes-moteur.js, uniteDepuisCarte) :
--    coût 5, attaque 5, vie 6, et Garde (1re attaque de la Veine de la Racine).
--  Il sort du Booster des Cendres (SQL/boosters.sql) ; ses attaques ont leur animation
--  dans JS/jeu-cartes-attaques.js.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql (et boosters.sql pour le booster).
--  Relançable sans doublon.
-- =====================================================================
insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select 'Seigneur des Marais', 'img/Cartes/Marais-carte.png', 'legendaire',
       'Nul ne sait d''où il vient. Les marais, eux, se souviennent. Divinité méconnue, il porte une Veine qu''aucun registre ne recense.',
       'recompense', true, null,
       '{"veine": "racine", "nom": "Étreinte de la Vase", "effet": "La vase se referme sur la cible et la retient au fond des eaux.", "puissance": 60}',
       '{"veine": "maree", "nom": "Brume Stagnante", "effet": "Une brume épaisse monte des eaux mortes et étouffe tout ce qu''elle touche.", "puissance": 75}'
where not exists (select 1 from public.cards where name = 'Seigneur des Marais');

-- Dans les boosters des Cendres, 1, 3 et 5 cartes (si SQL/boosters.sql est déjà installé)
do $$
begin
  if to_regclass('public.booster_cartes') is not null then
    insert into public.booster_cartes (booster_id, card_id)
    select b.id, c.id from public.cards c join public.boosters b on b.id in ('eclat', 'cendres', 'grand')
    where c.name = 'Seigneur des Marais'
    on conflict do nothing;
  end if;
end $$;

-- Pour te la donner directement et la tester, retire les deux tirets de la ligne suivante (avec ton discord_id) :
-- select grant_card('TON_ID', id, 'recompense') from public.cards where name = 'Seigneur des Marais';

select c.id, c.name, c.rarity, c.attack_1->>'nom' as attaque_1, c.attack_2->>'nom' as attaque_2
from public.cards c where c.name = 'Seigneur des Marais';
