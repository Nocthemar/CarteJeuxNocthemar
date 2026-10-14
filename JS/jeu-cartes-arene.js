// =====================================================================
//  Duel des Couronnes — affichage : cartes à facettes, plateau, d20,
//  effets visuels (UFX : unités à l'arrivée, SFX : sorts), animations.
//  Aucune règle ici : tout vient de JS/jeu-cartes-moteur.js.
// =====================================================================
import { SITE_ROOT } from './supabase.js';
import { animationsReduites } from './preferences.js';
import { $, esc } from './commun.js';
import { htmlInfos } from './cartes.js';
import {
  ENERGIE_MAX, COUT_DESTIN, COUT_DEFAUSSE, COUT_MEDITER, CAPACITES, UNIQUES,
  peutJouer, peutAttaquer, peutDefendre, peutActiver, capaciteActive, peutDestin, peutDefausser, peutMediter,
  rollInfo, coutDe, actionsDe, capsDe, attaqueDe, defenseDe, trouver,
  terrainDe,
} from './jeu-cartes-moteur.js';
import { jouerSon, SM } from './jeu-cartes-son.js';
import { particules, onde, flash, voile, secousseEcran, eclair, briser, recul, annonce, envol, symbole } from './jeu-cartes-effets.js';
import { styleAttaque, couleursVeine } from './jeu-cartes-attaques.js';

export const reduit = animationsReduites();

// Pause d'animation : nulle si l'utilisateur réduit les animations ou si l'onglet est caché
export const pause = (ms) => new Promise((r) => setTimeout(r, reduit || document.hidden ? 0 : ms));


// ---------------------------------------------------------------------
//  Illustrations
// ---------------------------------------------------------------------
// Couleur sourde de chaque Veine (fond low poly des sorts)
const TEINTES = {
  forge: [176, 112, 60], ombre: [74, 79, 106], racine: [95, 125, 79], trone: [179, 149, 64],
  regard: [109, 127, 168], sang: [142, 59, 59], maree: [63, 111, 134],
};
// Silhouettes (ICON) des sorts et du milicien, en 24 × 24
const ICON = {
  unit: 'M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 3 2 4 1-2 1-4 1-7z',
  face: 'M13 2 4 14h6l-1 8 9-12h-6z',
  heal: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  buff: 'M3 8l4 3 5-6 5 6 4-3-2 11H5z',
  draw: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  aoe: 'M2 15c3-4 5-4 7 0s4 4 7 0 4-4 6 0v5H2z',
  epee: 'M14 3h7v7L10 21l-3-3L18 7V3zM4 15l5 5-2 2-5-5z',
  bouclier: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z',
  arc: 'M6 2c9 4 9 16 0 20l-1-2c7-3 7-13 0-16zM5 12h15l-3-3m3 3-3 3',
  croc: 'M3 4c4 1 6 4 6 9l3 7 3-7c0-5 2-8 6-9-2 4-2 8-3 11l-6 7-6-7C5 12 5 8 3 4z',
  lance: 'M20 2l-2 6-2-2zM17 7 4 20l-1-1L16 6z',
};

