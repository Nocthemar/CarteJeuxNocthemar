-- =====================================================================
--  Informations des cartes (affichées dans le cadre noir en bas de la carte) :
--    rank      : rang de puissance, 1 à 5 (Rang I = le plus puissant)
--    attack_1  : 1re attaque, attack_2 : 2e attaque, au format JSON :
--      { "veine": "sang", "nom": "…", "effet": "…", "puissance": 60 }
--      veine     : sang, trone, regard, reve, tombeau, bete, forge, maree,
--                  racine, esprit, ombre, chaine
--      puissance : facultative
--  La rareté existe déjà (colonne rarity).
--
--  À exécuter une fois dans Supabase > SQL Editor.
--  Crée aussi une carte d'exemple (données fictives) donnée à Jules pour tester.
-- =====================================================================
begin;

alter table public.cards add column if not exists rank     smallint;
alter table public.cards add column if not exists attack_1 jsonb;
alter table public.cards add column if not exists attack_2 jsonb;

-- Vérifie une attaque : une Veine connue et un nom (effet et puissance facultatifs)
create or replace function public.card_attack_is_valid(a jsonb)
returns boolean
language sql
immutable
as $$
  select a is null or (
    jsonb_typeof(a) = 'object'
    and a->>'veine' in ('sang', 'trone', 'regard', 'reve', 'tombeau', 'bete',
                        'forge', 'maree', 'racine', 'esprit', 'ombre', 'chaine',
                        'destin')   -- destin : hors Veines, pouvoirs du Maître du Jeu
    and coalesce(btrim(a->>'nom'), '') <> ''
    and (a->'puissance' is null or jsonb_typeof(a->'puissance') in ('number', 'string', 'null'))
  );
$$;

alter table public.cards drop constraint if exists cards_rank_check;
alter table public.cards add constraint cards_rank_check check (rank is null or rank between 1 and 5);

alter table public.cards drop constraint if exists cards_attack_1_check;
alter table public.cards add constraint cards_attack_1_check check (public.card_attack_is_valid(attack_1));

alter table public.cards drop constraint if exists cards_attack_2_check;
alter table public.cards add constraint cards_attack_2_check check (public.card_attack_is_valid(attack_2));


-- ---------------------------------------------------------------------
--  Carte d'exemple (données fictives), avec l'illustration de Kaéliss
--  Pour la supprimer : delete from cards where description = 'Carte d''exemple';
-- ---------------------------------------------------------------------
insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select 'Veilleuse Écarlate', 'img/Cartes/Kaéliss-Carte.webp', 'legendaire', 'Carte d''exemple', 'recompense', true, 2,
  '{"veine": "sang", "nom": "Saignée Pourpre", "effet": "Draine la vie de la cible et soigne la Veilleuse.", "puissance": 60}',
  '{"veine": "ombre", "nom": "Voile de Cendres", "effet": "Disparaît dans l''ombre jusqu''au prochain tour.", "puissance": 30}'
where not exists (select 1 from public.cards where description = 'Carte d''exemple');

select name, grant_card('568371989547319296', id, 'recompense') as nouvelle
from public.cards where description = 'Carte d''exemple';

commit;

notify pgrst, 'reload schema';
