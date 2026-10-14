// =====================================================================
//  Duel des Couronnes — sons, tous créés par le navigateur (Web Audio), sans fichier audio :
//  chocs, acier, tonnerre, feu, cloche, dé, fanfare, cire… et une ambiance musicale générée.
//  Trois volumes (page Paramètres, et le curseur du duel pour le général) :
//    général (tout), effets (les sons du jeu), musique (l'ambiance). Le bouton « son » coupe tout.
//  Tous les choix sont retenus dans le navigateur.
// =====================================================================
const CLE_MUET = 'duel-couronnes-muet';
const CLE_VOLUME = 'duel-couronnes-volume';
const CLE_EFFETS = 'duel-couronnes-volume-effets';
const CLE_MUSIQUE = 'duel-couronnes-volume-musique';
let ctx = null;
let general = null;   // volume général : tous les sons passent par ce gain
let busEffets = null;
let busMusique = null;
let muet = false;
let volume = 0.8;     // de 0 à 1
let volEffets = 1;
let volMusique = 0.4;
const lireNombre = (cle, defaut) => { const v = parseFloat(localStorage.getItem(cle)); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : defaut; };
try {
  muet = localStorage.getItem(CLE_MUET) === '1';
  volume = lireNombre(CLE_VOLUME, volume);
  volEffets = lireNombre(CLE_EFFETS, volEffets);
  volMusique = lireNombre(CLE_MUSIQUE, volMusique);
} catch { /* stockage indisponible */ }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    general = ctx.createGain();
    general.gain.value = muet ? 0 : volume;
    general.connect(ctx.destination);
    busEffets = ctx.createGain();
    busEffets.gain.value = volEffets;
    busEffets.connect(general);
    busMusique = ctx.createGain();
    busMusique.gain.value = volMusique;
    busMusique.connect(general);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Enveloppe : montée rapide puis décroissance exponentielle
function enveloppe(g, t, crete, attaque, duree) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(crete, t + attaque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + duree);
}

function sortie(volume = 0.6) {
  const g = ctx.createGain();
  g.gain.value = volume;
  g.connect(busEffets);
  return g;
}

