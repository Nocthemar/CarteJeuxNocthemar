// =====================================================================
//  Duel des Couronnes — effets visuels : éclats d'une carte détruite,
//  étincelles, braises, éclairs, poussière, ondes, flashs, voile, secousse.
//  Tout est créé à la volée dans une couche au-dessus de la page, puis retiré.
//  Rien ne s'affiche si l'utilisateur réduit les animations ou si l'onglet est caché.
// =====================================================================
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const actif = () => !reduit && !document.hidden;

let couche = null;
function calque() {
  if (!couche?.isConnected) {
    couche = document.createElement('div');
    couche.className = 'fx-couche';
    document.body.appendChild(couche);
  }
  return couche;
}

const centre = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
};

// Anime un élément puis le retire
function jouer(el, images, options) {
  calque().appendChild(el);
  const a = el.animate(images, { fill: 'forwards', ...options });
  a.onfinish = () => el.remove();
  return a;
}

// Particules qui jaillissent d'un élément
// depuis : 'centre' (explosion) ou 'surface' (répartie sur la carte)
// monte  : vitesse vers le haut ; gravite : chute finale (négative = elles montent encore)
export function particules(el, {
  n = 14, couleurs = ['#f0c873'], vitesse = 120, gravite = 60, taille = [4, 8],
  duree = 700, rond = false, monte = 0, depuis = 'centre',
} = {}) {
  if (!el || !actif()) return;
  const { x, y, r } = centre(el);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = `fx-particule${rond ? ' fx-particule--rond' : ''}`;
    const t = taille[0] + Math.random() * (taille[1] - taille[0]);
    p.style.setProperty('--t', `${t.toFixed(1)}px`);
    p.style.setProperty('--c', couleurs[i % couleurs.length]);
    p.style.left = `${x + (depuis === 'surface' ? (Math.random() - 0.5) * r.width * 0.8 : 0)}px`;
    p.style.top = `${y + (depuis === 'surface' ? (Math.random() - 0.5) * r.height * 0.7 : 0)}px`;
    const angle = Math.random() * Math.PI * 2;
    const v = vitesse * (0.4 + Math.random() * 0.8);
    const dx = Math.cos(angle) * v;
    const dy = Math.sin(angle) * v - monte;
    jouer(p, [
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) rotate(${(Math.random() - 0.5) * 300}deg) scale(.9)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy + gravite}px) rotate(${(Math.random() - 0.5) * 540}deg) scale(.3)`, opacity: 0 },
    ], { duration: duree * (0.7 + Math.random() * 0.6), easing: 'cubic-bezier(.15,.7,.35,1)' });
  }
}

// Onde circulaire qui s'élargit
export function onde(el, couleur = '#f0c873', taille = 2.2, duree = 600) {
  if (!el || !actif()) return;
  const { x, y, r } = centre(el);
  const o = document.createElement('span');
  o.className = 'fx-onde';
  o.style.setProperty('--c', couleur);
  const d = Math.max(r.width, r.height);
  Object.assign(o.style, { left: `${x}px`, top: `${y}px`, width: `${d}px`, height: `${d}px` });
  jouer(o, [{ transform: 'scale(.2)', opacity: 1 }, { transform: `scale(${taille})`, opacity: 0 }], { duration: duree, easing: 'ease-out' });
}

// Éclair de lumière sur un élément
export function flash(el, couleur = 'rgba(255,240,200,.95)', taille = 2.4, duree = 420) {
  if (!el || !actif()) return;
  const { x, y, r } = centre(el);
  const f = document.createElement('span');
  f.className = 'fx-flash';
  f.style.setProperty('--c', couleur);
  const d = Math.max(r.width, r.height);
  Object.assign(f.style, { left: `${x}px`, top: `${y}px`, width: `${d}px`, height: `${d}px` });
  jouer(f, [{ transform: 'scale(.3)', opacity: 1 }, { transform: `scale(${taille})`, opacity: 0 }], { duration: duree, easing: 'ease-out' });
}

// Voile coloré sur les bords de l'écran (héros touché, malédiction…)
export function voile(couleur = 'rgba(183,40,48,.55)', duree = 650) {
  if (!actif()) return;
  const v = document.createElement('span');
  v.className = 'fx-voile';
  v.style.setProperty('--c', couleur);
  jouer(v, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: duree, easing: 'ease-out' });
}

// Secousse du plateau
export function secousseEcran(force = 8, duree = 420) {
  const cible = document.getElementById('scene-table');
  if (!cible || !actif()) return;
  const images = Array.from({ length: 7 }, (_, i) => {
    const f = force * (1 - i / 7);
    return { transform: `translate(${((Math.random() - 0.5) * 2 * f).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * f).toFixed(1)}px)` };
  });
  images.push({ transform: 'translate(0, 0)' });
  cible.animate(images, { duration: duree, easing: 'ease-out' });
}

// Éclair qui tombe du haut de l'écran sur un élément
export function eclair(el) {
  if (!el || !actif()) return;
  const { x, y } = centre(el);
  for (let i = 0; i < 2; i++) {
    const e = document.createElement('span');
    e.className = 'fx-eclair-trait';
    Object.assign(e.style, { left: `${x + (i ? 14 : -6)}px`, top: '0px', height: `${y}px` });
    jouer(e, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.2, offset: 0.3 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }],
      { duration: 480, delay: i * 70, easing: 'linear' });
  }
  flash(el, 'rgba(200,214,255,.95)', 2.8, 500);
}

// Une carte détruite éclate en éclats à facettes (des morceaux de la vraie carte),
// avec un flash, une onde et des étincelles
export function briser(el, couleurs = ['#f6d995', '#f0c873', '#ffffff', '#d9a441']) {
  if (!el) return;
  if (!actif()) { el.style.visibility = 'hidden'; return; }
  const r = el.getBoundingClientRect();
  const cols = 3;
  const lignes = 4;
  // Grille de points déformée (bords fixes), découpée en triangles
  const pts = [];
  for (let j = 0; j <= lignes; j++) {
    pts[j] = [];
    for (let i = 0; i <= cols; i++) {
      const bord = i === 0 || i === cols || j === 0 || j === lignes;
      pts[j][i] = [
        (i / cols) * 100 + (bord ? 0 : (Math.random() - 0.5) * 18),
        (j / lignes) * 100 + (bord ? 0 : (Math.random() - 0.5) * 14),
      ];
    }
  }
  const morceaux = [];
  for (let j = 0; j < lignes; j++) {
    for (let i = 0; i < cols; i++) {
      const a = pts[j][i]; const b = pts[j][i + 1]; const c = pts[j + 1][i + 1]; const d = pts[j + 1][i];
      morceaux.push((i + j) % 2 ? [a, b, c] : [a, b, d], (i + j) % 2 ? [a, c, d] : [b, c, d]);
    }
  }
  for (const tri of morceaux) {
    const copie = el.cloneNode(true);
    copie.removeAttribute('data-uid');
    copie.className = `${el.className} fx-eclat`.replace(/\b(est-ciblable|est-choisie|fx-elan|fx-prepare|fx-secousse)\b/g, '');
    Object.assign(copie.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      transform: 'none', animation: 'none', transition: 'none',
      clipPath: `polygon(${tri.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(',')})`,
    });
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3 - 50;
    const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3 - 50;
    const dx = cx * (1.6 + Math.random()) + (Math.random() - 0.5) * 40;
    const dy = cy * (1.2 + Math.random()) - 30 - Math.random() * 40;
    jouer(copie, [
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) rotate(${(Math.random() - 0.5) * 60}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy + 140}px) rotate(${(Math.random() - 0.5) * 160}deg) scale(.85)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.6,.4,1)' });
  }
  el.style.visibility = 'hidden';
  flash(el, 'rgba(255,236,190,.95)', 2.2, 380);
  onde(el, couleurs[0], 2.6, 650);
  particules(el, { n: 24, couleurs, vitesse: 190, gravite: 110, taille: [3, 8], duree: 900 });
}
