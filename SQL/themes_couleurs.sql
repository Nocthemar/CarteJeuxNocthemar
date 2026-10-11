-- =====================================================================
--  Trois thèmes de profil en boutique : Bleu, Violet, Orange
--  (Boutique > « L'armoire des apparences », items.shop = 'fun', items.kind = 'theme')
--
--  Un thème colore le profil du joueur : payload.accent (couleur principale) et payload.accent2
--  (seconde couleur) sont lus par JS/profil.js ; la boutique les montre en pastilles
--  (JS/boutique-commun.js), la roue des apparences en jeton (JS/collection-roue.js).
--  Achat : buy_fun_item (déjà en place) ; on l'équipe depuis le profil ou la roue de la collection.
--
--  À exécuter dans Supabase > SQL Editor. Relançable : un thème déjà présent (même nom) est mis à jour.
--  Prix : 300 pièces chacun, à changer ci-dessous si besoin.
-- =====================================================================

with nouveaux (name, description, price, accent, accent2) as (values
  ('Thème « Bleu des Abysses »', 'Le bleu froid des eaux profondes sous la lune.',  300, '#4f8fe8', '#9cc4ff'),
  ('Thème « Violet Améthyste »', 'L''éclat violet des cristaux de la Veine arcane.', 300, '#9a6cf0', '#c9b2fb'),
  ('Thème « Orange de Braise »', 'La chaleur des braises d''un feu de camp.',        300, '#e8873a', '#f6c27a')
),
maj as (
  update public.items i
  set description = n.description,
      price = n.price,
      payload = jsonb_build_object('accent', n.accent, 'accent2', n.accent2),
      is_available = true
  from nouveaux n
  where i.name = n.name and i.kind = 'theme'
  returning i.name
)
insert into public.items (name, kind, shop, price, is_available, description, payload)
select n.name, 'theme', 'fun', n.price, true, n.description, jsonb_build_object('accent', n.accent, 'accent2', n.accent2)
from nouveaux n
where not exists (select 1 from public.items i where i.name = n.name and i.kind = 'theme');
