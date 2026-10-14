// =====================================================================
//  Page collection : deux choix
//  - ouvrir le grimoire : les cartes du joueur connecté (ce fichier) ; collection.html#grimoire l'ouvre d'office
//  - ouvrir la roue des apparences, en grand : plateaux, thèmes, titres, bannières (JS/collection-roue.js) ;
//    collection.html#roue l'ouvre d'office
//  Le grimoire :
//  - 9 pochettes par page, rangement libre par glisser-déposer
//    (ou : toucher une carte, puis la pochette où la poser)
//  - Deck du profil en haut de page (5 cartes max)
//  - Les échanges entre joueurs sont sur la page Marché (marche.html#echanges, JS/marche-echanges.js) ;
//    l'ancien lien collection.html?avec=<discord_id> y mène
//  - Doublons (SQL/doublons.sql) : une carte peut avoir plusieurs exemplaires (« ×N » sur sa pochette) ;
//    ♻ recycle les exemplaires en trop d'une carte, « Recycler tous les doublons » les recycle tous,
//    contre de l'or et de l'XP de pass (le dernier exemplaire est toujours gardé)
//  La position des cartes est enregistrée via move_card (SQL/cartes_collection.sql) ;
//  les nouvelles cartes se placent seules dans la première pochette libre (côté serveur).
// =====================================================================
import { supabase, connexionDiscord, getMonJoueur } from './supabase.js';
import { $, notifier } from './commun.js';
import { htmlCarte, chargerDeck, Deck, activerGlisser, boutonLoupe, ouvrirApercu } from './cartes.js';
import { initRoue } from './collection-roue.js';

// Ancien lien d'échange (collection.html?avec=…) : les échanges sont maintenant sur la page Marché
const ancienEchange = new URLSearchParams(location.search).get('avec');
if (ancienEchange) location.replace(`marche.html?avec=${encodeURIComponent(ancienEchange)}#echanges`);

const PAR_PAGE = 9;
const PAGES_MAX = 100;
const DUREE_SURVOL_PAGE = 650;   // ms à survoler "page suivante" en glissant une carte pour tourner la page

const modeSimple = matchMedia('(max-width: 800px)');     // une seule page visible sur téléphone
const sansAnimation = matchMedia('(prefers-reduced-motion: reduce)');

const etat = {
  cartes: new Map(),   // id -> { carte, page, slot, quantite }
  courante: 1,         // page affichée (page de gauche en double page)
  selection: null,     // id de la carte touchée, en attente d'une pochette
  animation: false,
};
let deck;


// Les cartes du joueur, avec leur nombre d'exemplaires (1 si SQL/doublons.sql n'est pas encore lancé)
async function lireCartes(discordId) {
  const avec = await supabase.from('player_cards').select('page, slot, quantite, card:cards(*)').eq('discord_id', discordId);
  if (!avec.error) return avec;
  return supabase.from('player_cards').select('page, slot, card:cards(*)').eq('discord_id', discordId);
}
const remplir = (lignes) => {
  etat.cartes.clear();
  for (const { page, slot, quantite, card } of lignes ?? []) etat.cartes.set(card.id, { carte: card, page, slot, quantite: quantite ?? 1 });
};

async function init() {
  const moi = await getMonJoueur();

  if (!moi) {
    $('chargement').hidden = true;
    $('non-connecte').hidden = false;
    $('btn-connexion').addEventListener('click', connexionDiscord);
    return;
  }

  const [{ data, error }, deckJoueur] = await Promise.all([
    lireCartes(moi.discord_id),
    chargerDeck(moi.discord_id),
  ]);

  if (error) {
    $('chargement').textContent = "Impossible d'ouvrir le grimoire pour l'instant.";
    return;
  }

  remplir(data);

  deck = new Deck($('deck'), { ...deckJoueur, editable: true, surChangement: afficher });

  $('grimoire-titre').textContent = `Grimoire de ${moi.username ?? 'l’aventurier'}`;
  $('collection-vide').hidden = etat.cartes.size > 0;
  afficher();

  const n = etat.cartes.size;
  $('livre-compte').textContent = `${n} carte${n > 1 ? 's' : ''}`;
  $('chargement').hidden = true;
  const vue = VUES[location.hash.slice(1)] ? location.hash.slice(1) : null;
  if (vue) ouvrir(vue, false);
  else $('choix').hidden = false;
  initRoue(moi).then((n) => {
    $('roue-compte').textContent = `${n} objet${n > 1 ? 's' : ''}`;
  }).catch((e) => {
    console.error(e);
    $('roue-centre').innerHTML = '<span class="roue__vide">Impossible de charger ta collection.</span>';
  });
}