// Fond low poly (grille de triangles) teinté par la Veine, avec une silhouette au centre
function artSVG(c) {
  let s = [...String(c.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const [R, G, B] = TEINTES[c.veine] ?? [107, 111, 120];
  const W = 60, H = 44, n = 4, m = 3, pts = [];
  for (let j = 0; j <= m; j++) {
    pts[j] = [];
    for (let i = 0; i <= n; i++) {
      const bord = i === 0 || i === n || j === 0 || j === m;
      pts[j][i] = [i * W / n + (bord ? 0 : (r() - 0.5) * 9), j * H / m + (bord ? 0 : (r() - 0.5) * 9)];
    }
  }
  const tri = [];
  const teinte = (y) => {
    const l = 0.35 + (1 - y / H) * 0.35 + r() * 0.18;
    return `rgb(${Math.round(R * l)},${Math.round(G * l)},${Math.round(B * l)})`;
  };
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const a = pts[j][i], b = pts[j][i + 1], cc = pts[j + 1][i + 1], d = pts[j + 1][i];
    const P = (x, y, z) => tri.push(`<path d="M${x}L${y}L${z}Z" fill="${teinte((x[1] + y[1] + z[1]) / 3)}"/>`);
    P(a, b, cc); P(a, cc, d);
  }
  const icone = ICON[c.fx ?? c.icone] ?? ICON.epee;
  return `<svg class="dc-art-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${tri.join('')}
    <path d="${icone}" transform="translate(18 10) scale(1)" fill="rgba(240,236,227,.88)" stroke="rgba(0,0,0,.35)" stroke-width=".6"/></svg>`;
}

const rarete = (c) => c.carte?.rarity ?? (c.t === 's' ? 'sort' : 'commune');
const nomsCapacites = (c) => capsDe(c).map((k) => CAPACITES[k]?.nom).filter(Boolean);
// Icônes des capacités (24 × 24, remplies)
const ICONES_CAP = {
  garde: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z',
  provocation: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  charge: 'M13 2 4 14h6l-1 8 9-12h-6z',
  riposte: 'M4 3h3l9 9-3 3-9-9zM20 3h-3l-4 4 3 3 4-4zM3 18l3-3 3 3-3 3zM21 18l-3-3-3 3 3 3z',
  interception: 'M12 2 4 5v6c0 5 3.5 9 8 11zM14 8h4l-2-3zM14 10h6v3h-6zM14 15h4l-2 3z',
  esquive: 'M3 7h11a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3zM3 11h16a3 3 0 1 1-3 3h2a1 1 0 1 0 1-1H3zM3 16h8v2H3z',
  bouclier: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3 5 2v4c0 3.5-2.2 6-5 7.5C9.2 17 7 14.5 7 11V7z',
  soin: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11zm-1 7v3H8v2h3v3h2v-3h3v-2h-3v-3z',
  inspiration: 'M3 8l4 3 5-6 5 6 4-3-2 11H5z',
  percee: 'M2 11h14l-4-4 2-2 8 7-8 7-2-2 4-4H2z',
  drain: 'M12 21 4 13a5 5 0 0 1 8-6 5 5 0 0 1 8 6zM11 9v3H8v2h3v3h2v-3h3v-2h-3V9z',
};
const urlImage = (c) => (c.carte?.image ? esc(new URL(c.carte.image, SITE_ROOT)) : null);
// Texte des cartes du Codex : l'effet d'un sort, les capacités d'une troupe
const texteCarte = (c) => (c.t === 's' ? c.d : nomsCapacites(c).join(' · '));

// Face d'une carte, la même partout (main, terrain, aperçu, accueil) :
// - vraie carte : l'illustration originale en entier, avec dans son cadre noir le nom, le rang,
//   les attaques et la rareté (comme dans la Collection : htmlInfos de JS/cartes.js)
// - carte du Codex : la même silhouette, cadre argenté, fond low poly et bandeau noir
function faceCarte(c) {
  const url = urlImage(c);
  if (url) return `
    <span class="dc-face dc-face--hote">
      <img class="dc-face dc-face--image" src="${url}" alt="" draggable="false" loading="lazy">
      ${htmlInfos(c.carte)}
    </span>`;
  // Carte du Codex : le même cadre que les vraies cartes (img/Cartes/Cadre-codex.webp, argenté ;
  // Cadre-objet.webp, doré, pour les objets de pouvoir), l'illustration dans la fenêtre, le texte dans le panneau noir
  return `
    <span class="dc-face dc-face--codex rar-${c.image ? 'objet' : rarete(c)}">
      <span class="dc-face__art${c.image ? ' dc-face__art--objet' : ''}">${c.image
        ? `<img src="${esc(new URL(c.image, SITE_ROOT))}" alt="" draggable="false" loading="lazy">`
        : artSVG(c)}</span>
      <img class="dc-face__cadre-img" src="img/Cartes/${c.image ? 'Cadre-objet' : 'Cadre-codex'}.webp" alt="" draggable="false">
      <span class="dc-face__panneau">
        <span class="dc-face__nom">${esc(c.n)}</span>
        <span class="dc-face__texte">${esc(texteCarte(c))}</span>
      </span>
    </span>`;
}

// Les capacités : une rangée d'icônes en haut à droite (une couronne si la carte a une capacité unique)
function htmlCapacites(c) {
  const caps = capsDe(c);
  const unique = UNIQUES[c.unique ?? c.def?.unique];
  if (!caps.length && !unique) return '';
  return `<span class="dc-caps">${caps.map((k) => `<span class="dc-k" data-infobulle="${esc(`${CAPACITES[k]?.nom ?? k} : ${CAPACITES[k]?.texte ?? ''}`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${ICONES_CAP[k] ?? ICONES_CAP.garde}"/></svg></span>`).join('')}${unique
    ? `<span class="dc-k dc-k--unique" data-infobulle="${esc(`${unique.nom} : ${unique.texte}`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONES_CAP.inspiration}"/></svg></span>` : ''}</span>`;
}
// Attaque, Défense, PV (la valeur du moment est mise en avant si elle a changé)
const htmlStats = (a, d, h, { aMod = false, dMod = 0 } = {}) => `
  <span class="dc-stat dc-stat--a${aMod ? ' dc-stat--mod' : ''}" title="Attaque">${a}</span>
  <span class="dc-stat dc-stat--d${dMod > 0 ? ' dc-stat--plus' : dMod < 0 ? ' dc-stat--moins' : ''}" title="Défense">${d}</span>
  <span class="dc-stat dc-stat--h" title="PV">${h}</span>`;

// Carte en main (ou en aperçu, ou à l'accueil)
export function htmlCarte(c, { index = null, jouable = false, choisie = false, cout = c.c } = {}) {
  const url = urlImage(c);
  const caps = nomsCapacites(c);
  const etiquette = `${c.n}, coût ${c.c}${actionsDe(c) > 1 ? ` et ${actionsDe(c)} actions` : ''}${c.t === 'u' ? `, ${c.a} attaque, ${c.d ?? 0} défense, ${c.h} PV` : ''}${caps.length ? `, ${caps.join(', ')}` : ''}. ${c.t === 's' ? c.d : ''}`;
  return `
    <button type="button" class="dc-carte dc-carte--${c.t}${url ? ' dc-carte--image' : ''} rar-${rarete(c)}${jouable ? ' est-jouable' : ''}${choisie ? ' est-choisie' : ''}"
      ${index != null ? `data-index="${index}"` : ''} aria-label="${esc(etiquette)}" ${url ? `style="--masque:url('${url}')"` : ''}>
      <span class="dc-carte__corps">
        ${faceCarte(c)}
        <span class="dc-cout${cout < c.c ? ' dc-cout--reduit' : ''}">${cout}</span>
        ${actionsDe(c) > 1 ? `<span class="dc-act" title="${actionsDe(c)} actions pour la jouer">${actionsDe(c)}</span>` : ''}
        ${htmlCapacites(c)}
        ${c.t === 'u' ? htmlStats(c.a, c.d ?? 0, c.h) : ''}
        <span class="dc-reflet${url ? '' : ' dc-reflet--codex'}"></span>
      </span>
    </button>`;
}

// Unité sur le terrain : la même face, avec ses statistiques du moment et ses états
function htmlUnite(p, u, camp, sel) {
  const monTour = sel.monTour && camp === 'joueur';
  const pret = monTour && p.camps.joueur.actions > 0 && (peutAttaquer(u) || peutDefendre(u) || peutActiver(p, 'joueur', u.uid));
  const cible = sel.cibles?.some((c) => c.camp === camp && c.uid === u.uid);
  const atk = attaqueDe(p, camp, u);
  const def = defenseDe(u, p);
  const etats = [
    u.defend ? ['En garde', 'defense'] : null,
    u.bloquee || u.gele ? ['Gelée', 'gelee'] : null,
    u.expose ? ['Exposée', 'exposee'] : null,
    u.bouclier ? ['Bouclier', 'bouclier'] : null,
  ].filter(Boolean);
  const classes = [
    'dc-unite', `rar-${rarete(u.def)}`,
    capsDe(u).includes('garde') || capsDe(u).includes('provocation') ? 'a-garde' : '', pret ? 'est-prete' : '',
    !u.prete || u.aAttaque || u.bloquee ? 'est-epuisee' : '',
    u.defend ? 'a-defense' : '', u.bouclier ? 'a-bouclier' : '', u.bloquee || u.gele ? 'est-gelee' : '',
    sel.attaquant === u.uid ? 'est-choisie' : '', cible ? 'est-ciblable' : '',
    sel.cibles && !cible && camp === 'adverse' ? 'est-hors-cible' : '',
    u.h < u.hMax ? 'est-blessee' : '',
  ].filter(Boolean).join(' ');
  const caps = nomsCapacites(u);
  return `
    <button type="button" class="${classes}" data-uid="${u.uid}" data-camp="${camp}"
      aria-label="${esc(`${u.n}, ${atk} attaque, ${def} défense, ${u.h} PV${caps.length ? `, ${caps.join(', ')}` : ''}${etats.length ? `, ${etats.map((e) => e[0]).join(', ')}` : ''}`)}">
      <span class="dc-unite__corps">
        ${faceCarte(u.def)}
        ${htmlCapacites(u)}
        ${etats.length ? `<span class="dc-etats">${etats.map(([t, k]) => `<span class="dc-etat dc-etat--${k}">${t}</span>`).join('')}</span>` : ''}
        ${htmlStats(atk, def, u.h, { aMod: atk !== u.a, dMod: def - u.d })}
      </span>
    </button>`;
}

// Les actions du tour : des pastilles (pleines = restantes)
function htmlActions(camp) {
  const max = Math.max(camp.actionsMax || 2, camp.actions);
  return `<span class="actions__titre">Actions</span>`
    + Array.from({ length: max }, (_, i) => `<i class="action-pip${i < camp.actions ? ' action-pip--pleine' : ''}"></i>`).join('')
    + `<span class="actions__texte">${camp.actions} / ${camp.actionsMax || 2}</span>`;
}

const COURONNE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z"/></svg>';

function htmlHeros(camp, qui, avatar, sel) {
  const cible = sel.cibles?.some((c) => c.camp === qui && c.heros);
  const pct = Math.max(0, camp.pv) / camp.pvMax * 100;
  // Portrait dans un cadre hexagonal, PV dans une goutte de sang, nom sur un cartouche
  return `
    <button type="button" class="dc-heros${cible ? ' est-ciblable' : ''}${camp.pv <= 5 ? ' est-en-danger' : ''}" data-heros="${qui}"
      aria-label="${esc(`${camp.nom}, ${camp.pv} PV sur ${camp.pvMax}`)}" style="--pv:${pct.toFixed(0)}%">
      <span class="dc-heros__cadre"><span class="dc-heros__portrait">${avatar ? `<img src="${esc(avatar)}" alt="">` : COURONNE}</span></span>
      <span class="dc-heros__pv"><span>${Math.max(0, camp.pv)}</span></span>
      <span class="dc-heros__nom">${esc(camp.nom)}</span>
    </button>`;
}

// Pioche : une pile de dos de cartes (plus ou moins haute) et le nombre de cartes restantes
function pileDeck(n) {
  const epaisseur = n > 12 ? 3 : n > 4 ? 2 : n > 0 ? 1 : 0;
  return `
    <span class="pile-deck" title="Grimoire : ${n} carte${n > 1 ? 's' : ''} restante${n > 1 ? 's' : ''}">
      ${'<i></i>'.repeat(epaisseur)}<b>${n}</b>
    </span>`;
}

// Le Tombeau, posé sur le grand cadre du tapis : la dernière carte arrivée, face visible,
// et le nombre de cartes
function htmlTombeau(camp) {
  const n = camp.tombeau?.length ?? 0;
  const dessus = n ? camp.tombeau[n - 1] : null;
  return `
    ${dessus ? `<span class="tombeau__carte">${htmlCarte(dessus).replace('<button', '<span').replace(/<\/button>\s*$/, '</span>')}</span>` : ''}
    <span class="tombeau__compte" title="Tombeau"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M4 27V10a8 8 0 0 1 16 0v17z"/><path d="M12 8v8M8.5 11h7"/></svg><b>${n}</b></span>`;
}

// Le Grimoire, posé sur la pile peinte du tapis : son nombre de cartes
function pileTapis(n) {
  return `<b title="Grimoire : ${n} carte${n > 1 ? 's' : ''} restante${n > 1 ? 's' : ''}">${n}</b>`;
}

function htmlEnergie(camp) {
  return Array.from({ length: ENERGIE_MAX }, (_, i) => {
    const etat = i < camp.energie ? 'plein' : i < camp.energieMax ? 'vide' : 'eteint';
    return `<i class="cristal cristal--${etat}"></i>`;
  }).join('') + `<span class="energie__texte">${camp.energie} / ${camp.energieMax}</span>`;
}


// Cartes qui viennent d'arriver dans une main (pioche) : elles glissent depuis le Grimoire.
// On compare avec la main du rendu précédent : les cartes ajoutées à la fin sont les nouvelles.
let mainAvant = null;
let nAdverseAvant = null;
function animerPioche(main, nAdverse) {
  const cles = main.map((c) => c.id ?? c.n);
  if (!reduit && mainAvant && cles.length > mainAvant.length && mainAvant.every((k, i) => cles[i] === k)) {
    const cartes = [...$('main-joueur').children];
    cartes.slice(mainAvant.length).forEach((el, i) => {
      el.classList.add('fx-piochee');
      el.style.setProperty('--d', `${i * 110}ms`);
      setTimeout(() => el.classList.remove('fx-piochee'), 700 + i * 110);
    });
  }
  if (!reduit && nAdverseAvant != null && nAdverse > nAdverseAvant) {
    [...$('main-adverse').children].slice(nAdverseAvant).forEach((el, i) => {
      el.classList.add('fx-piochee');
      el.style.setProperty('--d', `${i * 110}ms`);
    });
  }
  mainAvant = cles;
  nAdverseAvant = nAdverse;
}

// ---------------------------------------------------------------------
//  Rendu complet du plateau
//  sel : { monTour, attaquant, sortIndex, cibles } (sélection en cours du joueur)
// ---------------------------------------------------------------------
export function rendre(p, sel, avatars = {}) {
  const j = p.camps.joueur;
  const a = p.camps.adverse;

  $('heros-adverse').innerHTML = htmlHeros(a, 'adverse', avatars.adverse, sel);
  $('heros-joueur').innerHTML = htmlHeros(j, 'joueur', avatars.joueur, sel);
  $('infos-adverse').innerHTML = `
    <span class="energie energie--adverse" title="Énergie de l'adversaire">${htmlEnergie(a)}</span>
    <span class="actions actions--adverse" title="Actions de l'adversaire ce tour">${htmlActions(a)}</span>`;
  $('energie').innerHTML = htmlEnergie(j);
  $('actions').innerHTML = htmlActions(j);
  $('actions').title = `Actions : ${j.actions} sur ${j.actionsMax || 2} ce tour (2 par tour, 3 à partir du tour 5)`;
  $('orbe-valeur').textContent = j.energie;
  $('pioche-joueur').innerHTML = pileTapis(j.deck.length);
  $('pioche-adverse').innerHTML = pileTapis(a.deck.length);
  for (const [qui, camp] of [['joueur', j], ['adverse', a]]) {
    const el = $(`tombeau-${qui}`);
    el.innerHTML = htmlTombeau(camp);
    el.title = `Tombeau : ${camp.tombeau?.length ?? 0} carte${(camp.tombeau?.length ?? 0) > 1 ? 's' : ''} (toucher pour voir)`;
  }

  for (const [qui, camp] of [['adverse', a], ['joueur', j]]) {
    $(`terrain-${qui}`).innerHTML = camp.terrain.map((u) => (u
      ? htmlUnite(p, u, qui, sel)
      : '<span class="dc-place" aria-hidden="true"></span>')).join('');
  }

  $('main-joueur').innerHTML = j.main.map((c, i) => {
    const html = htmlCarte(c, {
      cout: coutDe(j, c),
      index: i, jouable: sel.monTour && !sel.defausse && peutJouer(p, 'joueur', i), choisie: sel.sortIndex === i,
    });
    if (!sel.monTour) return html;
    // Énergie ou actions insuffisantes : la carte est assombrie
    const manque = coutDe(j, c) > j.energie || actionsDe(c) > j.actions;
    return manque ? html.replace('class="dc-carte ', 'class="dc-carte est-trop-chere ') : html;
  }).join('');
  const glissable = sel.monTour && peutDefausser(p, 'joueur');
  for (const c of $('main-joueur').children) c.draggable = glissable;
  $('main-joueur').classList.toggle('en-defausse', !!sel.defausse);
  $('main-adverse').innerHTML = a.main.map(() => '<i class="dos"></i>').join('');
  animerPioche(j.main, a.main.length);
  // Les deux mains s'ouvrent en éventail : --k = place de la carte par rapport au centre
  for (const id of ['main-joueur', 'main-adverse']) {
    const cartes = $(id).children;
    [...cartes].forEach((c, i) => c.style.setProperty('--k', (i - (cartes.length - 1) / 2).toFixed(1)));
  }

  $('btn-fin').disabled = !sel.monTour;
  // Plus d'action : le bouton de fin de tour s'illumine
  $('btn-fin').classList.toggle('est-suggere', !!sel.monTour && j.actions <= 0);
  $('btn-destin').disabled = !sel.monTour || !peutDestin(p, 'joueur');
  $('btn-destin').title = j.destinUtilise ? 'Déjà lancé ce tour-ci' : `Coûte ${COUT_DESTIN} énergie (sans action), une fois par tour`;
  // Le terrain
  const terrain = terrainDe(p);
  $('terrain-duel').innerHTML = terrain ? `<span class="terrain-duel__nom">${esc(terrain.nom)}</span><span class="terrain-duel__texte">${esc(terrain.texte)}</span>` : '';
  // L'unité choisie : se mettre en garde, ou activer sa capacité
  const choisie = sel.attaquant ? trouver(j, sel.attaquant) : null;
  const act = capaciteActive(choisie);
  $('btn-defendre').disabled = !sel.monTour || !choisie || j.actions < 1 || !peutDefendre(choisie);
  $('btn-defendre').title = choisie
    ? `${choisie.n} se met en garde : +2 Défense et Riposte jusqu'à ton prochain tour (1 action, elle n'attaque pas)`
    : 'Choisis d’abord une de tes unités';
  $('btn-capacite').hidden = !act;
  if (act) {
    $('btn-capacite').disabled = !sel.monTour || !peutActiver(p, 'joueur', choisie.uid);
    $('btn-capacite').innerHTML = `${esc(act.nom)} <small>1 action${act.cout ? ` · ${act.cout} énergie` : ''}</small>`;
    $('btn-capacite').title = act.texte;
    $('btn-capacite').classList.toggle('est-actif', !!sel.capacite);
  }
  $('btn-defausser').disabled = !sel.monTour || !peutDefausser(p, 'joueur');
  $('btn-defausser').classList.toggle('est-actif', !!sel.defausse);
  $('btn-defausser').title = j.defausseUtilisee ? 'Déjà défaussé ce tour-ci'
    : `Défausser une carte de ta main et en piocher une (${COUT_DEFAUSSE} énergie, une fois par tour). Tu peux aussi la glisser sur ton Tombeau.`;
  $('btn-mediter').disabled = !sel.monTour || !peutMediter(p, 'joueur');
  $('btn-mediter').title = j.mediterUtilise ? 'Déjà médité ce tour-ci'
    : `Regarder les 3 premières cartes de ton Grimoire (${COUT_MEDITER} énergie, une fois par tour)`;

  $('historique').innerHTML = p.jets.map((x) => `
    <li class="jet jet--${x.q}${x.qui === 'joueur' ? ' jet--moi' : ''}">
      <b>${x.de}</b><span>${esc(x.quoi)}<small>${esc(x.label)}${x.detail ? ` · ${esc(x.detail)}` : ''}</small></span>
    </li>`).join('') || '<li class="jet jet--vide">Aucun jet pour l\'instant.</li>';

  $('scene-table').classList.toggle('mon-tour', !!sel.monTour);
  $('scene-table').classList.toggle('vise', !!sel.cibles);
}


// ---------------------------------------------------------------------
//  Animations
// ---------------------------------------------------------------------
const elUnite = (uid) => document.querySelector(`.dc-unite[data-uid="${uid}"]`);
const elHeros = (qui) => document.querySelector(`.dc-heros[data-heros="${qui}"]`);
export const elCible = (c) => (c.heros ? elHeros(c.camp) : elUnite(c.uid));

// Chiffre flottant (dégâts en rouge, soin en vert, bonus en ambre)
// Effets de pioche d'un événement (sorts, Destin, défausse) : cartes piochées, brûlées, épuisement.
// Le début de tour a ses propres bannières (JS/jeu-cartes.js, afficherTour).
async function effetsPioche(ev) {
  const r = ev.pioche;
  if (!r) return;
  const pile = $(`pioche-${ev.qui}`);
  const tombe = $(`tombeau-${ev.qui}`);
  if (r.piochees?.length) {
    flotter(pile, `+${r.piochees.length} carte${r.piochees.length > 1 ? 's' : ''}`, 'buff');
    jouerSon('pioche');
  }
  if (r.brulees?.length) {
    await pause(250);
    flotter(tombe, `Brûlée : ${r.brulees[0].n ?? 'une carte'}`, 'rate');
    particules(tombe, { n: 22, couleurs: BRAISES, vitesse: 90, monte: 70, gravite: -40, depuis: 'surface' });
    jouerSon('feu');
  }
  if (r.epuisement) {
    await pause(250);
    const heros = elHeros(ev.qui);
    secouer(heros);
    flotter(heros, `Épuisement -${r.epuisement}`);
    particules(heros, { n: 16, couleurs: ['#a66cd9', '#6e3a9a', '#d2b4f0'], vitesse: 70, monte: 30, rond: true, depuis: 'surface' });
  }
  await pause(300);
}

export function flotter(el, texte, type = 'degats') {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('span');
  f.className = `flotte flotte--${type}`;
  f.textContent = texte;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height * 0.35}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), reduit ? 600 : 1300);
}

