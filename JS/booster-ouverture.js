// =====================================================================
//  Ouverture d'un booster : l'animation (le tirage, lui, est déjà fait par le serveur,
//  ouvrir_booster dans SQL/boosters.sql)
//
//  Le joueur tape sur le booster :
//   - taps 1 à 3 : la porte tremble, se fissure, le cristal s'allume de plus en plus (blanc)
//   - tap 3     : le cristal éclate dans la couleur de la MEILLEURE rareté du booster
//   - tap 4     : les battants s'ouvrent, les cartes sortent face cachée
//   - puis      : chaque carte arrive face cachée ; un tap la retourne, un tap la fait partir
//                 (la plus rare en dernier)
//  Usage : await ouvrirBoosterAnime(resultat, imageBooster, { restants, surRouvrir })
// =====================================================================
import { jouerSon } from './jeu-cartes-son.js';
import { versoDe, htmlInfos } from './cartes.js';

const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RARETES = ['commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
const NOMS_RARETE = { commune: 'Commune', eveillee: 'Éveillée', mythique: 'Mythique', legendaire: 'Légendaire', transcendante: 'Transcendante' };
export const COULEURS_RARETE = {
  commune: '#c5cad3', eveillee: '#4fd987', mythique: '#5b9bff', legendaire: '#ff4b5c', transcendante: '#f6d27a',
};
const TAPS_FISSURE = 3;
// Chaque carte sort avec son vrai dos, celui de sa rareté (comme dans la collection : JS/cartes.js)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Fissures : des lignes brisées qui partent du cristal (centre de l'image : 320, 485 sur 640 × 960)
function fissure(niveau) {
  const traits = [];
  const n = 3 + niveau;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + niveau * 0.9 + Math.random() * 0.5;
    const longueur = 70 + niveau * 70 + Math.random() * 60;
    let x = 320; let y = 485;
    const pts = [`${x},${y}`];
    const pas = 4 + niveau;
    for (let k = 1; k <= pas; k++) {
      const d = longueur / pas;
      const a = angle + (Math.random() - 0.5) * 0.9;
      x = Math.min(520, Math.max(120, x + Math.cos(a) * d));
      y = Math.min(900, Math.max(250, y + Math.sin(a) * d * 1.2));
      pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
    }
    traits.push(`<polyline points="${pts.join(' ')}" pathLength="1"/>`);
  }
  return `<g class="ob__fissure ob__fissure--${niveau}">${traits.join('')}</g>`;
}