// Après un échange accepté : les cartes et le deck relus (des cartes sont parties, d'autres arrivées)
async function recharger() {
  const moi = await getMonJoueur();
  if (!moi) return;
  const [{ data }, deckJoueur] = await Promise.all([
    lireCartes(moi.discord_id),
    chargerDeck(moi.discord_id),
  ]);
  remplir(data);
  etat.selection = null;
  deck = new Deck($('deck'), { ...deckJoueur, editable: true, surChangement: afficher });
  const n = etat.cartes.size;
  $('livre-compte').textContent = `${n} carte${n > 1 ? 's' : ''}`;
  $('collection-vide').hidden = n > 0;
  afficher();
}


// ---------------------------------------------------------------------
//  Les deux choix : le grimoire ou la roue s'ouvre (et se referme) à la place de l'écran de choix
// ---------------------------------------------------------------------
const VUES = {
  grimoire: { vue: 'collection', bouton: 'btn-ouvrir-livre', classe: 'collection--ouverture', fermer: '← Refermer le grimoire' },
  roue: { vue: 'vue-roue', bouton: 'btn-ouvrir-roue', classe: 'vue-roue--ouverture', fermer: '← Refermer la roue' },
};
let vueOuverte = null;
function ouvrir(nom, anime = true) {
  const v = VUES[nom];
  $('choix').hidden = true;
  for (const autre of Object.values(VUES)) $(autre.vue).hidden = autre !== v;
  $(v.vue).classList.toggle(v.classe, anime && !sansAnimation.matches);
  history.replaceState(null, '', `#${nom}`);
  vueOuverte = nom;
  $('btn-fermer').textContent = v.fermer;
  $('btn-fermer').hidden = false;
  if (nom === 'grimoire') afficher();
  scrollTo(0, 0);
  if (nom === 'roue') $('roue').focus({ preventScroll: true });
}
function fermer(nom) {
  vueOuverte = null;
  $('btn-fermer').hidden = true;
  $(VUES[nom].vue).hidden = true;
  $('choix').hidden = false;
  history.replaceState(null, '', location.pathname);
  scrollTo(0, 0);
  $(VUES[nom].bouton).focus();
}
$('btn-ouvrir-livre').addEventListener('click', () => ouvrir('grimoire'));
$('btn-fermer').addEventListener('click', () => { if (vueOuverte) fermer(vueOuverte); });
$('btn-ouvrir-roue').addEventListener('click', () => ouvrir('roue'));


// ---------------------------------------------------------------------
//  Rendu
// ---------------------------------------------------------------------
const pas = () => (modeSimple.matches ? 1 : 2);

// Toujours au moins une page libre après la dernière utilisée, en nombre pair (doubles pages)
function totalPages() {
  let derniere = 0;
  for (const { page } of etat.cartes.values()) derniere = Math.max(derniere, page);
  const total = Math.min(PAGES_MAX, Math.max(2, derniere + 1));
  return total + (total % 2);
}

function romain(n) {
  const chiffres = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [valeur, lettres] of chiffres) {
    while (n >= valeur) { s += lettres; n -= valeur; }
  }
  return s;
}