// Un effet sur une cible (moteur : ev.touches) : dégâts, soin, bonus, état (Gelée, Bouclier…)
function montrerTouche(t, el = elCible(t)) {
  if (!el) return;
  if (t.texte) flotter(el, t.texte, t.etat ? 'rate' : 'buff');
  else if (t.soin) flotter(el, `+${t.valeur}`, 'soin');
  else if (t.buff) flotter(el, `+${t.valeur}/+${t.valeur}`, 'buff');
  else { secouer(el); flotter(el, `-${t.valeur}`); }
}
export async function montrerTouches(touches = []) {
  for (const t of touches) {
    const el = elCible(t);
    if (t.soin) EFFET_SORT.heal(el);
    else if (t.etat) onde(el, '#bfe3f0', 2, 600);
    else if (t.buff) EFFET_SORT.buff(el);
    else if (el) particules(el, { n: 14, couleurs: BRAISES, vitesse: 90, gravite: 40, rond: true });
    montrerTouche(t, el);
  }
  if (touches.length) await pause(450);
}

function classeTemporaire(el, classe, ms) {
  if (!el) return;
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), ms);
}
export const secouer = (el) => classeTemporaire(el, 'fx-secousse', 450);

// Bannière au centre (changement de tour, Destin…)
export async function banniere(texte, sous = '', type = '') {
  const b = $('banniere');
  b.innerHTML = `<strong>${esc(texte)}</strong>${sous ? `<span>${esc(sous)}</span>` : ''}`;
  b.className = `banniere est-visible ${type}`;
  await pause(1100);
  b.className = 'banniere';
}

