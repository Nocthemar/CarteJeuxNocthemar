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


// ---------------------------------------------------------------------
//  Briques des attaques (JS/jeu-cartes-attaques.js) : projectiles, griffures,
//  rayons, symboles, pointes, recul. Uniquement transform / opacity : léger à afficher.
// ---------------------------------------------------------------------
const attendre = (a) => new Promise((r) => { if (!a) r(); else { a.onfinish = () => { a.effect?.target?.remove(); r(); }; a.oncancel = () => r(); } });

// Un symbole (texte ou emoji) ou une boule de lumière qui file d'un élément à l'autre,
// en arc, avec une traînée. forme : 'orbe' ou un symbole court (ex. '☾', '⛓')
export function projectile(de, vers, { forme = 'orbe', couleur = '#f0c873', taille = 26, duree = 420, arc = 40, trainee = true, rotation = 0 } = {}) {
  if (!de || !vers || !actif()) return Promise.resolve();
  const a = centre(de); const b = centre(vers);
  const el = document.createElement('span');
  el.className = `fx-projectile fx-projectile--${forme === 'orbe' ? 'orbe' : 'texte'}`;
  if (forme !== 'orbe') el.textContent = forme;
  el.style.setProperty('--c', couleur);
  el.style.setProperty('--t', `${taille}px`);
  Object.assign(el.style, { left: `${a.x}px`, top: `${a.y}px` });
  const dx = b.x - a.x; const dy = b.y - a.y;
  // point de contrôle de l'arc : perpendiculaire au trajet
  const lg = Math.hypot(dx, dy) || 1;
  const px = (-dy / lg) * arc; const py = (dx / lg) * arc;
  const pts = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8; const u = 1 - t;
    return [2 * u * t * px + t * dx, 2 * u * t * py + t * dy, t];
  });
  const anim = jouer(el, pts.map(([x, y, t]) => ({
    transform: `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(rotation * t).toFixed(0)}deg) scale(${(0.6 + Math.sin(t * Math.PI) * 0.6).toFixed(2)})`,
  })), { duration: duree, easing: 'cubic-bezier(.45,.05,.55,.95)' });
  if (trainee) {
    for (let i = 1; i < 5; i++) {
      setTimeout(() => {
        const [x, y] = pts[Math.min(8, i * 2)];
        const p = document.createElement('span');
        p.className = 'fx-particule fx-particule--rond';
        p.style.setProperty('--t', `${(taille * 0.45).toFixed(0)}px`);
        p.style.setProperty('--c', couleur);
        Object.assign(p.style, { left: `${a.x + x}px`, top: `${a.y + y}px` });
        jouer(p, [{ transform: 'scale(1)', opacity: 0.8 }, { transform: 'scale(.2)', opacity: 0 }], { duration: 380 });
      }, (duree / 5) * i);
    }
  }
  return attendre(anim);
}

// Griffures / entailles en travers d'un élément
export function griffes(el, { n = 3, couleur = '#ff4b5c', angle = -35, ecart = 16, duree = 380, epaisseur = 5 } = {}) {
  if (!el || !actif()) return;
  const { x, y, r } = centre(el);
  for (let i = 0; i < n; i++) {
    const g = document.createElement('span');
    g.className = 'fx-griffe';
    g.style.setProperty('--c', couleur);
    const off = (i - (n - 1) / 2) * ecart;
    Object.assign(g.style, { left: `${x + off}px`, top: `${y}px`, width: `${r.height * 1.15}px`, height: `${epaisseur}px` });
    const base = `translate(-50%, -50%) rotate(${angle}deg)`;
    jouer(g, [
      { transform: `${base} scaleX(0)`, opacity: 1 },
      { transform: `${base} scaleX(1)`, opacity: 1, offset: 0.35 },
      { transform: `${base} scaleX(1) scaleY(.4)`, opacity: 0 },
    ], { duration: duree, delay: i * 55, easing: 'ease-out' });
  }
}