function htmlPage(num, cote) {
  if (num < 1 || num > totalPages()) return `<div class="page page--${cote} page--vierge"></div>`;

  const index = new Map();
  for (const [id, c] of etat.cartes) if (c.page === num) index.set(c.slot, id);

  let pochettes = '';
  for (let slot = 1; slot <= PAR_PAGE; slot++) {
    const id = index.get(slot);
    if (id == null) {
      pochettes += `<div class="pochette" data-page="${num}" data-slot="${slot}"></div>`;
      continue;
    }
    const auDeck = deck.contient(id);
    const selection = etat.selection === id ? ' pochette--selection' : '';
    pochettes += `
      <div class="pochette pochette--pleine${selection}" data-page="${num}" data-slot="${slot}">
        ${htmlCarte(etat.cartes.get(id).carte)}
        ${etat.cartes.get(id).quantite > 1 ? `<span class="pochette__nb" title="${etat.cartes.get(id).quantite} exemplaires">×${etat.cartes.get(id).quantite}</span>
        <button type="button" class="carte-recycler" data-recycler="${id}" title="Recycler les doublons" aria-label="Recycler les doublons">♻</button>` : ''}
        <button type="button" class="carte-etoile${auDeck ? ' carte-etoile--active' : ''}" data-etoile="${id}"
          aria-pressed="${auDeck}" title="${auDeck ? 'Retirer du deck' : 'Ajouter au deck'}">★</button>
        ${boutonLoupe(id)}
      </div>`;
  }

  return `
    <div class="page page--${cote}" data-page="${num}">
      <div class="page__grille">${pochettes}</div>
      <span class="page__num">${romain(num)}</span>
    </div>`;
}

function afficher() {
  if (!deck) return;   // pas encore chargé
  const total = totalPages();
  // La page courante reste valide si le livre rétrécit, et impaire en double page
  etat.courante = Math.min(etat.courante, modeSimple.matches ? total : total - 1);
  if (!modeSimple.matches && etat.courante % 2 === 0) etat.courante -= 1;

  $('page-gauche').innerHTML = htmlPage(etat.courante, 'gauche');
  $('page-droite').innerHTML = modeSimple.matches ? '' : htmlPage(etat.courante + 1, 'droite');

  $('folio').textContent = modeSimple.matches
    ? `Folio ${romain(etat.courante)} sur ${romain(total)}`
    : `Folios ${romain(etat.courante)}–${romain(etat.courante + 1)} sur ${romain(total)}`;
  majDoublons();
  $('page-prec').disabled = etat.courante <= 1;
  $('page-suiv').disabled = etat.courante + pas() > total;
}


// ---------------------------------------------------------------------
//  Tourner les pages
// ---------------------------------------------------------------------
const attendre = (el, ms) => new Promise((ok) => {
  el.addEventListener('animationend', ok, { once: true });
  el.addEventListener('transitionend', ok, { once: true });
  setTimeout(ok, ms);   // filet de sécurité si l'évènement ne vient jamais
});

async function tourner(sens) {
  const cible = etat.courante + sens * pas();
  if (etat.animation || cible < 1 || cible > totalPages()) return;

  if (sansAnimation.matches) {
    etat.courante = cible;
    afficher();
    return;
  }
  etat.animation = true;

  if (modeSimple.matches) {
    // Une seule page : elle pivote sur la reliure, puis la suivante apparaît
    const page = $('page-gauche');
    page.classList.add(sens > 0 ? 'tourne-suiv' : 'tourne-prec');
    await attendre(page, 400);
    etat.courante = cible;
    afficher();
    page.classList.remove('tourne-suiv', 'tourne-prec');
    page.classList.add('page-arrivee');
    await attendre(page, 400);
    page.classList.remove('page-arrivee');
  } else {
    // Double page : une feuille (recto = page qui part, verso = page qui arrive) pivote sur le dos
    const feuille = document.createElement('div');
    feuille.className = `feuille feuille--${sens > 0 ? 'suivante' : 'precedente'}`;
    feuille.inert = true;
    const [recto, verso] = sens > 0
      ? [htmlPage(etat.courante + 1, 'droite'), htmlPage(cible, 'gauche')]
      : [htmlPage(etat.courante, 'gauche'), htmlPage(cible + 1, 'droite')];
    feuille.innerHTML = `
      <div class="feuille__face feuille__recto">${recto}</div>
      <div class="feuille__face feuille__verso">${verso}</div>`;

    // Sous la feuille, la page découverte est déjà la nouvelle
    if (sens > 0) $('page-droite').innerHTML = htmlPage(cible + 1, 'droite');
    else $('page-gauche').innerHTML = htmlPage(cible, 'gauche');

    $('double').append(feuille);
    feuille.getBoundingClientRect();   // force le navigateur à poser l'état de départ
    feuille.classList.add('feuille--tournee');
    await attendre(feuille, 1100);

    etat.courante = cible;
    afficher();
    feuille.remove();
  }

  etat.animation = false;
}