// d20 : il roule, puis s'arrête sur le résultat
// Le dé n'apparaît que pendant un lancer (attaque ou Jet du Destin), puis s'efface
let minuteurDe = null;
export async function lancerDe(de, label, q, destin = false) {
  const zone = $('d20');
  const face = $('d20-face');
  const res = $('d20-resultat');
  clearTimeout(minuteurDe);
  zone.className = `d20 roule est-visible${destin ? ' d20--destin' : ''}`;
  res.textContent = '';
  res.className = 'centre__resultat';
  jouerSon('de');
  if (!reduit && !document.hidden) {
    for (let i = 0; i < 9; i++) {
      face.textContent = 1 + Math.floor(Math.random() * 20);
      await pause(55 + i * 8);
    }
  }
  face.textContent = de;
  zone.className = `d20 est-visible d20--${q}${destin ? ' d20--destin' : ''}`;
  res.textContent = label;
  res.className = `centre__resultat est-visible centre__resultat--${q}`;
  if (de === 20) jouerSon('fanfare');
  if (de === 1) jouerSon('echec');
  await pause(500);
  // Le résultat reste lisible un moment, puis le dé et son étiquette s'effacent
  minuteurDe = setTimeout(() => {
    zone.classList.remove('est-visible');
    res.classList.remove('est-visible');
  }, reduit ? 2500 : 2200);
}

