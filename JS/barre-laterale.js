// =====================================================================
//  Barre de navigation latérale du jeu de cartes
//  La barre du haut ne garde que le titre, « Codex de l'univers JDR » et la
//  page en cours ; le reste (accueil, recherche, boutique, retour,
//  compte Discord) passe dans une barre verticale à gauche.
//  Pour annuler l'essai : supprimer ce fichier, CSS/barre-laterale.css,
//  et la ligne <script src=".../JS/barre-laterale.js"> de chaque page.
//
//  À charger APRÈS search.js et AVANT auth.js : les éléments existants
//  (recherche, zone #discord-auth) sont déplacés, pas recréés, donc
//  leurs scripts continuent de fonctionner.
// =====================================================================
(function(){
  const topbar = document.querySelector('.topbar');
  if(!topbar) return;

  const script = document.currentScript;
  const racine = new URL('../', script.src);
  const lien = (chemin) => new URL(chemin, racine).href;

  // Feuille de style de l'essai ; la barre reste invisible tant qu'elle n'est pas chargée
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('../CSS/barre-laterale.css', script.src).href;
  document.head.appendChild(css);

  const ICONES = {
    accueil: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    cartes:  '<rect x="3" y="6" width="11" height="15" rx="1.5" transform="rotate(-8 8.5 13.5)"/><rect x="10" y="3" width="11" height="15" rx="1.5" transform="rotate(8 15.5 10.5)"/>',
    pass:    '<path d="M6 3h12v18l-6-4-6 4z"/><path d="M9 8l3 2 3-2M9 12l3 2 3-2"/>',
    collection:'<path d="M5 3h11l3 3v15H5z"/><path d="M9 3v6l2-1.5L13 9V3"/>',
    catalogue:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/>',
    boutique:'<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    marche:  '<path d="M12 3v18M7 21h10"/><path d="M4 7h16"/><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
    reglages:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    succes:  '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
    retour:  '<path d="M15 5l-7 7 7 7"/>',
  };
  const icone = (nom) => `<span class="rail-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom]}</svg></span>`;

  const page = location.pathname.replace(/\/$/, '/index.html');
  const surAccueil = new URL('index.html', racine).pathname === page;
  const surBoutique = new URL('boutique.html', racine).pathname === page;
  // Menu des modes de jeu (Duel, Histoire) : actif sur le menu du duel et sur la carte du mode Histoire
  const surModes = ['jeu-cartes.html', 'histoire.html'].some((p) => new URL(p, racine).pathname === page);
  const surPass = new URL('pass.html', racine).pathname === page;
  const surCollection =new URL('collection.html', racine).pathname === page;
  const surCatalogue = new URL('toutes-les-cartes.html', racine).pathname === page;
  const surSucces = new URL('succes.html', racine).pathname === page;
  const surMarche = new URL('marche.html', racine).pathname === page;
  const surReglages = new URL('parametres.html', racine).pathname === page;

  // Paramètres d'affichage (parametres.html, JS/preferences.js) : posés sur <html> dès le chargement
  try {
    const reduit = localStorage.getItem('duel-animations-reduites') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.toggle('anim-reduites', reduit);
    document.documentElement.classList.toggle('effets-legers', localStorage.getItem('duel-effets-legers') === '1');
  } catch (e) { /* stockage indisponible */ }

  function item(nom, libelle, href, actif){
    const a = document.createElement('a');
    a.className = 'rail-item' + (actif ? ' is-active' : '');
    a.href = href;
    a.innerHTML = icone(nom) + '<span class="rail-label"></span>';
    a.querySelector('.rail-label').textContent = libelle;
    a.setAttribute('aria-label', libelle);
    if(actif) a.setAttribute('aria-current', 'page');
    return a;
  }

  const rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', 'Navigation');
  rail.style.visibility = 'hidden';
  css.addEventListener('load', () => { rail.style.visibility = ''; });
  css.addEventListener('error', () => { rail.style.visibility = ''; });

  rail.append(
    // Lien direct vers le site Nocthémar (adresse dans JS/lien-site.js)
    item('accueil', 'Site Nocthémar', window.NOCTHEMAR_SITE ?? lien('index.html'), false),
  );

  // Recherche : on déplace le composant existant et on ajoute un libellé au bouton
  const recherche = topbar.querySelector('.search-wrap');
  if(recherche){
    const bouton = recherche.querySelector('.nav-search');
    bouton.classList.add('rail-item');
    const svg = bouton.querySelector('svg');
    const ico = document.createElement('span');
    ico.className = 'rail-ico';
    svg.replaceWith(ico);
    ico.appendChild(svg);
    bouton.insertAdjacentHTML('beforeend', '<span class="rail-label">Rechercher</span>');
    rail.appendChild(recherche);
  }

  // « ← Catégories », « ← Personnages »… devient un élément Retour
  const retour = topbar.querySelector('.back');
  if(retour){
    rail.appendChild(item('retour', retour.textContent.replace(/^\s*←\s*/, '').trim() || 'Retour', retour.href, false));
    retour.remove();
  }

  const sep = document.createElement('span');
  sep.className = 'rail-sep';
  rail.appendChild(sep);

  // Compte Discord : la zone est déplacée telle quelle (JS/auth.js la remplit ensuite)
  const compte = document.getElementById('discord-auth');
  if(compte) rail.appendChild(compte);

  // Modes de jeu, Pass de saison, Collection puis Boutique : juste sous la photo du compte Discord.
  // JS/auth.js réécrit la zone à chaque (dé)connexion : on la replace à chaque fois.
  const liens = document.createElement('div');
  liens.className = 'rail-compte-liens';
  liens.append(
    item('cartes', 'Modes de jeu', lien('jeu-cartes.html'), surModes),
    item('pass', 'Pass de saison', lien('pass.html'), surPass),
    item('collection', 'Collection', lien('collection.html'), surCollection),
    item('catalogue', 'Toutes les cartes', lien('toutes-les-cartes.html'), surCatalogue),
    item('succes', 'Succès', lien('succes.html'), surSucces),
    item('boutique', 'Boutique', lien('boutique.html'), surBoutique),
    item('marche', 'Marché', lien('marche.html'), surMarche),
    item('reglages', 'Paramètres', lien('parametres.html'), surReglages),
  );
  if(compte){
    const placer = () => {
      const ancre = compte.querySelector('.auth-user, .btn-discord');
      if(ancre && ancre.nextElementSibling !== liens) ancre.after(liens);
    };
    placer();
    new MutationObserver(placer).observe(compte, { childList:true });
  } else {
    rail.appendChild(liens);
  }

  topbar.querySelector('.nav-links')?.remove();
  topbar.querySelector('.nav-boutique')?.remove();

  // Pages sans fil d'Ariane (accueil, boutique, profil…) : on affiche le nom de la page
  if(!topbar.querySelector('.crumb')){
    const nom = surAccueil ? 'Accueil' : document.title.split(' — ')[0];
    const crumb = document.createElement('span');
    crumb.className = 'crumb';
    crumb.innerHTML = '/ <span class="cur"></span>';
    crumb.querySelector('.cur').textContent = nom;
    (topbar.querySelector('.brand-sub') ?? topbar.querySelector('.brand')).after(crumb);
  }

  document.body.classList.add('has-rail');
  document.body.appendChild(rail);
})();