// ---------------------------------------------------------------------
//  Le décor : une chapelle dans la pénombre. Derrière la porte (puis derrière les cartes), un grand
//  vitrail en éclats de verre sur toute la hauteur de l'écran, dont les verres prennent la couleur de la rareté (--rarete) ;
//  une brume au sol, des braises. Rien ne tourne.
// ---------------------------------------------------------------------
// Vitrail en éclats : un champ de verre découpé au hasard (toujours le même tirage) en éclats
// irréguliers par des plombs droits, une bordure de grands panneaux sur les côtés ; le haut et le bas
// sont ouverts (le vitrail continue au-delà de l'écran).
// Aucun motif : seulement des verres, dans des nuances de la couleur de la rareté (.t0 à .t5).
function vitrail() {
  const W = 600, H = 1000, B = 34;   // largeur, hauteur, bordure
  let graine = 7;
  const hasard = () => ((graine = (graine * 16807) % 2147483647) - 1) / 2147483646;
  const aire = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
  const centre = (p) => p.reduce(([a, b], [x, y]) => [a + x / p.length, b + y / p.length], [0, 0]);
  // coupe un polygone par la droite (point, angle) : renvoie les deux morceaux
  const couper = (p, [cx, cy], ang) => {
    const nx = Math.cos(ang), ny = Math.sin(ang), d = (x, y) => (x - cx) * nx + (y - cy) * ny;
    const A = [], Bm = [];
    p.forEach(([x, y], i) => {
      const [x2, y2] = p[(i + 1) % p.length], d1 = d(x, y), d2 = d(x2, y2);
      (d1 >= 0 ? A : Bm).push([x, y]);
      if ((d1 >= 0) !== (d2 >= 0)) { const t = d1 / (d1 - d2); const q = [x + (x2 - x) * t, y + (y2 - y) * t]; A.push(q); Bm.push(q); }
    });
    return [A, Bm];
  };
  const eclats = [];
  const decouper = (p, n) => {
    const s = aire(p);
    if (n > 8 || s < 7500 || (s < 22000 && hasard() < .4)) { eclats.push(p); return; }
    const [cx, cy] = centre(p);
    const [a, b] = couper(p, [cx + (hasard() - .5) * 40, cy + (hasard() - .5) * 60], hasard() * Math.PI);
    if (a.length < 3 || b.length < 3) { eclats.push(p); return; }
    decouper(a, n + 1); decouper(b, n + 1);
  };
  decouper([[B, 0], [W - B, 0], [W - B, H], [B, H]], 0);
  const pts = (p) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const TONS = [0, 0, 1, 1, 2, 2, 3, 4, 5];
  const champ = eclats.map((p) => `<polygon class="t${TONS[Math.floor(hasard() * TONS.length)]}" points="${pts(p)}"/>`).join('');
  // bordure : grands panneaux le long des côtés et des coins coupés
  let bord = '';
  const panneau = (p, k) => { bord += `<polygon class="t${k % 2 ? 2 : 1}" points="${pts(p)}"/>`; };
  let y = 0, k = 0;
  while (y < H) { const h = 110 + hasard() * 90, y2 = Math.min(H, y + h); panneau([[0, y], [B, y], [B, y2], [0, y2]], k); panneau([[W - B, y], [W, y], [W, y2], [W - B, y2]], k + 1); y = y2; k++; }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="vit-lumiere" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    </defs>
    <g class="verres">${champ}${bord}</g>
    <path d="M0 0H${W}V${H}H0Z" fill="url(#vit-lumiere)"/>
    <path d="M0 0V${H}M${W} 0V${H}" class="plomb-bord"/>
  </svg>`;
}
// Braises qui montent doucement (CSS : .ob__braise)
const htmlBraises = (n = 16) => Array.from({ length: n }, () => {
  const x = (Math.random() * 100).toFixed(1), d = (6 + Math.random() * 7).toFixed(1), r = (-Math.random() * 13).toFixed(1);
  const t = (2 + Math.random() * 3).toFixed(1), dx = ((Math.random() - .5) * 120).toFixed(0);
  return `<span class="ob__braise" style="left:${x}%;--d:${d}s;--r:${r}s;--t:${t}px;--dx:${dx}px"></span>`;
}).join('');

function htmlCarte(c, i, details) {
  const detail = details?.get(c.nom);   // la carte complète du catalogue (attaques, rang)
  return `
    <div class="ob-carte" data-i="${i}" style="--c:${COULEURS_RARETE[c.rarete] ?? '#fff'}; --i:${i}; --rang:${RARETES.indexOf(c.rarete)}">
      <div class="ob-carte__corps">
        <div class="ob-carte__dos"><img src="${versoDe(c.rarete)}" alt=""></div>
        <div class="ob-carte__face"><img src="${esc(c.image)}" alt="${esc(c.nom)}">${detail ? htmlInfos(detail) : ''}</div>
      </div>
      <div class="ob-carte__info">
        <span class="ob-carte__rarete">${esc(NOMS_RARETE[c.rarete] ?? c.rarete)}</span>
        <strong class="ob-carte__nom">${esc(c.nom)}</strong>
        <span class="ob-carte__etat ${c.nouvelle ? 'ob-carte__etat--nouvelle' : ''}">${
          c.nouvelle ? 'Nouvelle carte !' : `Doublon : +${c.or} or · +10 XP de pass`}</span>
      </div>
    </div>`;
}

// Éclats colorés autour d'un point (le cristal, une carte)
function eclats(zone, x, y, couleur, n = 26, force = 260) {
  if (reduit) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = 'ob__eclat';
    p.style.setProperty('--c', couleur);
    p.style.left = `${x}px`; p.style.top = `${y}px`;
    zone.appendChild(p);
    const a = Math.random() * Math.PI * 2;
    const v = force * (0.35 + Math.random() * 0.75);
    const anim = p.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * v}px), calc(-50% + ${Math.sin(a) * v + 60}px)) scale(.2) rotate(${Math.random() * 400}deg)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 600, easing: 'cubic-bezier(.15,.7,.35,1)' });
    anim.onfinish = () => p.remove();
  }
}

// ---------------------------------------------------------------------
//  Effets par rareté : plus la rareté est haute, plus c'est spectaculaire
//   commune       : un retournement simple, quelques étincelles
//   éveillée      : lueur verte, feuilles et étincelles qui montent
//   mythique      : la carte se gonfle d'énergie (sans tourner) avant de se retourner, double onde bleue
//   légendaire    : la carte tremble et rougeoie, flash, secousse, pluie de braises, grand titre
//   transcendante : bandes noires de cinéma, l'écran s'assombrit, la carte s'élève dans un halo d'or,
//                   le vitrail s'allume en or, se fissure puis vole en éclats,
//                   explosion de lumière, pluie d'étoiles, grand titre « TRANSCENDANTE »
// ---------------------------------------------------------------------
const attendre = (ms) => new Promise((r) => setTimeout(r, reduit ? 0 : ms));

function onde(zone, x, y, couleur, taille = 3, duree = 800, epaisseur = 4) {
  if (reduit) return;
  const o = document.createElement('span');
  o.className = 'ob__onde';
  o.style.setProperty('--c', couleur);
  o.style.setProperty('--e', `${epaisseur}px`);
  Object.assign(o.style, { left: `${x}px`, top: `${y}px` });
  zone.appendChild(o);
  o.animate([{ transform: 'translate(-50%, -50%) scale(.1)', opacity: 1 }, { transform: `translate(-50%, -50%) scale(${taille})`, opacity: 0 }],
    { duration: duree, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => o.remove();
}

function flashEcran(ov, couleur, duree = 600, force = 0.85) {
  if (reduit) return;
  const f = document.createElement('span');
  f.className = 'ob__flash';
  f.style.setProperty('--c', couleur);
  ov.appendChild(f);
  f.animate([{ opacity: 0 }, { opacity: force, offset: 0.12 }, { opacity: 0 }], { duration: duree, easing: 'ease-out' }).onfinish = () => f.remove();
}

function secouer(el, force = 10, duree = 450) {
  if (reduit || !el) return;
  const images = Array.from({ length: 8 }, (_, i) => {
    const k = force * (1 - i / 8);
    return { translate: `${((Math.random() - 0.5) * 2 * k).toFixed(1)}px ${((Math.random() - 0.5) * 2 * k).toFixed(1)}px` };
  });
  el.animate([...images, { translate: '0 0' }], { duration: duree });
}

// Particules qui tombent du haut (braises, étoiles) ou montent du bas (feuilles)
function pluie(zone, couleurs, n, { monte = false, forme = 'losange', duree = 2200 } = {}) {
  if (reduit) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = `ob__pluie ob__pluie--${forme}`;
    p.style.setProperty('--c', couleurs[i % couleurs.length]);
    Object.assign(p.style, { left: `${Math.random() * innerWidth}px`, top: monte ? `${innerHeight + 20}px` : '-20px' });
    zone.appendChild(p);
    const dy = (monte ? -1 : 1) * (innerHeight * (0.7 + Math.random() * 0.5));
    const dx = (Math.random() - 0.5) * 160;
    p.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 0 },
      { opacity: 1, offset: 0.15 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${(Math.random() - 0.5) * 720}deg) scale(.6)`, opacity: 0 },
    ], { duration: duree * (0.7 + Math.random() * 0.6), delay: Math.random() * 600, easing: 'linear', fill: 'backwards' }).onfinish = () => p.remove();
  }
}