// Effets visuels à l'arrivée d'une unité (UFX) et des sorts (SFX), indexés par nom de carte.
// Les cartes sans entrée prennent l'effet par défaut de leur type.
const BRAISES = ['#ffd27a', '#ff9a3d', '#e8553a', '#ffb347'];
const OR = ['#f6d995', '#f0c873', '#ffffff', '#d9a441'];
const SEVE = ['#9fd9b0', '#d5f5de', '#7fb08f'];
const ONDE_MAREE = ['#bfe3f0', '#7fbcd6', '#ffffff'];
const POUSSIERE = ['#9aa1ad', '#6b717c', '#c5cad3'];

export const UFX = {
  'Milicien de la Couronne': (el) => { onde(el, '#f0c873', 2.4); particules(el, { n: 16, couleurs: OR, vitesse: 110, monte: 40, gravite: -20 }); jouerSon('acier', 0.1); },
};
// Effet d'un sort sur une cible touchée (el), selon son effet (fx)
const EFFET_SORT = {
  unit: (el) => { flash(el, 'rgba(255,170,90,.95)'); particules(el, { n: 22, couleurs: BRAISES, vitesse: 70, monte: 90, gravite: -40, rond: true, depuis: 'surface', duree: 900 }); },
  face: (el) => { eclair(el); secousseEcran(9); voile('rgba(140,160,255,.35)', 500); },
  heal: (el) => { particules(el, { n: 16, couleurs: SEVE, vitesse: 25, monte: 70, gravite: -35, rond: true, depuis: 'surface', duree: 1100 }); onde(el, '#9fd9b0', 1.8); },
  buff: (el) => { particules(el, { n: 18, couleurs: OR, vitesse: 30, monte: 80, gravite: -40, depuis: 'surface', duree: 1000 }); onde(el, '#f0c873', 1.8); },
  aoe: (el) => { onde(el, '#7fbcd6', 2.2, 700); particules(el, { n: 14, couleurs: ONDE_MAREE, vitesse: 110, gravite: 40, rond: true }); },
  // Objets
  ready: (el) => { onde(el, '#9fd9b0', 2, 600); particules(el, { n: 16, couleurs: ['#d5f5de', '#9fd9b0', '#ffffff'], vitesse: 90, monte: 40, gravite: 10 }); },
  rage: (el) => { flash(el, 'rgba(255,90,80,.85)', 2, 400); particules(el, { n: 22, couleurs: ['#ff6b5b', '#ffb347', '#c33a42'], vitesse: 120, monte: 60, gravite: -10, depuis: 'surface' }); },
  talisman: () => { const d = $('d20'); onde(d, '#c9b2fb', 2.6, 800); particules(d, { n: 22, couleurs: ['#c9b2fb', '#ffffff', '#9a6cf0'], vitesse: 100, monte: 30, gravite: 0 }); },
  coffre: (el) => { flash(el, 'rgba(255,224,150,.9)', 2, 400); particules(el, { n: 20, couleurs: OR, vitesse: 140, monte: 80, gravite: 60 }); },
  jeton: (el) => { onde(el, '#f0c873', 2, 600); particules(el, { n: 12, couleurs: OR, vitesse: 70, monte: 60, gravite: -20, rond: true }); },
};
export const SFX = {
  'Raz-de-Marée': () => secousseEcran(7, 600),
};