// Rayon droit d'un élément à un autre
export function rayon(de, vers, { couleur = '#c9b2fb', epaisseur = 10, duree = 420 } = {}) {
  if (!de || !vers || !actif()) return;
  const a = centre(de); const b = centre(vers);
  const lg = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  const el = document.createElement('span');
  el.className = 'fx-rayon';
  el.style.setProperty('--c', couleur);
  Object.assign(el.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${lg}px`, height: `${epaisseur}px` });
  const base = `translateY(-50%) rotate(${ang}deg)`;
  jouer(el, [
    { transform: `${base} scaleX(0)`, opacity: 1 },
    { transform: `${base} scaleX(1)`, opacity: 1, offset: 0.3 },
    { transform: `${base} scaleX(1) scaleY(.15)`, opacity: 0 },
  ], { duration: duree, easing: 'ease-out' });
}

// Un grand symbole qui apparaît sur un élément (œil, lune, couronne, cœur, dé…)
export function symbole(el, texte, { couleur = '#f0c873', taille = 64, duree = 800, monte = 30 } = {}) {
  if (!el || !actif()) return;
  const { x, y } = centre(el);
  const s = document.createElement('span');
  s.className = 'fx-symbole';
  s.textContent = texte;
  s.style.setProperty('--c', couleur);
  s.style.setProperty('--t', `${taille}px`);
  Object.assign(s.style, { left: `${x}px`, top: `${y}px` });
  jouer(s, [
    { transform: 'translate(-50%, -50%) scale(.3) rotate(-12deg)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1.15) rotate(0deg)', opacity: 1, offset: 0.25 },
    { transform: `translate(-50%, calc(-50% - ${monte}px)) scale(1)`, opacity: 0 },
  ], { duration: duree, easing: 'cubic-bezier(.2,.9,.3,1)' });
}

// Pointes (racines, épines, os) qui jaillissent sous un élément
export function pointes(el, { n = 5, couleur = '#6fae5b', hauteur = 0.7, duree = 650 } = {}) {
  if (!el || !actif()) return;
  const { r } = centre(el);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = 'fx-pointe';
    p.style.setProperty('--c', couleur);
    const l = r.width / n;
    const h = r.height * hauteur * (0.6 + Math.random() * 0.5);
    Object.assign(p.style, { left: `${r.left + l * i + l * 0.1}px`, top: `${r.bottom - h}px`, width: `${l * 0.8}px`, height: `${h}px` });
    jouer(p, [
      { transform: 'scaleY(0)', opacity: 1 },
      { transform: 'scaleY(1.1)', opacity: 1, offset: 0.3 },
      { transform: 'scaleY(1)', opacity: 1, offset: 0.7 },
      { transform: 'scaleY(0)', opacity: 0 },
    ], { duration: duree, delay: Math.random() * 120, easing: 'cubic-bezier(.2,1.3,.4,1)' });
  }
}

// Recul d'un élément touché, dans le sens du coup (dx, dy : direction), puis retour
export function recul(el, dx = 0, dy = -1, force = 14) {
  if (!el || !actif()) return;
  const lg = Math.hypot(dx, dy) || 1;
  const x = (dx / lg) * force; const y = (dy / lg) * force;
  el.animate([
    { translate: '0 0', rotate: '0deg' },
    { translate: `${x.toFixed(1)}px ${y.toFixed(1)}px`, rotate: `${(x / 3).toFixed(1)}deg`, offset: 0.2 },
    { translate: `${(-x * 0.25).toFixed(1)}px ${(-y * 0.25).toFixed(1)}px`, rotate: `${(-x / 8).toFixed(1)}deg`, offset: 0.55 },
    { translate: '0 0', rotate: '0deg' },
  ], { duration: 420, easing: 'ease-out' });
}

// Annonce du nom de l'attaque au-dessus de l'attaquant ; renvoie une fonction qui la retire
export function annonce(el, texte, icone = '', couleur = '#f0c873') {
  if (!el) return () => {};
  const { x, r } = centre(el);
  const a = document.createElement('span');
  a.className = 'fx-annonce';
  a.style.setProperty('--c', couleur);
  a.innerHTML = `${icone ? '<i></i>' : ''}<b></b>`;
  if (icone) a.querySelector('i').textContent = icone;
  a.querySelector('b').textContent = texte;
  // Au-dessus de l'élément, ou dessous s'il est dans la moitié basse de l'écran (tes troupes) :
  // le nom ne passe jamais sur le dé, au centre du plateau
  const dessous = r.top + r.height / 2 > innerHeight * 0.5;
  const [depart, pose, fin] = dessous
    ? ['translate(-50%, -40%) scale(.7)', 'translate(-50%, 0) scale(1)', 'translate(-50%, 40%) scale(.9)']
    : ['translate(-50%, -60%) scale(.7)', 'translate(-50%, -100%) scale(1)', 'translate(-50%, -140%) scale(.9)'];
  Object.assign(a.style, { left: `${x}px`, top: dessous ? `${Math.min(innerHeight - 40, r.bottom + 8)}px` : `${Math.max(40, r.top - 8)}px` });
  calque().appendChild(a);
  if (actif()) {
    a.animate([{ opacity: 0, transform: depart }, { opacity: 1, transform: pose }],
      { duration: 260, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'forwards' });
  } else a.style.transform = pose;
  return () => {
    if (!actif()) { a.remove(); return; }
    const s = a.animate([{ opacity: 1, transform: pose }, { opacity: 0, transform: fin }], { duration: 300, fill: 'forwards' });
    s.onfinish = () => a.remove();
  };
}

// Une carte (clone) vole d'un endroit à un autre (main -> terrain, main -> centre)
// html : la face à montrer pendant le vol (carte adverse, cachée dans sa main)
export function envol(source, cible, { duree = 460, rotation = 0, html = null } = {}) {
  if (!source || !cible || !actif()) return Promise.resolve();
  const r = source.getBoundingClientRect();
  const rc = cible.getBoundingClientRect();
  const el = html ? Object.assign(document.createElement('div'), { innerHTML: html }).firstElementChild : source.cloneNode(true);
  el.classList.add('fx-envol');
  el.classList.remove('est-choisie', 'est-jouable', 'incline');
  el.removeAttribute('data-index');
  // départ à la largeur de la carte d'origine (petit dos pour l'adversaire), en forme 2/3
  const l = r.width;
  Object.assign(el.style, { left: `${r.left + r.width / 2 - l / 2}px`, top: `${r.top + r.height / 2 - l * 0.75}px`, width: `${l}px` });
  const dx = rc.left + rc.width / 2 - (r.left + r.width / 2);
  const dy = rc.top + rc.height / 2 - (r.top + r.height / 2);
  const s = rc.width / l;
  const anim = jouer(el, [
    { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
    { transform: `translate(${(dx * 0.5).toFixed(0)}px, ${(dy * 0.5 - 70).toFixed(0)}px) scale(${((1 + s) / 2 * 1.3).toFixed(2)}) rotate(${rotation}deg)`, offset: 0.55 },
    { transform: `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(${s.toFixed(2)}) rotate(0deg)` },
  ], { duration: duree, easing: 'cubic-bezier(.3,.1,.3,1)' });
  return attendre(anim);
}