// Grand titre au centre (légendaire, transcendante)
function titre(ov, texte, couleur, classe = '') {
  if (reduit) return;
  const t = document.createElement('div');
  t.className = `ob__titre ${classe}`;
  t.style.setProperty('--c', couleur);
  t.textContent = texte;
  ov.appendChild(t);
  t.animate([
    // (transform et opacité seulement : animer l'espacement des lettres recalculait la mise en page à chaque image)
    { transform: 'translate(-50%, -50%) scale(2.4)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.2 },
    { transform: 'translate(-50%, -50%) scale(1.04)', opacity: 1, offset: 0.75 },
    { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
  ], { duration: 1900, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => t.remove();
}

// Le cristal éclate : l'effet dépend de la MEILLEURE rareté du booster
function eclaterCristal(ov, zone, x, y, rarete) {
  const c = COULEURS_RARETE[rarete];
  const rang = RARETES.indexOf(rarete);
  eclats(zone, x, y, c, 18 + rang * 8, 300 + rang * 60);
  onde(zone, x, y, c, 4 + rang, 800 + rang * 100);
  if (rang >= 1) pluie(zone, [c, '#ffffff'], 10 + rang * 6, { monte: true, forme: rang === 1 ? 'feuille' : 'losange' });
  if (rang >= 2) { setTimeout(() => onde(zone, x, y, '#ffffff', 5 + rang, 900, 2), 140); flashEcran(ov, c, 500, 0.35); }
  if (rang >= 3) { secouer(ov.querySelector('.ob__scene'), 10 + (rang - 3) * 8, 600); flashEcran(ov, '#ffffff', 450, 0.6); }
  if (rang >= 4) { pluie(zone, ['#f6d27a', '#fff6d6', '#ffffff'], 30, { forme: 'etoile', duree: 2600 }); setTimeout(() => onde(zone, x, y, c, 12, 1300, 8), 250); }
  jouerSon(rang >= 3 ? 'tonnerre' : rang >= 1 ? 'magie' : 'cloche');
  if (rang >= 3) setTimeout(() => jouerSon('fanfare'), 300);
}

// ---------------------------------------------------------------------
//  Transcendante : le vitrail se brise. Chaque verre du vitrail (polygone du SVG) devient un éclat,
//  découpé à sa place exacte à l'écran et de sa couleur : il saute vers l'extérieur en tournant,
//  puis retombe et s'efface (transform + opacité seulement : léger à animer).
// ---------------------------------------------------------------------
function briserVitrail(ov) {
  const vit = ov.querySelector('.ob__vitrail');
  const svg = vit?.querySelector('svg');
  if (!vit || !svg) return;
  const m = svg.getScreenCTM();
  const polys = [...svg.querySelectorAll('.verres polygon')].map((poly) => ({ poly, fill: getComputedStyle(poly).fill }));
  vit.classList.add('ob__vitrail--brise');
  if (reduit || !m) return;
  const couche = document.createElement('div');
  couche.className = 'ob__eclats-vitrail';
  ov.appendChild(couche);
  const cx = innerWidth / 2;
  const cy = innerHeight * 0.45;
  for (const { poly, fill } of polys) {
    const pts = [...poly.points].map((p) => [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0;
    const h = Math.max(...ys) - y0;
    if (w < 2 || h < 2 || x0 > innerWidth || y0 > innerHeight || x0 + w < 0 || y0 + h < 0) continue;
    const e = document.createElement('span');
    e.className = 'ob__eclat-vitrail';
    const forme = pts.map(([x, y]) => (x - x0).toFixed(1) + 'px ' + (y - y0).toFixed(1) + 'px').join(', ');
    Object.assign(e.style, {
      left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px',
      background: fill,
      clipPath: 'polygon(' + forme + ')',
    });
    couche.appendChild(e);
    // part du centre de l'explosion, saute vers l'extérieur, puis tombe
    const ex = x0 + w / 2 - cx;
    const ey = y0 + h / 2 - cy;
    const d = Math.hypot(ex, ey) || 1;
    const force = 60 + Math.random() * 140;
    const dx = (ex / d) * force;
    const dy = (ey / d) * force;
    const tombe = innerHeight * (0.6 + Math.random() * 0.6);
    const rot = (Math.random() - 0.5) * 540;
    e.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: 'translate(' + dx.toFixed(0) + 'px, ' + (dy - 40).toFixed(0) + 'px) rotate(' + (rot * 0.3).toFixed(0) + 'deg)', opacity: 1, offset: 0.22 },
      { transform: 'translate(' + (dx * 1.6).toFixed(0) + 'px, ' + (dy + tombe).toFixed(0) + 'px) rotate(' + rot.toFixed(0) + 'deg) scale(.7)', opacity: 0 },
    ], { duration: 1400 + Math.random() * 900, delay: Math.random() * 90, easing: 'cubic-bezier(.25,.6,.6,1)', fill: 'forwards' });
  }
  setTimeout(() => couche.remove(), 2600);
}

// Une carte se retourne, avec l'anticipation et l'éclat de sa rareté (se résout à la fin de l'effet)
async function revelerCarte(ov, zone, carte, c) {
  const rang = RARETES.indexOf(c.rarete);
  const coul = COULEURS_RARETE[c.rarete];

  // Anticipation
  if (rang === 2) {
    carte.classList.add('ob-carte--tourbillon');
    jouerSon('reve');
    await attendre(650);
    carte.classList.remove('ob-carte--tourbillon');   // sinon l'animation bloquerait le retournement
  } else if (rang === 3) {
    carte.classList.add('ob-carte--tremble');
    jouerSon('sombre');
    await attendre(900);
    carte.classList.remove('ob-carte--tremble');
  } else if (rang === 4) {
    // bandes noires de cinéma, la pièce s'assombrit, le vitrail s'allume en or et se fissure, puis éclate
    ov.classList.add('ob--cinema', 'ob--nuit');
    ov.style.setProperty('--rarete', coul);
    carte.classList.add('ob-carte--elevee');
    jouerSon('sombre');
    jouerSon('magie', 0.5);
    await attendre(700);
    ov.querySelector('.ob__vitrail')?.classList.add('ob__vitrail--tremble');
    jouerSon('choc');
    await attendre(700);
    briserVitrail(ov);
    jouerSon('acier');
  }

  carte.classList.add('ob-carte--revelee');
  ov.style.setProperty('--rarete', coul);   // le fond (lumière, rais, brume, braises) prend la couleur de cette carte
  const r = carte.querySelector('.ob-carte__corps').getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height * 0.45;
  eclats(zone, x, y, coul, 8 + rang * 6, 140 + rang * 50);
  if (rang === 0) jouerSon('pioche');
  if (rang >= 1) { onde(zone, x, y, coul, 2 + rang * 0.6, 700); jouerSon(rang >= 3 ? 'fanfare' : 'magie'); }
  if (rang === 1) pluie(zone, [coul, '#d5f5de'], 14, { monte: true, forme: 'feuille', duree: 1800 });
  if (rang >= 2) setTimeout(() => onde(zone, x, y, '#ffffff', 2.5 + rang * 0.5, 800, 2), 120);
  if (rang >= 3) {
    flashEcran(ov, coul, 600, 0.5);
    secouer(ov.querySelector('.ob__scene'), 8 + (rang - 3) * 10, 550);
    pluie(zone, rang === 4 ? ['#f6d27a', '#fff6d6', '#ffffff'] : ['#ff4b5c', '#ffb38a', '#ff8a8f'], rang === 4 ? 36 : 20,
      { forme: rang === 4 ? 'etoile' : 'losange', duree: 2400 });
    titre(ov, rang === 4 ? 'Transcendante' : 'Légendaire', coul, rang === 4 ? 'ob__titre--or' : '');
    jouerSon('tonnerre');
  }
  if (rang === 4) {
    flashEcran(ov, '#ffffff', 900, 0.95);
    for (let k = 0; k < 3; k++) setTimeout(() => onde(zone, x, y, k % 2 ? '#ffffff' : coul, 8 + k * 3, 1300, 6), k * 180);
    await attendre(1000);
    carte.classList.remove('ob-carte--elevee');
    ov.classList.remove('ob--nuit');
    setTimeout(() => ov.classList.remove('ob--cinema'), 900);
  }
  await attendre(rang >= 3 ? 700 : rang === 2 ? 350 : 150);
}

// details : Map nom -> carte du catalogue, pour écrire ses informations sur la face
export function ouvrirBoosterAnime(resultat, imageBooster, { restants = 0, surRouvrir = null, details = null } = {}) {
  // La plus rare en dernier
  const cartes = [...resultat.cartes].sort((a, b) => RARETES.indexOf(a.rarete) - RARETES.indexOf(b.rarete));
  const meilleure = resultat.meilleure_rarete ?? cartes.at(-1)?.rarete ?? 'commune';
  const couleur = COULEURS_RARETE[meilleure];

  const ov = document.createElement('div');
  ov.className = `ob ob--${meilleure}`;
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', `Ouverture : ${resultat.booster}`);
  ov.tabIndex = -1;
  ov.style.setProperty('--rarete', couleur);
  ov.innerHTML = `
    <div class="ob__vitrail" aria-hidden="true">${vitrail()}</div>
    <div class="ob__lumiere" aria-hidden="true"></div>
    <div class="ob__brume" aria-hidden="true"><span></span><span></span></div>
    <div class="ob__braises" aria-hidden="true">${reduit ? '' : htmlBraises()}</div>
    <div class="ob__scene">
      <div class="ob__porte" aria-hidden="true">
        <div class="ob__battant ob__battant--g" style="background-image:url('${esc(imageBooster)}')"></div>
        <div class="ob__battant ob__battant--d" style="background-image:url('${esc(imageBooster)}')"></div>
        <svg class="ob__fissures" viewBox="0 0 640 960" preserveAspectRatio="none">${[1, 2, 3].map(fissure).join('')}</svg>
        <span class="ob__cristal"></span>
      </div>
      <div class="ob__cartes ob__cartes--pile" style="--n:${cartes.length}">${cartes.map((c, i) => htmlCarte(c, i, details)).join('')}</div>
    </div>
    <p class="ob__aide" aria-live="polite">Tape sur le booster pour l'ouvrir</p>
    <div class="ob__fin" hidden>
      <p class="ob__bilan"></p>
      <div class="ob__boutons">
        ${restants > 0 && surRouvrir ? `<button type="button" class="ob__btn ob__btn--or" data-action="rouvrir">Ouvrir un autre (${restants})</button>` : ''}
        <button type="button" class="ob__btn" data-action="fermer">Fermer</button>
      </div>
    </div>
    <div class="ob__particules" aria-hidden="true"></div>
    <div class="ob__cinema" aria-hidden="true"></div>`;
  document.body.appendChild(ov);
  document.body.classList.add('ob-ouvert');
  // Les images des cartes sont décodées pendant que le joueur tape sur la porte :
  // le retournement n'a plus à attendre le décodage (sinon : saccade au moment de la révélation)
  ov.querySelectorAll('img').forEach((img) => img.decode?.().catch(() => {}));
  const masquerPage = setTimeout(() => document.body.classList.add('ob-plein'), reduit ? 0 : 320);
  ov.focus();

  const $ = (s) => ov.querySelector(s);
  const aide = (t) => { $('.ob__aide').textContent = t; };
  const porte = $('.ob__porte');
  const centreCristal = () => {
    const r = $('.ob__cristal').getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };

  let taps = 0;
  let phase = 'fissure';   // 'fissure' -> 'couleur' -> 'cartes' -> 'fin'
  let revelees = 0;
  let occupe = false;
  let enAttente = false;   // la carte du dessus est face cachée et attend d'être retournée

  return new Promise((resolve) => {
    const fermer = (rouvrir = false) => {
      clearTimeout(masquerPage);
      document.body.classList.remove('ob-plein');
      ov.classList.add('ob--sortie');
      setTimeout(() => {
        ov.remove();
        document.body.classList.remove('ob-ouvert');
        resolve({ rouvrir });
      }, reduit ? 0 : 300);
    };

    function taper() {
      if (occupe) return;
      if (phase === 'fissure') {
        taps += 1;
        ov.dataset.taps = taps;
        jouerSon(taps < TAPS_FISSURE ? 'choc' : 'acier');
        if (!reduit) porte.animate([
          { transform: 'translateX(0) rotate(0)' }, { transform: 'translateX(-9px) rotate(-1.2deg)' },
          { transform: 'translateX(8px) rotate(1deg)' }, { transform: 'translateX(-4px)' }, { transform: 'none' },
        ], { duration: 320 });
        const [x, y] = centreCristal();
        eclats($('.ob__particules'), x, y, '#ffffff', 8 + taps * 4, 120 + taps * 40);
        if (taps < TAPS_FISSURE) {
          aide(taps === TAPS_FISSURE - 1 ? 'Encore une fois…' : 'Continue de taper !');
          return;
        }
        // Dernier tap de fissure : le cristal éclate dans la couleur de la meilleure rareté
        phase = 'couleur';
        occupe = true;
        setTimeout(() => {
          ov.classList.add('ob--couleur');
          const [cx, cy] = centreCristal();
          eclaterCristal(ov, $('.ob__particules'), cx, cy, meilleure);
          aide('Tape pour révéler tes cartes');
          occupe = false;
        }, reduit ? 0 : 260);
        return;
      }
      if (phase === 'couleur') {
        // Les battants s'ouvrent, les cartes sortent
        phase = 'cartes';
        occupe = true;
        ov.classList.add('ob--ouvert');
        jouerSon('elan');
        jouerSon('cloche', 0.2);
        majPile();
        setTimeout(suivante, reduit ? 0 : 900);
        return;
      }
      if (phase === 'cartes') {
        // La carte du dessus attend face cachée : c'est le joueur qui la retourne
        if (enAttente) { retourner(); return; }
        // La carte révélée s'envole : on passe à la suivante (ou, à la fin, au récapitulatif en ligne)
        const actuelle = ov.querySelector(`.ob-carte[data-i="${revelees - 1}"]`);
        occupe = true;
        aide('');
        if (revelees >= cartes.length) { etaler(); return; }
        actuelle?.classList.add('ob-carte--partie');
        jouerSon('elan');
        setTimeout(suivante, reduit ? 0 : 380);
      }
    }

    // Place de chaque carte dans la pile (0 = dessus)
    function majPile() {
      ov.querySelectorAll('.ob-carte').forEach((el) => {
        const i = Number(el.dataset.i);
        el.style.setProperty('--p', Math.max(0, i - revelees));
      });
    }

    // La carte suivante arrive sur le dessus de la pile, face cachée : elle attend le clic du joueur
    function suivante() {
      const carte = ov.querySelector(`.ob-carte[data-i="${revelees}"]`);
      if (!carte) { occupe = false; return; }
      majPile();
      carte.classList.add('ob-carte--actuelle', 'ob-carte--attend');
      enAttente = true;
      occupe = false;
      aide(`Tape sur la carte pour la retourner (${revelees + 1} / ${cartes.length})`);
    }

    // Le joueur retourne la carte du dessus : l'animation de sa rareté
    function retourner() {
      const carte = ov.querySelector(`.ob-carte[data-i="${revelees}"]`);
      if (!carte) return;
      const c = cartes[revelees];
      carte.classList.remove('ob-carte--attend');
      enAttente = false;
      revelees += 1;
      occupe = true;
      aide('');
      revelerCarte(ov, $('.ob__particules'), carte, c).then(() => {
        occupe = false;
        aide(revelees >= cartes.length ? 'Tape pour voir tout ton butin' : `Tape pour la suivante (${revelees} / ${cartes.length})`);
      });
    }

    // Toutes les cartes vues : elles reviennent et s'alignent pour le récapitulatif
    function etaler() {
      const zone = $('.ob__cartes');
      const cartesEl = [...ov.querySelectorAll('.ob-carte')];
      cartesEl.forEach((el) => el.classList.remove('ob-carte--partie', 'ob-carte--actuelle'));
      zone.classList.remove('ob__cartes--pile');
      ov.style.setProperty('--rarete', couleur);   // récapitulatif : la couleur de la meilleure rareté
      zone.classList.add('ob__cartes--ligne');
      if (!reduit) {
        cartesEl.forEach((el, i) => el.animate([
          { transform: 'translateY(60px) scale(.6)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ], { duration: 520, delay: i * 90, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'backwards' }));
      }
      jouerSon('cloche');
      setTimeout(finir, reduit ? 0 : 450 + cartesEl.length * 90);
    }

    // Toutes les cartes sont retournées : le bilan et les boutons
    function finir() {
      phase = 'fin';
      const nouvelles = cartes.filter((x) => x.nouvelle).length;
      const bilan = [`${nouvelles} nouvelle${nouvelles > 1 ? 's' : ''} carte${nouvelles > 1 ? 's' : ''}`];
      if (resultat.or) bilan.push(`+${resultat.or} or`);
      if (resultat.xp) bilan.push(`+${resultat.xp} XP de pass`);
      $('.ob__bilan').textContent = bilan.join(' · ');
      aide('');
      setTimeout(() => { $('.ob__fin').hidden = false; $('.ob__fin button')?.focus(); }, reduit ? 0 : 500);
    }

    ov.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'fermer') return fermer(false);
      if (action === 'rouvrir') return fermer(true);
      if (phase !== 'fin') taper();
    });
    ov.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && phase === 'fin') { fermer(false); return; }
      if ((e.key === ' ' || e.key === 'Enter') && phase !== 'fin') { e.preventDefault(); taper(); }
    });
  });
}
