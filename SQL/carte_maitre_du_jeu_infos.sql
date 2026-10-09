-- =====================================================================
--  Informations de la carte du Maître du Jeu (Transcendante), affichées
--  sur un voile transparent en bas de l'illustration, comme les autres cartes.
--  Ses attaques ne viennent d'aucune Veine : "destin" (icône 🎲).
--  Pas de rang. Noms, effets et puissances sont des propositions, à ajuster librement.
--
--  À exécuter dans Supabase > SQL Editor, APRÈS cartes_infos.sql.
--  Relançable sans problème.
-- =====================================================================
begin;

-- Autorise "destin" en plus des 12 Veines (sinon la contrainte cards_attack_*_check refuse)
create or replace function public.card_attack_is_valid(a jsonb)
returns boolean
language sql
immutable
as $$
  select a is null or (
    jsonb_typeof(a) = 'object'
    and a->>'veine' in ('sang', 'trone', 'regard', 'reve', 'tombeau', 'bete',
                        'forge', 'maree', 'racine', 'esprit', 'ombre', 'chaine',
                        'destin')
    and coalesce(btrim(a->>'nom'), '') <> ''
    and (a->'puissance' is null or jsonb_typeof(a->'puissance') in ('number', 'string', 'null'))
  );
$$;

update public.cards set
  rank = null,   -- pas de rang : le Maître du Jeu est au-dessus des rangs
  attack_1 = '{"veine": "destin", "nom": "Coup du Sort", "effet": "Relance n''importe quel dé, allié ou ennemi.", "puissance": 99}',
  attack_2 = '{"veine": "destin", "nom": "Plume du Codex", "effet": "Réécrit une règle du monde, le temps d''une scène.", "puissance": "∞"}'
where name = 'Maître du Jeu';

commit;

select name, rarity, rank, attack_1->>'nom' as attaque_1, attack_2->>'nom' as attaque_2
from public.cards order by id;
