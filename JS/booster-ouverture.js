// =====================================================================
//  Ouverture d'un booster : l'animation (le tirage, lui, est déjà fait par le serveur,
//  ouvrir_booster dans SQL/boosters.sql)
//
//  Le joueur tape sur le booster :
//   - taps 1 à 3 : la porte tremble, se fissure, le cristal s'allume de plus en plus (blanc)
//   - tap 3     : le cristal éclate dans la couleur de la MEILLEURE rareté du booster
//   - tap 4     : les battants s'ouvrent, les cartes sortent face cachée
//   - puis      : chaque tap retourne une carte (la plus rare en dernier)
//  Usage : await ouvrirBoosterAnime(resultat, imageBooster, { restants, surRouvrir })
// =====================================================================
import { jouerSon } from './jeu-cartes-son.js';

const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RARETES = ['commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
const NOMS_RARETE = { commune: 'Commune', eveillee: 'Éveillée', mythique: 'Mythique', legendaire: 'Légendaire', transcendante: 'Transcendante' };
export const COULEURS_RARETE = {
  commune: '#c5cad3', eveillee: '#4fd987', mythique: '#5b9bff', legendaire: '#ff4b5c', transcendante: '#f6d27a',
};
const TAPS_FISSURE = 3;
const DOS = 'img/Cartes/Verso-gris.webp';   // dos gris, neutre : ne trahit pas la rareté avant le retournement
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

function htmlCarte(c, i) {
  return `
    <div class="ob-carte" data-i="${i}" style="--c:${COULEURS_RARETE[c.rarete] ?? '#fff'}; --i:${i}">
      <div class="ob-carte__corps">
        <div class="ob-carte__dos"><img src="${DOS}" alt=""></div>
        <div class="ob-carte__face"><img src="${esc(c.image)}" alt="${esc(c.nom)}"></div>
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

export function ouvrirBoosterAnime(resultat, imageBooster, { restants = 0, surRouvrir = null } = {}) {
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
    <div class="ob__lumiere" aria-hidden="true"></div>
    <div class="ob__rayons" aria-hidden="true"></div>
    <div class="ob__scene">
      <div class="ob__porte" aria-hidden="true">
        <div class="ob__battant ob__battant--g" style="background-image:url('${esc(imageBooster)}')"></div>
        <div class="ob__battant ob__battant--d" style="background-image:url('${esc(imageBooster)}')"></div>
        <svg class="ob__fissures" viewBox="0 0 640 960" preserveAspectRatio="none">${[1, 2, 3].map(fissure).join('')}</svg>
        <span class="ob__cristal"></span>
      </div>
      <div class="ob__cartes" style="--n:${cartes.length}">${cartes.map(htmlCarte).join('')}</div>
    </div>
    <p class="ob__aide" aria-live="polite">Tape sur le booster pour l'ouvrir</p>
    <div class="ob__fin" hidden>
      <p class="ob__bilan"></p>
      <div class="ob__boutons">
        ${restants > 0 && surRouvrir ? `<button type="button" class="ob__btn ob__btn--or" data-action="rouvrir">Ouvrir un autre (${restants})</button>` : ''}
        <button type="button" class="ob__btn" data-action="fermer">Fermer</button>
      </div>
    </div>
    <div class="ob__particules" aria-hidden="true"></div>`;
  document.body.appendChild(ov);
  document.body.classList.add('ob-ouvert');
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

  return new Promise((resolve) => {
    const fermer = (rouvrir = false) => {
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
          eclats($('.ob__particules'), cx, cy, couleur, 40, 340);
          jouerSon(RARETES.indexOf(meilleure) >= 3 ? 'tonnerre' : 'magie');
          if (RARETES.indexOf(meilleure) >= 3) setTimeout(() => jouerSon('fanfare'), 300);
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
        aide('Tape pour retourner les cartes');
        setTimeout(() => { occupe = false; }, reduit ? 0 : 900);
        return;
      }
      if (phase === 'cartes') {
        const carte = ov.querySelector(`.ob-carte[data-i="${revelees}"]`);
        if (!carte) return;
        carte.classList.add('ob-carte--revelee');
        const c = cartes[revelees];
        const rang = RARETES.indexOf(c.rarete);
        jouerSon(rang >= 3 ? 'fanfare' : rang >= 1 ? 'magie' : 'pioche');
        const r = carte.getBoundingClientRect();
        eclats($('.ob__particules'), r.left + r.width / 2, r.top + r.height * 0.4, COULEURS_RARETE[c.rarete], 10 + rang * 8, 140 + rang * 40);
        revelees += 1;
        if (revelees >= cartes.length) {
          phase = 'fin';
          const nouvelles = cartes.filter((x) => x.nouvelle).length;
          const bilan = [`${nouvelles} nouvelle${nouvelles > 1 ? 's' : ''} carte${nouvelles > 1 ? 's' : ''}`];
          if (resultat.or) bilan.push(`+${resultat.or} or`);
          if (resultat.xp) bilan.push(`+${resultat.xp} XP de pass`);
          $('.ob__bilan').textContent = bilan.join(' · ');
          aide('');
          setTimeout(() => { $('.ob__fin').hidden = false; $('.ob__fin button')?.focus(); }, reduit ? 0 : 500);
        } else {
          aide(revelees === cartes.length - 1 ? 'La dernière…' : 'Tape pour la suivante');
        }
      }
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
