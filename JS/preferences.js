// =====================================================================
//  Préférences du joueur (page Paramètres, parametres.html), retenues dans le navigateur.
//  Lues par les pages du jeu : animations réduites, effets légers, conseils du duel.
//  (Les volumes sont dans JS/jeu-cartes-son.js.)
// =====================================================================
export const CLES = {
  animationsReduites: 'duel-animations-reduites',   // '1' : animations coupées ou abrégées
  effetsLegers: 'duel-effets-legers',               // '1' : moins de particules et de lueurs (performances)
  conseils: 'duel-conseils',                        // '1' : la consigne du tour s'affiche en duel
};

export function lirePref(cle) {
  try { return localStorage.getItem(cle) === '1'; } catch { return false; }
}
export function ecrirePref(cle, actif) {
  try { localStorage.setItem(cle, actif ? '1' : '0'); } catch { /* stockage indisponible */ }
  appliquerClasses();
}

// Animations réduites : le réglage du système, ou celui des Paramètres
export const animationsReduites = () => matchMedia('(prefers-reduced-motion: reduce)').matches || lirePref(CLES.animationsReduites);
export const effetsLegers = () => lirePref(CLES.effetsLegers);

// Classes sur <html> pour le CSS (CSS/compte.css : html.anim-reduites, html.effets-legers)
export function appliquerClasses() {
  document.documentElement.classList.toggle('anim-reduites', animationsReduites());
  document.documentElement.classList.toggle('effets-legers', effetsLegers());
}
appliquerClasses();