// Coup porté à une cible : étincelles, et plus fort sur un critique
function impact(el, q, heros) {
  if (!el) return;
  if (q === 'critique') {
    flash(el, 'rgba(255,224,150,.95)', 3);
    onde(el, '#f0c873', 3, 700);
    particules(el, { n: 30, couleurs: OR, vitesse: 230, gravite: 90, taille: [3, 9], duree: 900 });
    secousseEcran(12, 500);
  } else {
    flash(el, 'rgba(255,255,255,.85)', 1.6, 300);
    particules(el, { n: q === 'solide' ? 16 : 10, couleurs: ['#ffffff', '#f6d995', '#c5cad3'], vitesse: 140, gravite: 70, taille: [2, 6], duree: 600 });
  }
  if (heros) { voile('rgba(183,40,48,.5)'); secousseEcran(q === 'critique' ? 14 : 7); }
}

// Joue l'animation d'un événement du moteur (avant le nouveau rendu)
export async function animer(ev) {
  switch (ev.type) {
    case 'pose': {
      // la carte quitte la main et vole jusqu'à sa place sur le terrain
      const place = $(`terrain-${ev.qui}`)?.children[ev.place];
      await volerDepuisMain(ev, place);
      jouerSon('pose');
      return;
    }
    case 'apres-pose': {
      const el = elUnite(ev.uid);
      classeTemporaire(el, 'fx-arrivee', 700);
      // la carte s'écrase sur le plateau : nuage de poussière, couleur de sa Veine ; une Charge part déjà en étincelles
      setTimeout(() => {
        particules(el, { n: 14, couleurs: POUSSIERE, vitesse: 80, gravite: 15, taille: [5, 12], rond: true, duree: 800 });
        onde(el, 'rgba(197,202,211,.7)', 1.6, 500);
        secousseEcran(4, 300);
        const teinte = couleursVeine(ev.carte?.veine);
        if (teinte) {
          onde(el, teinte[0], 2.2, 700);
          particules(el, { n: 16, couleurs: teinte, vitesse: 40, monte: 70, gravite: -40, rond: true, depuis: 'surface', duree: 1100 });
        }
        if (ev.carte?.carte?.rarity === 'legendaire' || ev.carte?.carte?.rarity === 'transcendante') {
          flash(el, 'rgba(255,230,170,.9)', 3, 500);
          symbole(el, '♛', { couleur: '#f6d995', taille: 48, duree: 900 });
          jouerSon('couronne');
        }
        (UFX[ev.carte.n] ?? ((e) => {
          const caps = capsDe(ev.carte);
          if (caps.includes('charge')) { particules(e, { n: 16, couleurs: OR, vitesse: 150, gravite: 50 }); jouerSon('acier', 0.05); }
          if (caps.includes('garde') || caps.includes('provocation')) onde(e, '#e6eaf1', 1.9, 650);
        }))(el);
      }, reduit ? 0 : 260);
      await pause(380);
      return;
    }
    case 'sort': {
      const apercu = $('apercu');
      apercu.innerHTML = htmlCarte(ev.carte);
      // la carte vole de la main jusqu'au centre, puis s'y montre en grand
      await volerDepuisMain(ev, apercu.firstElementChild);
      apercu.className = `apercu est-visible ${ev.qui === 'adverse' ? 'apercu--adverse' : ''}`;
      await pause(700);
      apercu.className = 'apercu';
      jouerSon(SM[ev.carte.fx] ?? 'cloche');
      SFX[ev.carte.n]?.();
      for (const t of ev.touches ?? []) {
        const el = elCible(t);
        EFFET_SORT[ev.carte.fx]?.(el);
        montrerTouche(t, el);
      }
      if (ev.carte.fx === 'draw') particules($('main-joueur'), { n: 12, couleurs: ['#c5d2ef', '#ffffff'], vitesse: 60, monte: 50, gravite: -20, depuis: 'surface' });
      await pause(250);
      await mourir(ev.morts);
      await effetsPioche(ev);
      await pause(350);
      return;
    }
    case 'attaque': {
      const att = elUnite(ev.uid);
      const cib = elCible(ev.cible);
      // Interception : une unité adverse s'interpose devant son héros
      if (ev.interception && cib) {
        flotter(cib, 'Interception !', 'buff');
        onde(cib, '#e6eaf1', 2, 600);
        jouerSon('acier', 0.05);
        await pause(450);
      }
      // Chorégraphie de l'attaque (par son nom, sinon sa Veine : JS/jeu-cartes-attaques.js)
      const style = styleAttaque(ev.attaque);
      // 1. le nom de l'attaque s'affiche, l'attaquant se charge, le dé roule ; la cible est marquée
      const retirerAnnonce = annonce(att, ev.attaque?.nom ?? ev.n ?? 'Attaque', style.icone, style.couleur);
      att?.classList.add('fx-prepare');
      cib?.classList.add('fx-visee');
      style.charge?.(att);
      if (ev.esquive && cib) flotter(cib, `Esquive : ${ev.des.join(' et ')}, le plus bas compte`, 'buff');
      const calcul = ev.total != null ? `${ev.esquive ? ` · Esquive (${ev.des.join(' / ')})` : ''} · ${ev.de}${ev.atk ? ` + ${ev.atk}` : ''}${ev.bonus ? ` + ${ev.bonus}` : ''} = ${ev.total} / ${ev.seuil}` : '';
      await lancerDe(ev.de, `${ev.info.label}${calcul}`, ev.info.q);
      att?.classList.remove('fx-prepare');
      cib?.classList.remove('fx-visee');
      // 2. l'attaque part (projectile, rayon, élan…) et touche
      let retour = null;
      if (ev.degats > 0) {
        retour = await style.coup(att, cib, ev);
      } else if (att && cib && !reduit) {
        // Raté : l'attaquant s'élance mais le coup passe à côté
        att.style.setProperty('--dx', `${(cib.getBoundingClientRect().left - att.getBoundingClientRect().left) * 0.35}px`);
        att.style.setProperty('--dy', `${(cib.getBoundingClientRect().top - att.getBoundingClientRect().top) * 0.35}px`);
        att.classList.add('fx-elan');
        await pause(230);
        retour = () => att.classList.remove('fx-elan');
      }
      // 3. le coup : la cible recule, chiffres de dégâts
      if (ev.info.q === 'echec') jouerSon('echec');
      else if (ev.info.q === 'critique') jouerSon('tonnerre');
      if (ev.degats > 0) {
        if (att && cib) {
          const ra = att.getBoundingClientRect(); const rc = cib.getBoundingClientRect();
          recul(cib, rc.left - ra.left, rc.top - ra.top, ev.info.q === 'critique' ? 26 : 14);
        }
        impact(cib, ev.info.q, !!ev.cible.heros);
      }
      if (ev.info.q === 'critique' && ev.degats > 0) flotter(cib, 'Critique !', 'critique');
      if (ev.bouclier) {
        flotter(cib, 'Bouclier !', 'buff');
        onde(cib, '#bfe3f0', 2.2, 600);
        jouerSon('acier', 0.05);
      } else flotter(cib, ev.degats > 0 ? `-${ev.degats}` : 'Raté', ev.degats > 0 ? 'degats' : 'rate');
      retirerAnnonce();
      if (ev.drain > 0) {
        const heros = elHeros(ev.qui);
        setTimeout(() => { flotter(heros, `+${ev.drain}`, 'soin'); EFFET_SORT.heal(heros); }, reduit ? 0 : 250);
      }
      if (ev.riposte > 0 || ev.bouclierAttaquant) {
        setTimeout(() => {
          if (ev.bouclierAttaquant) { flotter(att, 'Bouclier !', 'buff'); return; }
          secouer(att);
          flotter(att, `Riposte -${ev.riposte}`);
          particules(att, { n: 8, couleurs: ['#ffffff', '#c5cad3'], vitesse: 110, gravite: 60, taille: [2, 5], duree: 500 });
        }, reduit ? 0 : 200);
      }
      if (ev.expose) {
        flotter(att, 'Exposée : -2 Défense', 'rate');
        particules(att, { n: 18, couleurs: ['#9aa1ad', '#c5cad3', '#5d6574'], vitesse: 150, gravite: 120, taille: [3, 7], duree: 800 });
      }
      await pause(350);
      retour?.();
      await mourir(ev.morts);
      await effetsPioche(ev);
      await pause(250);
      return;
    }
    case 'destin': {
      await lancerDe(ev.de, `Destin : ${ev.info.label}`, ev.info.q, true);
      const sons = { malediction: 'tonnerre', soin: 'soin', pioche: 'pioche', renfort: 'acier', benediction: 'cloche', grace: 'cloche' };
      jouerSon(sons[ev.info.q]);
      if (ev.info.q === 'malediction') { voile('rgba(110,40,150,.55)', 800); secousseEcran(8); }
      if (ev.info.q === 'grace') { onde($('d20'), '#f0c873', 4, 900); particules($('d20'), { n: 30, couleurs: OR, vitesse: 220, gravite: 60 }); }
      await banniere(ev.info.label, ev.info.texte + (ev.complet ? ' (mais il n\'y a plus de place)' : ''), `banniere--${ev.info.q}`);
      for (const t of ev.touches) {
        const el = elCible(t);
        if (t.soin) { EFFET_SORT.heal(el); flotter(el, `+${t.valeur}`, 'soin'); }
        else if (t.buff) { EFFET_SORT.buff(el); flotter(el, `+${t.valeur}/+${t.valeur}`, 'buff'); }
        else {
          particules(el, { n: 18, couleurs: ['#a66cd9', '#6e3a9a', '#d2b4f0'], vitesse: 80, monte: 30, rond: true, depuis: 'surface', duree: 900 });
          secouer(el);
          flotter(el, `-${t.valeur}`);
        }
      }
      await mourir(ev.morts);
      await effetsPioche(ev);
      await pause(300);
      return;
    }
    case 'defense': {
      // L'unité se met en garde
      const el = elUnite(ev.uid);
      onde(el, '#e6eaf1', 2, 650);
      particules(el, { n: 12, couleurs: ['#e6eaf1', '#c5cad3', '#ffffff'], vitesse: 60, monte: 30, gravite: 0, depuis: 'surface' });
      flotter(el, 'En garde : +2 Défense', 'buff');
      jouerSon('acier', 0.05);
      await pause(450);
      return;
    }
    case 'capacite': {
      // Capacité d'une grande carte : son nom s'affiche, puis ses effets
      const el = elUnite(ev.uid);
      const teinte = couleursVeine(ev.veine) ?? OR;
      const retirer = annonce(el, ev.nom, '✦', teinte[0]);
      flash(el, 'rgba(255,230,170,.9)', 2.4, 450);
      onde(el, teinte[0], 2.6, 750);
      particules(el, { n: 22, couleurs: teinte, vitesse: 120, monte: 60, gravite: 0 });
      jouerSon('couronne');
      await pause(650);
      retirer();
      await montrerTouches(ev.touches);
      await mourir(ev.morts);
      await effetsPioche(ev);
      await pause(250);
      return;
    }
    case 'effet': {
      // Capacité unique à l'arrivée d'une grande carte (après sa pose)
      await banniere(ev.effet.nom, ev.effet.texte, 'banniere--grace');
      if (ev.destin) await lancerDe(ev.destin.de, `Destin : ${ev.destin.info.label}`, ev.destin.info.q, true);
      await montrerTouches(ev.touches);
      if (ev.renfort) await animer({ type: 'apres-pose', uid: ev.renfort, carte: { n: 'Milicien de la Couronne' } });
      await mourir(ev.morts);
      await effetsPioche(ev);
      return;
    }
    case 'defausse': {
      // La carte glisse vers le Tombeau puis s'y efface
      const tombe = $(`tombeau-${ev.qui}`);
      flotter(tombe, `Défaussée : ${ev.carte.n}`, 'rate');
      particules(tombe, { n: 16, couleurs: ['#9aa1ad', '#c5cad3', '#5d6574'], vitesse: 70, monte: 40, gravite: 30, depuis: 'surface' });
      jouerSon('pioche');
      await pause(350);
      await effetsPioche(ev);
      return;
    }
    case 'mediter': {
      const pile = $(`pioche-${ev.qui}`);
      flotter(pile, 'Méditation…', 'buff');
      onde(pile, '#c9b2fb', 1.8, 700);
      jouerSon('cloche');
      await pause(400);
      return;
    }
    case 'placer': {
      if (ev.sous) flotter($(`pioche-${ev.qui}`), 'Une carte sous le Grimoire', 'buff');
      await pause(250);
      return;
    }
    default: return;
  }
}

