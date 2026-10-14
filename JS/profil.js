// =====================================================================
//  Page profil
//  Profil du joueur, consacré au Duel des Couronnes (jeu de cartes)
//  profil.html           -> mon profil (deck, cartes, objets de pouvoir, pièces, cosmétiques)
//  profil.html?id=12345  -> profil public d'un autre joueur (ID Discord)
// =====================================================================
import { supabase, connexionDiscord, getMonJoueur, SITE_ROOT } from './supabase.js';
import { $, esc, couleur } from './commun.js';
import { chargerDeck, Deck, activerGlisser, htmlCarte } from './cartes.js';
import { OBJETS, TAILLE_DECK, objetDepuisNom } from './jeu-cartes-moteur.js';

// Les bannières (achetées à la boutique) restent sur le site Nocthémar (JS/lien-site.js)
const RACINE_IMAGES = window.NOCTHEMAR_SITE ? new URL(window.NOCTHEMAR_SITE) : SITE_ROOT;

// Le joueur + ses cosmétiques équipés, en une seule requête
const SELECT_JOUEUR = `
  *,
  banner:items!players_banner_item_id_fkey(*),
  title:items!players_title_item_id_fkey(*),
  theme:items!players_theme_item_id_fkey(*)
`;


async function init() {
  const idVisite = new URLSearchParams(location.search).get('id');
  const moi = await getMonJoueur();
  const discordId = idVisite || moi?.discord_id;

  // Personne de connecté et pas de profil demandé
  if (!discordId) {
    $('chargement').hidden = true;
    $('non-connecte').hidden = false;
    $('btn-connexion').addEventListener('click', connexionDiscord);
    return;
  }

  const { data: joueur, error } = await supabase
    .from('players')
    .select(SELECT_JOUEUR)
    .eq('discord_id', discordId)
    .maybeSingle();

  if (error || !joueur) {
    $('chargement').textContent = 'Joueur introuvable.';
    return;
  }

  const estMoi = moi?.discord_id === discordId;
  // Profil d'un autre joueur, quand on est connecté : lui proposer un échange de cartes (le marché du grimoire)
  if (moi && !estMoi) {
    $('lien-echange').href = `marche.html?avec=${encodeURIComponent(discordId)}#echanges`;
    $('lien-echange').hidden = false;
  }

  afficherEntete(joueur);
  const deckProfil = await afficherDeck(discordId, estMoi);

  // Partie privée : seulement sur mon propre profil
  if (estMoi) {
    $('duelliste').hidden = false;
    $('bourse').hidden = false;
    const objets = await chargerObjetsPossedes(discordId);
    await Promise.all([
      afficherDuel(deckProfil, objets, discordId),
      afficherDuelliste(objets),
      afficherSolde(discordId),
    ]);
  }

  $('chargement').hidden = true;
  $('profil').hidden = false;
}


function afficherEntete(j) {
  document.title = `${j.username ?? 'Joueur'} — Nocthémar`;
  $('pseudo').textContent = j.username ?? 'Joueur inconnu';
  $('titre').textContent = j.title?.payload?.text ?? '';

  if (j.avatar_url) $('avatar').src = j.avatar_url;
  else $('avatar').hidden = true;

  if (j.banner?.payload?.image) {
    $('banniere').style.backgroundImage = `url("${new URL(j.banner.payload.image, RACINE_IMAGES)}")`;
    // Proportions de l'image (payload.ratio, ex : "2172 / 724") : le cadre prend la forme de
    // l'image pour qu'elle s'affiche en entier. Fixé avant l'affichage, donc sans décalage (CLS).
    const ratio = j.banner.payload.ratio;
    if (/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(ratio ?? '')) {
      $('banniere').parentElement.style.aspectRatio = ratio;
    }
  }
  const accent = couleur(j.theme?.payload?.accent);
  if (accent) {
    document.documentElement.style.setProperty('--accent', accent);
    // Thème à une seule couleur : accent2 reprend accent
    document.documentElement.style.setProperty('--accent2', couleur(j.theme.payload.accent2) ?? accent);
    // Couleurs du thème reprises dans toute la page (CSS/profil.css : --vif, --vif2)
    document.body.style.setProperty('--vif', accent);
    document.body.style.setProperty('--vif2', couleur(j.theme.payload.accent2) ?? accent);
  }
}


