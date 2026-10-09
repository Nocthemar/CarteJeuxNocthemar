// =====================================================================
//  Duel des Couronnes — sons, tous créés par le navigateur (Web Audio),
//  sans fichier audio : chocs, acier, tonnerre, feu, cloche, dé, fanfare.
//  Pas de musique. Le bouton « son » coupe tout (choix retenu dans le navigateur).
// =====================================================================
const CLE_MUET = 'duel-couronnes-muet';
let ctx = null;
let muet = false;
try { muet = localStorage.getItem(CLE_MUET) === '1'; } catch { /* stockage indisponible */ }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
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
  g.connect(ctx.destination);
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
};

// Son de chaque sort (SM : effet du sort -> son)
export const SM = {
  unit: 'feu', face: 'tonnerre', heal: 'soin', buff: 'cloche', draw: 'pioche', aoe: 'tonnerre',
  ready: 'acier', rage: 'feu', talisman: 'de', coffre: 'pioche', jeton: 'cloche',   // objets
};

export function jouerSon(nom, delai = 0) {
  if (muet || !SND[nom]) return;
  try {
    if (!audio()) return;
    SND[nom](ctx.currentTime + delai);
  } catch { /* son indisponible : le jeu continue */ }
}

export const estMuet = () => muet;
export function basculerMuet() {
  muet = !muet;
  try { localStorage.setItem(CLE_MUET, muet ? '1' : '0'); } catch { /* rien */ }
  return muet;
}