let tamponBruit = null;
function bruit() {
  if (!tamponBruit) {
    tamponBruit = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = tamponBruit.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = tamponBruit;
  return s;
}

// Bruit filtré, joué entre t et t + duree
function souffle(t, duree, { type = 'lowpass', freq = 1000, q = 1, crete = 0.5, attaque = 0.005, vers } = {}) {
  const s = bruit();
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (vers) f.frequency.exponentialRampToValueAtTime(vers, t + duree);
  const g = ctx.createGain();
  enveloppe(g, t, crete, attaque, duree);
  s.connect(f).connect(g).connect(sortie());
  s.start(t, Math.random()); s.stop(t + attaque + duree + 0.05);
}

// Note simple
function note(t, freq, duree, { type = 'sine', crete = 0.3, attaque = 0.005, vers } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (vers) o.frequency.exponentialRampToValueAtTime(vers, t + duree);
  const g = ctx.createGain();
  enveloppe(g, t, crete, attaque, duree);
  o.connect(g).connect(sortie());
  o.start(t); o.stop(t + attaque + duree + 0.05);
}

// Les sons (SND) : chaque entrée reçoit l'heure de départ
export const SND = {
  choc(t)      { souffle(t, 0.18, { freq: 900, crete: 0.7 }); note(t, 110, 0.25, { vers: 45, crete: 0.6 }); },
  acier(t)     { [1870, 2610, 3920].forEach((f, i) => note(t, f, 0.35 - i * 0.07, { type: 'triangle', crete: 0.12 })); souffle(t, 0.05, { type: 'highpass', freq: 4000, crete: 0.3 }); },
  tonnerre(t)  { souffle(t, 1.6, { freq: 380, vers: 90, crete: 0.8, attaque: 0.02 }); souffle(t + 0.12, 0.9, { freq: 220, crete: 0.5 }); },
  feu(t)       { souffle(t, 0.8, { type: 'bandpass', freq: 1400, q: 0.8, crete: 0.35, attaque: 0.05 }); for (let i = 0; i < 6; i++) souffle(t + Math.random() * 0.6, 0.03, { type: 'highpass', freq: 2500, crete: 0.25 }); },
  cloche(t)    { [[660, 0.25], [1328, 0.12], [1990, 0.08], [2640, 0.05]].forEach(([f, c]) => note(t, f, 1.5, { crete: c, attaque: 0.003 })); },
  de(t)        { for (let i = 0; i < 7; i++) souffle(t + i * 0.07 + Math.random() * 0.03, 0.025, { type: 'highpass', freq: 1800 + Math.random() * 1500, crete: 0.35 }); },
  fanfare(t)   { [523, 659, 784, 1047].forEach((f, i) => note(t + i * 0.12, f, i === 3 ? 0.7 : 0.14, { type: 'triangle', crete: 0.22 })); },
  pose(t)      { note(t, 150, 0.22, { vers: 60, crete: 0.5 }); souffle(t, 0.12, { freq: 600, crete: 0.25 }); },
  soin(t)      { note(t, 520, 0.5, { vers: 880, crete: 0.15, attaque: 0.05 }); note(t + 0.05, 780, 0.5, { vers: 1320, crete: 0.08, attaque: 0.05 }); },
  echec(t)     { note(t, 300, 0.5, { type: 'sawtooth', vers: 70, crete: 0.12 }); souffle(t, 0.3, { freq: 500, crete: 0.3 }); },
  pioche(t)    { souffle(t, 0.12, { type: 'bandpass', freq: 3000, q: 2, crete: 0.2, attaque: 0.02 }); },
  clic(t)      { note(t, 880, 0.05, { type: 'square', crete: 0.05 }); },
  // Attaques (une couleur sonore par Veine, JS/jeu-cartes-attaques.js)
  elan(t)      { souffle(t, 0.28, { type: 'bandpass', freq: 600, vers: 2400, q: 1.2, crete: 0.3, attaque: 0.08 }); },
  griffe(t)    { [0, 0.06, 0.12].forEach((d) => souffle(t + d, 0.09, { type: 'bandpass', freq: 3200, vers: 1200, q: 2, crete: 0.4 })); },
  eau(t)       { souffle(t, 0.6, { type: 'lowpass', freq: 1800, vers: 300, crete: 0.45, attaque: 0.02 }); for (let i = 0; i < 5; i++) note(t + i * 0.05, 700 + Math.random() * 900, 0.08, { vers: 300, crete: 0.06 }); },
  sombre(t)    { note(t, 70, 0.9, { type: 'sawtooth', vers: 40, crete: 0.12, attaque: 0.1 }); souffle(t, 0.8, { freq: 300, vers: 80, crete: 0.35, attaque: 0.1 }); },
  magie(t)     { [880, 1175, 1568, 2093].forEach((f, i) => note(t + i * 0.05, f, 0.6, { type: 'sine', crete: 0.07 })); },
  reve(t)      { [1568, 1319, 1047, 784].forEach((f, i) => note(t + i * 0.09, f, 0.7, { type: 'sine', crete: 0.06, attaque: 0.03 })); },
  gluant(t)    { note(t, 180, 0.25, { vers: 60, crete: 0.3 }); souffle(t + 0.05, 0.3, { type: 'lowpass', freq: 500, vers: 150, crete: 0.35 }); },
  chaine(t)    { for (let i = 0; i < 5; i++) [2400, 3600].forEach((f) => note(t + i * 0.055, f + Math.random() * 300, 0.12, { type: 'triangle', crete: 0.06 })); },
  coeur(t)     { [0, 0.22].forEach((d, i) => note(t + d, i ? 55 : 65, 0.18, { vers: 35, crete: 0.6 })); },
  forge(t)     { note(t, 95, 0.3, { vers: 50, crete: 0.6 }); [1200, 2470, 3300].forEach((f) => note(t, f, 0.6, { type: 'triangle', crete: 0.08 })); souffle(t, 0.1, { freq: 2000, crete: 0.4 }); },
  // Le sceau de cire posé sur un contrat : un petit choc mat et un crépitement
  cire(t)      { note(t, 150, 0.16, { vers: 70, crete: 0.45 }); souffle(t, 0.07, { type: 'bandpass', freq: 1600, q: 1.5, crete: 0.3 }); for (let i = 0; i < 4; i++) souffle(t + 0.05 + Math.random() * 0.2, 0.02, { type: 'highpass', freq: 3500, crete: 0.12 }); },
  couronne(t)  { [523, 784, 1047].forEach((f) => note(t, f, 0.9, { type: 'triangle', crete: 0.1 })); souffle(t, 0.4, { type: 'highpass', freq: 3000, crete: 0.15, attaque: 0.05 }); },
};

// Son de chaque sort (SM : effet du sort -> son)
export const SM = {
  unit: 'feu', face: 'tonnerre', heal: 'soin', buff: 'cloche', draw: 'pioche', aoe: 'tonnerre',
  ready: 'acier', rage: 'feu', talisman: 'de', coffre: 'pioche', jeton: 'cloche',   // objets
};

export function jouerSon(nom, delai = 0) {
  if (muet || volume === 0 || volEffets === 0 || !SND[nom]) return;
  try {
    if (!audio()) return;
    SND[nom](ctx.currentTime + delai);
  } catch { /* son indisponible : le jeu continue */ }
}

export const estMuet = () => muet;
export function basculerMuet() {
  muet = !muet;
  try { localStorage.setItem(CLE_MUET, muet ? '1' : '0'); } catch { /* rien */ }
  if (general) general.gain.setTargetAtTime(muet ? 0 : volume, ctx.currentTime, 0.02);
  return muet;
}

// Volume général, de 0 à 1. Monter le volume réactive le son s'il était coupé.
export const lireVolume = () => volume;
export function reglerVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (volume > 0 && muet) basculerMuet();
  if (general) general.gain.setTargetAtTime(muet ? 0 : volume, ctx.currentTime, 0.02);
  try { localStorage.setItem(CLE_VOLUME, String(volume)); } catch { /* rien */ }
}

