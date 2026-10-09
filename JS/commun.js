// =====================================================================
//  Petits outils partagés par les pages connectées (profil, boutique, MJ)
// =====================================================================

export const $ = (id) => document.getElementById(id);

// Protège contre l'injection de code quand on insère du texte venant de la base
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Couleur de thème venant de la base : seulement un code hexadécimal (#rgb, #rrggbb…), sinon null
export const couleur = (c) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : null);

export const LIBELLES = { banner: 'Bannière', title: 'Titre', theme: 'Thème', rp: 'Objet', wallpaper: 'Fond', access: 'Accès', other: 'Divers' };
export const SOURCES  = { bot: 'En jeu', mj: 'MJ', boutique_jour: 'Boutique du marchand', boutique_fun: 'Boutique fun', histoire: 'Mode Histoire' };

// Bandeau de notification (#notif) qui disparaît tout seul
let minuteurNotif;
export function notifier(message, type = 'ok') {
  const n = $('notif');
  n.textContent = message;
  n.className = `notif notif--${type} notif--visible`;
  clearTimeout(minuteurNotif);
  minuteurNotif = setTimeout(() => n.classList.remove('notif--visible'), 4000);
}
