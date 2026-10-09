// =====================================================================
//  Bouton de connexion dans la barre de navigation
//  À inclure sur TOUTES les pages, avec un <div id="discord-auth"></div>
//  placé dans la nav à l'endroit où tu veux le bouton.
// =====================================================================
import { supabase, connexionDiscord, deconnexion, getMonJoueur, SITE_ROOT } from './supabase.js';

const zone = document.getElementById('discord-auth');

async function afficher() {
  if (!zone) return;

  const joueur = await getMonJoueur();

  // --- Pas connecté ---
  if (!joueur) {
    zone.innerHTML = `
      <button type="button" class="btn-discord" aria-label="Connecter Discord">
        <span class="btn-discord__logo" aria-hidden="true"></span>
        <span class="btn-discord__texte">Connecter Discord</span>
      </button>`;
    zone.querySelector('button').addEventListener('click', connexionDiscord);
    return;
  }

  // --- Connecté : on nettoie l'URL (Supabase y laisse des infos de connexion)
  if (location.hash.includes('access_token') || location.search.includes('code=')) {
    history.replaceState(null, '', location.pathname);
  }

  zone.innerHTML = `
    <a class="auth-user" href="${new URL('profil.html', SITE_ROOT)}">
      <img class="auth-user__avatar" alt="">
      <span class="auth-user__nom"></span>
    </a>
    <div class="auth-actions">
      <button type="button" class="btn-deco" title="Se déconnecter" aria-label="Se déconnecter">⏻</button>
      ${joueur.is_mj ? `<a class="lien-mj" href="${new URL('mj.html', SITE_ROOT)}" title="Panneau MJ" aria-label="Panneau MJ">MJ</a>` : ''}
    </div>`;

  // textContent plutôt que innerHTML : un pseudo ne peut pas injecter de code
  zone.querySelector('.auth-user__nom').textContent = joueur.username ?? 'Mon profil';
  const avatar = zone.querySelector('.auth-user__avatar');
  if (joueur.avatar_url) avatar.src = joueur.avatar_url;
  else avatar.remove();

  zone.querySelector('.btn-deco').addEventListener('click', deconnexion);
}

afficher();

// Se met à jour tout seul à la connexion / déconnexion
// (setTimeout : Supabase déconseille d'appeler la base directement dans ce callback)
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(afficher, 0);
});
