// =====================================================================
//  Le niveau caché de l'Ombre (duel contre l'IA, hors mode Histoire)
//
//  L'Ombre ne pioche plus dans tout le catalogue : elle joue un Grimoire « en miroir » du tien.
//  Pour chaque carte de ton Grimoire, elle prend une carte de même rang :
//    carte de base du Codex -> une carte de base de coût voisin
//    commune / éveillée / mythique / légendaire / transcendante -> une carte du catalogue de la même rareté
//    objet de pouvoir -> un objet de pouvoir
//  Un joueur sans cartes affronte donc une Ombre sans cartes ; plus sa collection grandit, plus elle grandit.
//
//  L'élan (invisible, retenu dans le navigateur) affine l'équilibre selon tes résultats :
//  +1 par victoire, -1 par défaite, entre -3 et +3. Chaque point fait monter (ou descendre)
//  2 cartes de l'Ombre d'un rang, et lui donne 1 PV de plus (ou de moins, pvElan) :
//  tu gagnes souvent, elle se renforce ; tu perds, elle s'adoucit.
// =====================================================================
import { CARTES_BASE, OBJETS, estObjet, grimoire, melanger, peutAjouter } from './jeu-cartes-moteur.js';

const RANGS = ['base', 'commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
const ELAN_MAX = 3;
const CARTES_PAR_ELAN = 2;

// Rang d'une carte du Grimoire : 0 = carte de base, 1 à 5 = rareté d'une carte du catalogue, null = objet
function rangDe(c) {
  if (estObjet(c)) return null;
  const r = RANGS.indexOf(c.carte?.rarity);
  return r > 0 ? r : 0;
}

const auHasard = (liste) => liste[Math.floor(Math.random() * liste.length)];

// Le Grimoire de l'Ombre, en miroir de celui du joueur (20 cartes, complément compris), mélangé.
// catalogue : les unités du catalogue (uniteDepuisCarte) ; elan : de -3 à +3
export function grimoireOmbre(grimoireJoueur, catalogue, elan = 0) {
  const modele = grimoireJoueur.map((c) => ({ c, rang: rangDe(c) }));

  // L'élan : quelques cartes montent d'un rang (au hasard), ou descendent (les plus fortes d'abord ;
  // une carte de base qui descend devient une carte de base moins chère)
  const n = Math.abs(elan) * CARTES_PAR_ELAN;
  const cartesDuModele = melanger(modele.filter((m) => m.rang !== null));
  if (elan > 0) {
    for (const m of cartesDuModele.slice(0, n)) m.rang = Math.min(RANGS.length - 1, m.rang + 1);
  } else if (elan < 0) {
    for (const m of cartesDuModele.sort((x, y) => y.rang - x.rang).slice(0, n)) {
      if (m.rang > 0) m.rang -= 1;
      else m.moinsChere = true;
    }
  }

  const cartes = [];
  // Encore de la place pour cette carte (exemplaires, Transcendantes, objets) ?
  const libre = (c) => peutAjouter(cartes, c);

  // Une carte de base de coût voisin (même genre : troupe ou sort), sinon n'importe quelle carte de base ;
  // moinsChere : strictement moins chère (élan négatif), si possible
  const carteBase = (cout, genre, moinsChere = false) => {
    const pool = CARTES_BASE.filter((x) => libre(x) && x.t === genre);
    const voisines = moinsChere
      ? pool.filter((x) => x.c < cout).sort((a, b) => b.c - a.c).filter((x, _, l) => x.c === l[0].c)
      : pool.filter((x) => Math.abs(x.c - cout) <= 1);
    return auHasard(voisines.length ? voisines : pool.length ? pool : CARTES_BASE.filter(libre));
  };
  // Une carte du catalogue de ce rang ; s'il n'y en a plus, le rang le plus proche (en dessous d'abord)
  const carteDuRang = (rang, cout, genre) => {
    for (let ecart = 0; ecart < RANGS.length; ecart++) {
      for (const r of ecart ? [rang - ecart, rang + ecart] : [rang]) {
        if (r < 0 || r >= RANGS.length) continue;
        if (r === 0) { const b = carteBase(cout, genre); if (b) return b; continue; }
        const choix = catalogue.filter((u) => u.carte?.rarity === RANGS[r] && libre(u));
        if (choix.length) return auHasard(choix);
      }
    }
    return null;
  };

  for (const { c, rang, moinsChere } of modele) {
    const memeCarte = rangDe(c) === rang && !moinsChere && libre(c);   // carte inchangée par l'élan
    const carte = rang === null
      ? auHasard(OBJETS.filter(libre))
      : rang === 0 ? (memeCarte ? c : carteBase(c.c, c.t, moinsChere)) : carteDuRang(rang, c.c, c.t);
    if (carte) cartes.push(carte);
  }
  // grimoire() respecte les limites et complète avec des cartes de base s'il en manque
  return melanger(grimoire(cartes));
}

// ---------------------------------------------------------------------
//  L'élan, par joueur (navigateur)
// ---------------------------------------------------------------------
const cle = (idJoueur) => `duel-ombre-elan:${idJoueur ?? 'invite'}`;

export function lireElan(idJoueur) {
  try {
    const n = Number(localStorage.getItem(cle(idJoueur)));
    return Number.isFinite(n) ? Math.max(-ELAN_MAX, Math.min(ELAN_MAX, Math.round(n))) : 0;
  } catch { return 0; }
}

// PV en plus (ou en moins) pour l'Ombre selon l'élan
export const pvElan = (elan) => elan;

// Après un duel contre l'Ombre : +1 pour une victoire, -1 pour une défaite
export function noterResultat(idJoueur, gagne) {
  const elan = Math.max(-ELAN_MAX, Math.min(ELAN_MAX, lireElan(idJoueur) + (gagne ? 1 : -1)));
  try { localStorage.setItem(cle(idJoueur), String(elan)); } catch { /* stockage indisponible */ }
  return elan;
}