$('page-prec').addEventListener('click', () => tourner(-1));
$('page-suiv').addEventListener('click', () => tourner(1));

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || $('collection').hidden) return;
  if (e.key === 'ArrowLeft') tourner(-1);
  if (e.key === 'ArrowRight') tourner(1);
  if (e.key === 'Escape' && etat.selection != null) {
    etat.selection = null;
    afficher();
  }
});

modeSimple.addEventListener('change', afficher);


// ---------------------------------------------------------------------
//  Ranger une carte
// ---------------------------------------------------------------------
async function deplacer(id, page, slot) {
  const c = etat.cartes.get(id);
  if (!c || (c.page === page && c.slot === slot)) return;

  // Mise à jour immédiate à l'écran ; la pochette occupée échange sa carte
  const depart = { page: c.page, slot: c.slot };
  const occupant = [...etat.cartes.values()].find((o) => o.page === page && o.slot === slot);
  if (occupant) Object.assign(occupant, depart);
  Object.assign(c, { page, slot });
  afficher();

  const { error } = await supabase.rpc('move_card', { p_card_id: id, p_page: page, p_slot: slot });
  if (error) {
    Object.assign(c, depart);
    if (occupant) Object.assign(occupant, { page, slot });
    afficher();
    notifier(error.message, 'erreur');
  }
}

function deposer(el, cible) {
  const id = Number(el.dataset.carte);
  if (cible.matches('.deck-emplacement')) {
    deck.placer(id, Number(cible.dataset.position), etat.cartes.get(id)?.carte);
  } else if (cible.matches('.pochette') && el.closest('.pochette')) {
    deplacer(id, Number(cible.dataset.page), Number(cible.dataset.slot));
  }
}

activerGlisser(document.querySelector('.collection-wrap'), {
  poignee: '.pochette .carte-jeu, .deck-emplacement .carte-jeu',
  cible: '.pochette, .deck-emplacement',
  deposer,
});

// En glissant une carte, s'attarder sur "page suivante / précédente" tourne la page
let survolPage = { bouton: null, minuteur: null };
window.addEventListener('pointermove', (e) => {
  const bouton = document.body.classList.contains('glisser-actif')
    ? document.elementFromPoint(e.clientX, e.clientY)?.closest('.btn-page:not(:disabled)') ?? null
    : null;
  if (bouton === survolPage.bouton) return;
  clearInterval(survolPage.minuteur);
  survolPage = { bouton, minuteur: null };
  if (bouton) {
    survolPage.minuteur = setInterval(() => tourner(bouton.id === 'page-suiv' ? 1 : -1), DUREE_SURVOL_PAGE);
  }
});
window.addEventListener('pointerup', () => {
  clearInterval(survolPage.minuteur);
  survolPage = { bouton: null, minuteur: null };
});

// Sans glisser : toucher une carte, puis une pochette (ou un emplacement du deck)
$('collection').addEventListener('click', (e) => {
  const loupe = e.target.closest('#double [data-loupe]');
  if (loupe) {
    ouvrirApercu(etat.cartes.get(Number(loupe.dataset.loupe))?.carte);
    return;
  }

  const recycler = e.target.closest('[data-recycler]');
  if (recycler) { ouvrirRecyclage(Number(recycler.dataset.recycler)); return; }

  const etoile = e.target.closest('[data-etoile]');
  if (etoile) {
    const id = Number(etoile.dataset.etoile);
    deck.basculer(id, etat.cartes.get(id).carte);
    return;
  }

  const pochette = e.target.closest('#double .pochette');
  const emplacement = e.target.closest('#deck .deck-emplacement');

  if (etat.selection != null && (pochette || emplacement) && !e.target.closest('[data-action]')) {
    const id = etat.selection;
    etat.selection = null;
    if (pochette) deplacer(id, Number(pochette.dataset.page), Number(pochette.dataset.slot));
    else deck.placer(id, Number(emplacement.dataset.position), etat.cartes.get(id).carte);
    afficher();
    return;
  }

  const carte = e.target.closest('#double .pochette .carte-jeu');
  if (carte) {
    etat.selection = Number(carte.dataset.carte);
    afficher();
  }
});