// Une carte jouée quitte la main (la tienne : la vraie carte ; l'adverse : un dos qui se retourne)
// et vole jusqu'à dest. La carte d'origine est cachée pendant le vol (le plateau est redessiné après).
async function volerDepuisMain(ev, dest) {
  if (!dest || reduit) return;
  // 2 contre 2 : une carte de mon allié part de son encart, à côté de mon héros (JS/jeu-cartes.js)
  const allie = !!ev.coequipier;
  const source = allie ? $('equipe-allie')
    : ev.qui === 'joueur'
      ? $('main-joueur')?.querySelector(`[data-index="${ev.index}"]`)
      : $('main-adverse')?.lastElementChild;
  if (!source || (allie && source.hidden)) return;
  if (!allie) source.style.visibility = 'hidden';
  jouerSon('elan');
  await envol(source, dest, {
    html: ev.qui === 'adverse' || allie ? htmlCarte(ev.carte) : null,
    rotation: ev.qui === 'joueur' ? -10 : 10,
    duree: 440,
  });
}

// Les unités tombées éclatent en morceaux
async function mourir(uids = []) {
  if (!uids?.length) return;
  uids.forEach((uid, i) => setTimeout(() => briser(elUnite(uid)), reduit ? 0 : i * 90));
  jouerSon('choc', 0.02);
  jouerSon('acier', 0.08);
  await pause(650);
}

