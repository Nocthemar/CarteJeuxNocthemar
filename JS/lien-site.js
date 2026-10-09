// =====================================================================
//  Liens vers le site Nocthémar (le Codex, le profil, la boutique…)
//
//  Le jeu de cartes vit maintenant à part. Les pages du site qu'il cite
//  (index.html, profil.html, boutique.html, mj.html, categories/…) ne sont
//  pas dans ce dossier : tous les liens vers elles sont réécrits ici pour
//  pointer vers le site Nocthémar, y compris ceux ajoutés plus tard par le JS.
//
//  ⚠️ À remplir : l'adresse du site Nocthémar, avec le « / » final.
//  Exemple : 'https://ton-pseudo.github.io/JDR-Nocthemar/'
// =====================================================================
window.NOCTHEMAR_SITE = 'https://ton-site-nocthemar.example/';

(function () {
  const site = window.NOCTHEMAR_SITE;
  const racine = new URL('../', document.currentScript.src);   // racine du jeu de cartes
  // Pages du site (et non du jeu)
  const PAGES_SITE = ['index.html', 'profil.html', 'boutique.html', 'mj.html'];
  const estDuSite = (chemin) => PAGES_SITE.includes(chemin) || chemin.startsWith('categories/')
    || chemin.startsWith('Personnages/') || chemin.startsWith('Bestiaire/') || chemin.startsWith('Monde/')
    || chemin.startsWith('Rang des Pouvoirs/') || chemin === '';

  function corriger(a) {
    const brut = a.getAttribute('href');
    if (!brut || brut.startsWith('#') || /^(mailto|tel|javascript):/i.test(brut)) return;
    let url;
    try { url = new URL(brut, location.href); } catch { return; }
    if (url.origin !== racine.origin || !url.pathname.startsWith(racine.pathname)) return;
    const chemin = decodeURIComponent(url.pathname.slice(racine.pathname.length));
    if (!estDuSite(chemin)) return;
    a.href = new URL(chemin + url.search + url.hash, site).href;
  }
  const tout = (zone) => zone.querySelectorAll?.('a[href]').forEach(corriger);

  // Les liens de la page, puis ceux ajoutés plus tard (barre latérale, compte Discord…)
  document.addEventListener('DOMContentLoaded', () => tout(document));
  new MutationObserver((changements) => {
    for (const c of changements) {
      c.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches('a[href]')) corriger(n); tout(n); } });
      if (c.type === 'attributes' && c.target.matches?.('a[href]')) corriger(c.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
})();