// Volumes des effets et de la musique (page Paramètres)
export const lireVolumes = () => ({ general: volume, effets: volEffets, musique: volMusique });
export function reglerVolumeEffets(v) {
  volEffets = Math.min(1, Math.max(0, v));
  if (busEffets) busEffets.gain.setTargetAtTime(volEffets, ctx.currentTime, 0.02);
  try { localStorage.setItem(CLE_EFFETS, String(volEffets)); } catch { /* rien */ }
}
export function reglerVolumeMusique(v) {
  volMusique = Math.min(1, Math.max(0, v));
  if (busMusique) busMusique.gain.setTargetAtTime(volMusique, ctx.currentTime, 0.05);
  try { localStorage.setItem(CLE_MUSIQUE, String(volMusique)); } catch { /* rien */ }
  if (volMusique > 0) demarrerMusique(); else arreterMusique();
}


// ---------------------------------------------------------------------
//  L'ambiance musicale, générée : une nappe grave et lente (ré mineur, si bémol, do, la mineur),
//  et de temps en temps une cloche lointaine. Elle démarre au premier geste du joueur
//  (les navigateurs l'exigent) et suit le volume « musique ».
// ---------------------------------------------------------------------
const ACCORDS = [[146.83, 220, 293.66], [116.54, 174.61, 293.66], [130.81, 196, 329.63], [110, 164.81, 261.63]];
const CLOCHES = [587.33, 698.46, 783.99, 880, 1046.5, 1174.66];   // ré mineur pentatonique, en haut
let musique = null;

export function demarrerMusique() {
  if (musique || volMusique === 0 || !audio()) return;
  const t0 = ctx.currentTime;
  const nappe = ctx.createGain();
  nappe.gain.setValueAtTime(0.0001, t0);
  nappe.gain.exponentialRampToValueAtTime(0.11, t0 + 4);   // fondu d'entrée
  const filtre = ctx.createBiquadFilter();
  filtre.type = 'lowpass'; filtre.frequency.value = 900; filtre.Q.value = 0.3;
  nappe.connect(filtre).connect(busMusique);
  // trois voix, chacune avec deux oscillateurs légèrement désaccordés
  const voix = ACCORDS[0].map((f) => {
    const oscs = [['sine', 0], ['triangle', 4]].map(([type, decalage]) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = decalage;
      const g = ctx.createGain(); g.gain.value = type === 'sine' ? 0.5 : 0.18;
      o.connect(g).connect(nappe);
      o.start(t0);
      return o;
    });
    return oscs;
  });
  let i = 0;
  const changerAccord = () => {
    i = (i + 1) % ACCORDS.length;
    const t = ctx.currentTime;
    voix.forEach((oscs, v) => oscs.forEach((o) => o.frequency.setTargetAtTime(ACCORDS[i][v], t, 1.2)));
  };
  const cloche = () => {
    const t = ctx.currentTime;
    const f = CLOCHES[Math.floor(Math.random() * CLOCHES.length)];
    [[f, 0.05], [f * 2.01, 0.015]].forEach(([fr, crete]) => {
      const o = ctx.createOscillator(); o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(crete, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      o.connect(g).connect(busMusique);
      o.start(t); o.stop(t + 3.6);
    });
  };
  musique = {
    nappe, voix,
    accords: setInterval(changerAccord, 9000),
    cloches: setInterval(() => { if (Math.random() < 0.6) cloche(); }, 4500),
  };
}

export function arreterMusique() {
  if (!musique) return;
  const { nappe, voix, accords, cloches } = musique;
  musique = null;
  clearInterval(accords); clearInterval(cloches);
  const t = ctx.currentTime;
  nappe.gain.cancelScheduledValues(t);
  nappe.gain.setTargetAtTime(0.0001, t, 0.6);
  voix.flat().forEach((o) => o.stop(t + 3));
}

// Lance la musique au premier geste du joueur sur la page (clic, touche)
export function musiqueAuPremierGeste() {
  const lancer = () => { demarrerMusique(); removeEventListener('pointerdown', lancer); removeEventListener('keydown', lancer); };
  addEventListener('pointerdown', lancer);
  addEventListener('keydown', lancer);
}