// Le duelliste : cartes possédées et objets de pouvoir du Duel des Couronnes.
// Les 7 objets sont toujours affichés : ceux qu'on possède en couleur, les autres grisés.
function afficherDuelliste(objets) {
  const possedes = new Set(objets.map((o) => o.id));

  const zone = $('objets-pouvoir');
  let choisi = null;   // objet dont l'effet est affiché (un clic l'ouvre, un 2e le ferme)
  const rendre = () => {
    const o = OBJETS.find((x) => x.id === choisi);
    zone.innerHTML = `
      <dt>Objets de pouvoir <span class="duelliste__compte">${possedes.size} / ${OBJETS.length}</span></dt>
      <dd><ul class="stat__liste stat__liste--images">${OBJETS.map((x) => `
        <li>
          <button type="button" class="objet-image${x.id === choisi ? ' objet-image--choisi' : ''}${possedes.has(x.id) ? '' : ' objet-image--manque'}"
                  data-objet="${x.id}" title="${esc(x.n)}${possedes.has(x.id) ? '' : ' (pas encore possédé)'}" aria-pressed="${x.id === choisi}">
            <img src="${esc(new URL(x.image, SITE_ROOT))}" alt="${esc(x.n)}" loading="lazy">
          </button>
        </li>`).join('')}</ul></dd>
      ${o ? `
        <div class="objet-fiche">
          <strong class="objet-fiche__nom">${esc(o.n)}</strong>
          <dl class="objet-fiche__carac"><div><dt>Coût</dt><dd>${o.c} énergie</dd></div><div><dt>Statut</dt><dd>${possedes.has(o.id) ? 'Dans ta besace' : 'Pas encore possédé'}</dd></div></dl>
          <p class="objet-fiche__desc">${esc(o.d)}</p>
        </div>` : ''}`;
  };
  zone.onclick = (e) => {
    const b = e.target.closest('[data-objet]');
    if (!b) return;
    choisi = b.dataset.objet === choisi ? null : b.dataset.objet;
    rendre();
  };
  rendre();
}


// Deck de cartes : lecture seule pour les visiteurs ; sur mon profil,
// je peux le renommer, retirer des cartes et les réorganiser en les glissant.
async function afficherDeck(discordId, estMoi) {
  const { nom, ids, cartes } = await chargerDeck(discordId);
  const deck = new Deck($('deck'), { nom, ids, cartes, editable: estMoi, lienAjout: 'collection.html#grimoire' });

  if (!estMoi) return { nom, ids, cartes };
  $('lien-collection').hidden = false;
  activerGlisser($('deck'), {
    poignee: '.deck-emplacement .carte-jeu',
    cible: '.deck-emplacement',
    deposer: (carte, cible) => deck.placer(Number(carte.dataset.carte), Number(cible.dataset.position)),
  });
  return { nom, ids, cartes };
}


// Encart du Duel des Couronnes : le Grimoire (20 cartes) choisi dans le jeu
// (« Choisir mes cartes », retenu dans ce navigateur par JS/jeu-cartes.js), et le nombre
// de cartes et d'objets de pouvoir possédés. Ce qui manque au Grimoire est complété par
// des cartes de base au début de chaque partie.
const CLE_GRIMOIRE = 'duel-couronnes-grimoire';

function grimoireChoisi() {
  try {
    const cles = JSON.parse(localStorage.getItem(CLE_GRIMOIRE) ?? 'null');
    return Array.isArray(cles) ? cles.slice(0, TAILLE_DECK) : null;
  } catch {
    return null;   // stockage indisponible
  }
}

