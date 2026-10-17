// =====================================================================
//  Badges de succès et animation « Succès débloqué » (CSS/succes-badges.css)
//  Partagé par la page des succès (JS/succes.js) et le profil (JS/profil.js, vitrine de badges).
//  Rareté (comme sur Steam) : commun, rare, epique, legendaire — chacune a sa couleur et son animation.
// =====================================================================
import { esc } from './commun.js';

export const RARETES_SUCCES = {
  commun:     { nom: 'Commun',     duree: 2300, etincelles: 0 },
  rare:       { nom: 'Rare',       duree: 2900, etincelles: 10 },
  epique:     { nom: 'Épique',     duree: 3600, etincelles: 18 },
  legendaire: { nom: 'Légendaire', duree: 4800, etincelles: 30 },
};
const rareteDe = (s) => (RARETES_SUCCES[s?.rarete] ? s.rarete : 'commun');

export const pourcentageTexte = (p) => {
  const n = Number(p) || 0;
  return `${n < 1 && n > 0 ? n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : Math.round(n)} %`;
};

// Le badge : un médaillon hexagonal à la couleur de la rareté, l'icône au centre
export function htmlBadge(s, { taille = '' } = {}) {
  const r = rareteDe(s);
  return `<span class="badge-succes badge-succes--${r}${taille ? ` badge-succes--${taille}` : ''}" aria-hidden="true">
    <span class="badge-succes__cadre"></span>
    <span class="badge-succes__icone">${esc(s?.icone ?? '✦')}</span>
  </span>`;
}

// L'animation « Succès débloqué » : plein écran, différente selon la rareté.
// Se ferme seule (plus longue pour les plus rares) ou au clic / Échap. Renvoie une promesse.
export function celebrerSucces(s, { recompense = s?.recompense ?? 0 } = {}) {
  const r = rareteDe(s);
  const { nom, duree, etincelles } = RARETES_SUCCES[r];
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.classList.contains('anim-reduites');

  const fond = document.createElement('div');
  fond.className = `succes-obtenu succes-obtenu--${r}${reduit ? ' succes-obtenu--sobre' : ''}`;
  fond.setAttribute('role', 'dialog');
  fond.setAttribute('aria-modal', 'true');
  fond.setAttribute('aria-label', `Succès débloqué : ${s?.nom ?? ''}`);
  const eclats = reduit ? '' : Array.from({ length: etincelles }, (_, i) => {
    const a = (360 / etincelles) * i + Math.random() * 14;
    const d = 140 + Math.random() * 160;
    return `<i style="--a:${a.toFixed(0)}deg;--d:${d.toFixed(0)}px;--t:${(Math.random() * .35).toFixed(2)}s"></i>`;
  }).join('');
  fond.innerHTML = `
    <div class="succes-obtenu__rayons" aria-hidden="true"></div>
    <div class="succes-obtenu__onde" aria-hidden="true"></div>
    <div class="succes-obtenu__onde succes-obtenu__onde--2" aria-hidden="true"></div>
    <div class="succes-obtenu__eclats" aria-hidden="true">${eclats}</div>
    <div class="succes-obtenu__contenu">
      <span class="succes-obtenu__sur">Succès débloqué · ${nom}</span>
      <div class="succes-obtenu__badge">${htmlBadge(s, { taille: 'geant' })}</div>
      <h2 class="succes-obtenu__nom">${esc(s?.nom ?? '')}</h2>
      <p class="succes-obtenu__desc">${esc(s?.description ?? '')}</p>
      ${recompense ? `<p class="succes-obtenu__or"><img src="img/Equipement/Or-icone.webp" alt=""> +${Number(recompense).toLocaleString('fr-FR')} or</p>` : ''}
      ${s?.pourcentage != null ? `<p class="succes-obtenu__pct">Obtenu par ${pourcentageTexte(s.pourcentage)} des joueurs</p>` : ''}
    </div>`;

  return new Promise((fini) => {
    let minuterie;
    const fermer = () => {
      clearTimeout(minuterie);
      document.removeEventListener('keydown', clavier);
      fond.classList.add('est-fermee');
      setTimeout(() => { fond.remove(); fini(); }, reduit ? 0 : 320);
    };
    const clavier = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fermer(); } };
    fond.addEventListener('click', fermer, { once: true });
    document.addEventListener('keydown', clavier);
    document.body.append(fond);
    minuterie = setTimeout(fermer, reduit ? 1800 : duree);
  });
}
