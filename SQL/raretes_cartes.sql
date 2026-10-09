-- =====================================================================
--  Nouveau système de rareté des cartes :
--    commune (gris cendre) · eveillee (vert profond) · mythique (bleu profond)
--    legendaire (rouge sombre) · transcendante (doré cerné de noir)
--  À exécuter une fois dans Supabase > SQL Editor (base déjà créée avec
--  l'ancien système commune / rare / epique / legendaire).
-- =====================================================================
begin;

alter table public.cards drop constraint if exists cards_rarity_check;

-- Anciennes valeurs -> nouvelles (rare -> mythique, epique -> transcendante)
update public.cards set rarity = 'mythique'      where rarity = 'rare';
update public.cards set rarity = 'transcendante' where rarity = 'epique';

-- Cartes existantes : Kaéliss et Dalek légendaires (rouge), Maître du Jeu transcendante (doré)
update public.cards set rarity = 'legendaire'    where name in ('Kaéliss', 'Dalek');
update public.cards set rarity = 'transcendante' where name = 'Maître du Jeu';

alter table public.cards add constraint cards_rarity_check
  check (rarity in ('commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'));

commit;

select name, rarity from public.cards order by id;