async function afficherDuel(deckProfil, objets, discordId) {
  const [{ count: nbCartes }, { count: nbCatalogue }] = await Promise.all([
    supabase.from('player_cards').select('card_id', { count: 'exact', head: true }).eq('discord_id', discordId),
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('is_available', true),
  ]);

  // Accroche : de quoi est fait le Grimoire
  const cles = grimoireChoisi();
  const choisies = cles ? cles.length : null;
  const nbObjets = cles ? cles.filter((k) => k.startsWith('o-')).length : 0;
  $('duel-accroche').innerHTML = choisies == null
    ? `Ton Grimoire de ${TAILLE_DECK} cartes se construit avec ta collection. Choisis tes cartes dans le jeu et affronte l'Ombre du Codex : chaque coup se joue au d20.`
    : `Ton Grimoire est prêt : ${choisies} carte${choisies > 1 ? 's' : ''} choisie${choisies > 1 ? 's' : ''}${nbObjets ? `, dont ${nbObjets} objet${nbObjets > 1 ? 's' : ''} de pouvoir` : ''}${choisies < TAILLE_DECK ? `, complété par ${TAILLE_DECK - choisies} cartes de base` : ''}. Pose tes unités, sers-toi de tes objets, et que chaque coup se joue au d20.`;

  $('duel-stats').innerHTML = [
    ['Grimoire', `${TAILLE_DECK} cartes`],
    ['Cartes', `${nbCartes ?? 0}${nbCatalogue ? ` / ${nbCatalogue}` : ''}`],
    ['Objets', `${objets.length} / ${OBJETS.length}`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  // Éventail : les 3 premières cartes du deck du profil (dos de carte pour les places vides)
  const main = deckProfil.ids.filter((id) => id != null).map((id) => deckProfil.cartes.get(id)).filter(Boolean).slice(0, 3);
  $('duel-eventail').innerHTML = [0, 1, 2]
    .map((i) => main[i] ? htmlCarte(main[i]) : '<div class="carte-jeu carte-jeu--sans-image"></div>')
    .join('');
  $('duel').hidden = false;
}


// Objets de pouvoir possédés (table inventory), un exemplaire de chacun
async function chargerObjetsPossedes(discordId) {
  const { data } = await supabase.from('inventory').select('item:items(name)').eq('discord_id', discordId);
  const objets = (data ?? []).map(({ item }) => item && objetDepuisNom(item.name)).filter(Boolean);
  return [...new Map(objets.map((o) => [o.id, o])).values()];
}


async function afficherSolde(discordId) {
  const { data } = await supabase
    .from('wallets')
    .select('balance')
    .eq('discord_id', discordId)
    .maybeSingle();

  const solde = data?.balance ?? 0;
  $('solde').textContent = solde.toLocaleString('fr-FR');
  afficherOrBourse(solde);
}


// Image de la bourse selon le solde : une pièce qui tourne, puis des tas de plus en plus gros.
// Paliers : [solde minimum, image, nombre d'étincelles] ; le dernier palier atteint l'emporte
// (au-delà de 1500 : tas 4). Plus on est riche, plus l'or scintille (et plus son halo brille, cf. CSS).
const PALIERS_OR = [
  [0,    null,           1],   // pièce qui tourne (animation)
  [50,   'tas-1-petit',  2],
  [200,  'tas-2-moyen',  4],
  [500,  'tas-3-grand',  7],
  [1500, 'tas-4-enorme', 12],
];
const SANS_ETINCELLES_JUSQUA = 10;   // de 0 à 10 pièces : pas d'étincelles
const imageOr = (nom) => new URL(`img/OR/pieces/${nom}.png`, SITE_ROOT).href;

// Un tour complet : face -> profil, puis les mêmes images en miroir (le revers de la pièce)
const TOUR_PIECE = [
  ['piece-face', false], ['piece-rotation-1', false], ['piece-rotation-2', false], ['piece-rotation-3', false],
  ['piece-rotation-3', true], ['piece-rotation-2', true], ['piece-rotation-1', true], ['piece-face', true],
  ['piece-rotation-1', false], ['piece-rotation-2', false], ['piece-rotation-3', false],
  ['piece-rotation-3', true], ['piece-rotation-2', true], ['piece-rotation-1', true],
];
const DUREE_IMAGE_PIECE = 280;   // ms par image
let minuteurPiece;

function afficherOrBourse(solde) {
  const img = document.querySelector('#bourse .piece-icone');
  const palier = PALIERS_OR.findLast(([min]) => solde >= min) ?? PALIERS_OR[0];   // solde négatif : pièce
  const [, tas, nbEtincelles] = palier;
  clearInterval(minuteurPiece);
  img.style.transform = '';

  // Bourse vide : une pièce couchée au sol, en noir et blanc
  const vide = solde <= 0;
  img.classList.toggle('piece-icone--vide', vide);

  // Richesse (0 = vide ... 5 = tas 4) : règle le halo doré en CSS, et les étincelles
  $('bourse').dataset.richesse = vide ? 0 : PALIERS_OR.indexOf(palier) + 1;
  afficherEtincelles(img, solde <= SANS_ETINCELLES_JUSQUA ? 0 : nbEtincelles);
  if (vide) {
    img.src = imageOr('piece-couchee-1');
    return;
  }

  if (tas) {
    img.src = imageOr(tas);
    return;
  }

  img.src = imageOr('piece-face');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Précharge les images du tour pour que l'animation ne clignote pas
  for (const nom of new Set(TOUR_PIECE.map(([n]) => n))) new Image().src = imageOr(nom);
  let i = 0;
  minuteurPiece = setInterval(() => {
    i = (i + 1) % TOUR_PIECE.length;
    const [nom, miroir] = TOUR_PIECE[i];
    img.src = imageOr(nom);
    img.style.transform = miroir ? 'scaleX(-1)' : '';
  }, DUREE_IMAGE_PIECE);
}

// Étincelles posées au hasard sur l'or, chacune avec son propre rythme pour ne pas
// scintiller toutes en même temps. Elles occupent la même case que l'image (grid-row 2).
function afficherEtincelles(img, nombre) {
  let zone = img.parentElement.querySelector('.bourse-etincelles');
  if (!zone) {
    zone = document.createElement('span');
    zone.className = 'bourse-etincelles';
    zone.setAttribute('aria-hidden', 'true');
    img.after(zone);
  }
  zone.innerHTML = Array.from({ length: nombre }, () => {
    const x = 20 + Math.random() * 60;         // % de la largeur de l'or
    const y = 10 + Math.random() * 75;         // % de la hauteur
    const taille = 8 + Math.random() * 8;      // px
    const duree = 1.4 + Math.random() * 1.6;   // s
    const delai = -Math.random() * duree;      // déjà en cours au chargement
    return `<span class="etincelle" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--taille:${taille.toFixed(1)}px;animation-duration:${duree.toFixed(2)}s;animation-delay:${delai.toFixed(2)}s"></span>`;
  }).join('');
}


init();