// Valeur d'un jet pour l'aide (« 15 à 19 : coup solide »)
export const libelleJet = (q) => rollInfo(q)?.label ?? '';


// ---------------------------------------------------------------------
//  Infobulles : au survol d'un élément [data-infobulle] (capacités), une bulle au-dessus de la page
// ---------------------------------------------------------------------
const bulle = Object.assign(document.createElement('div'), { className: 'infobulle', hidden: true });
bulle.setAttribute('role', 'tooltip');
document.body.appendChild(bulle);
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest?.('[data-infobulle]');
  if (!el) { bulle.hidden = true; return; }
  bulle.textContent = el.dataset.infobulle;
  bulle.hidden = false;
  const r = el.getBoundingClientRect();
  const b = bulle.getBoundingClientRect();
  bulle.style.left = `${Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2))}px`;
  bulle.style.top = `${r.top - b.height - 8 < 8 ? r.bottom + 8 : r.top - b.height - 8}px`;
}, { passive: true });
document.addEventListener('scroll', () => { bulle.hidden = true; }, { passive: true, capture: true });

// ---------------------------------------------------------------------
//  Inclinaison 3D des cartes en main (le décor, lui, reste fixe : plus fluide)
// ---------------------------------------------------------------------
export function activerProfondeur() {
  if (reduit || !matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', (e) => {
    const carte = e.target.closest?.('.dc-carte');
    document.querySelectorAll('.dc-carte.incline').forEach((c) => { if (c !== carte) { c.classList.remove('incline'); c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } });
    if (!carte) return;
    const r = carte.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    carte.classList.add('incline');
    carte.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(1)}deg`);
    carte.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(1)}deg`);
    carte.style.setProperty('--mx', `${(x * 100).toFixed(0)}%`);
    carte.style.setProperty('--my', `${(y * 100).toFixed(0)}%`);
  }, { passive: true });
}
