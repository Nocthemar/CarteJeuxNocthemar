// =====================================================================
//  Page toutes-les-cartes.html : toutes les cartes qui existent dans le jeu
//  - les cartes possédées par le joueur connecté : en couleur, avec « Possédée » (et ×N exemplaires)
//  - les autres : en gris, « Pas encore obtenue »
//  Filtres : recherche par nom, possession (toutes / possédées / manquantes), rareté.
//  Clic sur une carte : la carte en grand avec son Codex (ouvrirApercu, JS/cartes.js).
// =====================================================================
import { supabase, connexionDiscord, getMonJoueur } from './supabase.js';
import { $ } from './commun.js';
import { htmlCarte, ouvrirApercu } from './cartes.js';

const RANG = ['transcendante', 'legendaire', 'mythique', 'eveillee', 'commune'];
const etat = { cartes: [], possedees: new Map(), connecte: false, texte: '', possession: 'toutes', rarete: '' };

async function charger() {
  const [{ data: cartes }, moi] = await Promise.all([
    supabase.from('cards').select('*').eq('is_available', true).order('name'),
    getMonJoueur(),
  ]);
  // Les vraies cartes du jeu : illustrées, sans la carte d'exemple (comme les boosters)
  etat.cartes = (cartes ?? [])
    .filter((c) => c.image && c.description !== "Carte d'exemple")
    .sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'fr'));
  etat.connecte = !!moi;
  if (moi) {
    const { data } = await supabase.from('player_cards').select('card_id, quantite').eq('discord_id', moi.discord_id);
    etat.possedees = new Map((data ?? []).map((p) => [p.card_id, p.quantite ?? 1]));
  }
}
const rang = (c) => { const i = RANG.indexOf(c.rarity); return i < 0 ? RANG.length : i; };
const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function afficher() {
  const texte = sansAccents(etat.texte.trim());
  const liste = etat.cartes.filter((c) => {
    const a = etat.possedees.has(c.id);
    return (!texte || sansAccents(c.name).includes(texte))
      && (!etat.rarete || c.rarity === etat.rarete)
      && (etat.possession === 'toutes' || (etat.possession === 'possedees') === a);
  });
  $('grille').innerHTML = liste.length ? liste.map((c) => {
    const n = etat.possedees.get(c.id);
    const statut = !etat.connecte ? '' : n
      ? `<span class="catalogue__statut catalogue__statut--oui">Possédée${n > 1 ? ` <b>×${n}</b>` : ''}</span>`
      : '<span class="catalogue__statut">Pas encore obtenue</span>';
    return `
      <button type="button" class="catalogue__carte${etat.connecte && !n ? ' est-manquante' : ''}" data-carte-id="${c.id}"
        aria-label="${c.name.replace(/"/g, '&quot;')} : voir la carte">
        ${htmlCarte(c)}
        ${statut}
      </button>`;
  }).join('') : '<p class="vide">Aucune carte ne correspond.</p>';

  // Progression
  const total = etat.cartes.length;
  const nb = etat.cartes.filter((c) => etat.possedees.has(c.id)).length;
  $('progression').hidden = !etat.connecte;
  $('filtre-possession').hidden = !etat.connecte;
  $('non-connecte').hidden = etat.connecte;
  $('nb-possedees').textContent = nb;
  $('nb-total').textContent = total;
  $('jauge').style.width = `${total ? (nb / total) * 100 : 0}%`;
}

// Un groupe de boutons radio : un seul coché
function radio(groupe, attribut, surChoix) {
  $(groupe).addEventListener('click', (e) => {
    const b = e.target.closest(`[${attribut}]`);
    if (!b) return;
    $(groupe).querySelectorAll(`[${attribut}]`).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    surChoix(b.getAttribute(attribut));
    afficher();
  });
}

radio('filtre-possession', 'data-possession', (v) => { etat.possession = v; });
radio('filtre-rarete', 'data-rarete', (v) => { etat.rarete = v; });
$('recherche').addEventListener('input', (e) => { etat.texte = e.target.value; afficher(); });
$('btn-connexion').addEventListener('click', connexionDiscord);
$('grille').addEventListener('click', (e) => {
  const b = e.target.closest('[data-carte-id]');
  if (b) ouvrirApercu(etat.cartes.find((c) => String(c.id) === b.dataset.carteId));
});

await charger();
afficher();