// ---------------------------------------------------------------------
//  Doublons : recycler contre de l'or et de l'XP de pass (SQL/doublons.sql)
// ---------------------------------------------------------------------
const VALEUR = { commune: 20, eveillee: 40, mythique: 80, legendaire: 150, transcendante: 300 };
const valeur = (carte) => VALEUR[carte.rarity] ?? 20;
const gains = (or, ex) => `+${or.toLocaleString('fr-FR')} or · +${10 * ex} XP de pass`;

function majDoublons() {
  let ex = 0, or = 0;
  for (const { carte, quantite } of etat.cartes.values()) if (quantite > 1) { ex += quantite - 1; or += (quantite - 1) * valeur(carte); }
  $('doublons-tout').hidden = ex === 0;
  $('doublons-nombre').textContent = `${ex} doublon${ex > 1 ? 's' : ''} à recycler`;
  $('doublons-gain').textContent = ex ? gains(or, ex) : '';
}

let recyclage = { id: null, nombre: 1 };
function ouvrirRecyclage(id) {
  const c = etat.cartes.get(id);
  if (!c || c.quantite < 2) return;
  recyclage = { id, nombre: c.quantite - 1 };
  $('recyclage-carte').innerHTML = htmlCarte(c.carte);
  $('recyclage-titre').textContent = `Recycler « ${c.carte.name} »`;
  $('recyclage-texte').textContent = `Tu en as ${c.quantite} exemplaires. Le dernier est toujours gardé dans ton grimoire.`;
  majRecyclage();
  $('recyclage').showModal();
  $('recyclage-ok').focus();
}
function majRecyclage() {
  const c = etat.cartes.get(recyclage.id);
  recyclage.nombre = Math.max(1, Math.min(recyclage.nombre, c.quantite - 1));
  $('recyclage-nombre').textContent = recyclage.nombre;
  $('recyclage-gain').textContent = gains(valeur(c.carte) * recyclage.nombre, recyclage.nombre);
  document.querySelectorAll('.recyclage__pas').forEach((b) => {
    b.disabled = Number(b.dataset.pas) < 0 ? recyclage.nombre <= 1 : recyclage.nombre >= c.quantite - 1;
  });
}
$('recyclage').addEventListener('click', async (e) => {
  if (e.target === $('recyclage') || e.target.closest('#recyclage-annuler')) { $('recyclage').close(); return; }
  const pas = e.target.closest('[data-pas]');
  if (pas) { recyclage.nombre += Number(pas.dataset.pas); majRecyclage(); return; }
  if (!e.target.closest('#recyclage-ok') || $('recyclage-ok').disabled) return;
  $('recyclage-ok').disabled = true;
  const { data, error } = await supabase.rpc('recycler_carte', { p_card_id: recyclage.id, p_nombre: recyclage.nombre });
  $('recyclage-ok').disabled = false;
  if (error) { notifier(error.message || 'Recyclage impossible.', 'erreur'); return; }
  etat.cartes.get(recyclage.id).quantite = data.restants;
  $('recyclage').close();
  notifier(`♻ ${data.exemplaires} exemplaire${data.exemplaires > 1 ? 's' : ''} recyclé${data.exemplaires > 1 ? 's' : ''} : ${gains(data.or, data.exemplaires)}`);
  afficher();
});

$('btn-recycler-tout').addEventListener('click', async () => {
  const bouton = $('btn-recycler-tout');
  if (!confirm(`Recycler tous tes doublons ? Tu gardes un exemplaire de chaque carte. (${$('doublons-gain').textContent})`)) return;
  bouton.disabled = true;
  const { data, error } = await supabase.rpc('recycler_doublons');
  bouton.disabled = false;
  if (error) { notifier(error.message || 'Recyclage impossible.', 'erreur'); return; }
  for (const c of etat.cartes.values()) c.quantite = 1;
  notifier(`♻ ${data.exemplaires} doublon${data.exemplaires > 1 ? 's' : ''} recyclé${data.exemplaires > 1 ? 's' : ''} : ${gains(data.or, data.exemplaires)}`);
  afficher();
});

init();
