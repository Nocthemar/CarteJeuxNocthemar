// =====================================================================
//  Passage en douceur entre le menu du duel et l'Histoire (avec CSS/transitions-pages.css)
//  Seulement pour les navigateurs sans transition native entre pages (View Transitions) :
//  fondu au noir avant de partir, fondu à l'arrivée.
// =====================================================================
(() => {
  if ('CSSViewTransitionRule' in window) return;   // le navigateur s'en charge tout seul
  const PAGES = ['jeu-cartes.html', 'histoire.html'];
  const versPage = (url) => url.origin === location.origin && PAGES.some((p) => url.pathname.endsWith('/' + p));

  // Arrivée : fondu si l'on vient de l'autre page
  try {
    if (document.referrer && versPage(new URL(document.referrer))) document.documentElement.classList.add('page-arrivee');
  } catch {}

  // Départ : fondu au noir, puis changement de page
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const lien = e.target.closest('a[href]');
    if (!lien || lien.target === '_blank') return;
    const url = new URL(lien.href, location.href);
    if (!versPage(url) || url.pathname === location.pathname) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    document.documentElement.classList.add('page-depart');
    setTimeout(() => { location.href = url.href; }, 150);
  });

  // Retour arrière : la page revient du cache, on la rend visible
  addEventListener('pageshow', (e) => { if (e.persisted) document.documentElement.classList.remove('page-depart'); });
})();
