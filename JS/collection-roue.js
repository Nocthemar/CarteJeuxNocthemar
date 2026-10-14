// =====================================================================
//  Page collection — la roue des apparences
//  La roue s'ouvre en grand (collection.html, #vue-roue) depuis l'écran des deux choix.
//  Quatre catégories : plateaux du Duel, thèmes, titres, bannières (ce que le joueur possède).
//  Les objets de la catégorie sont posés tout autour de la roue ; on la fait tourner
//  (glisser, molette, flèches du clavier ou boutons ‹ ›) : celui qui arrive sous le repère du haut
//  s'affiche au centre, avec « Appliquer » (ou « Retirer » s'il est déjà équipé).
//  Équiper : equip_cosmetic / unequip_cosmetic (thèmes, titres, bannières, gérés par le bot),
//            equiper_plateau (plateaux, SQL/plateaux.sql ; null = plateau par défaut, l'arène de pierre).
// =====================================================================
import { supabase, SITE_ROOT } from './supabase.js';
import { $, esc, couleur, notifier } from './commun.js';
import { animationsReduites } from './preferences.js';

const CATEGORIES = [
  { kind: 'plateau', titre: 'Plateaux', vide: 'Aucun plateau', icone: '▣' },
  { kind: 'theme', titre: 'Thèmes', vide: 'Aucun thème', icone: '◐' },
  { kind: 'title', titre: 'Titres', vide: 'Aucun titre', icone: '❝' },
  { kind: 'banner', titre: 'Bannières', vide: 'Aucune bannière', icone: '⚑' },
];
const LIBELLE = { plateau: 'Plateau de duel', theme: 'Thème', title: 'Titre', banner: 'Bannière' };
const CHAMP = { banner: 'banner_item_id', title: 'title_item_id', theme: 'theme_item_id' };   // colonnes de players
// Les images des bannières restent sur le site Nocthémar (JS/lien-site.js), comme en boutique
const RACINE_IMAGES = window.NOCTHEMAR_SITE ? new URL(window.NOCTHEMAR_SITE) : SITE_ROOT;
const reduit = animationsReduites();
const CLE_CATEGORIE = 'collection-roue-categorie';

const roue = {
  moi: null,
  objets: { plateau: [], theme: [], title: [], banner: [] },
  categorie: 'plateau',
  angle: 0,        // rotation du disque, en degrés (cumulée : la roue peut faire plusieurs tours)
  occupe: false,
};

// « Bannière « Les Veines » » -> « Les Veines »
const nomCourt = (nom) => String(nom ?? '').replace(/^(bannière|thème|titre)\s*«\s*(.+?)\s*»$/i, '$2');

// ---------------------------------------------------------------------
//  Chargement de ce que le joueur possède
// ---------------------------------------------------------------------
export async function initRoue(moi) {
  roue.moi = moi;
  const [{ data: inventaire }, { data: plateaux }] = await Promise.all([
    supabase.from('inventory').select('item:items(*)').eq('discord_id', moi.discord_id),
    // Plateaux achetés en boutique (table absente : aucun, seulement le plateau par défaut)
    supabase.from('joueur_plateaux').select('equipe, plateau:plateaux(id, nom, image, miniature, ordre)').eq('discord_id', moi.discord_id),
  ]);

  for (const { item } of inventaire ?? []) {
    if (!item || !CHAMP[item.kind]) continue;
    if (roue.objets[item.kind].some((o) => o.id === item.id)) continue;
    roue.objets[item.kind].push({ kind: item.kind, id: item.id, nom: nomCourt(item.name), payload: item.payload ?? {} });
  }
  const achetes = (plateaux ?? []).filter((l) => l.plateau).sort((a, b) => a.plateau.ordre - b.plateau.ordre);
  roue.plateauChoisi = achetes.find((l) => l.equipe)?.plateau.id ?? null;
  roue.objets.plateau = [
    { kind: 'plateau', id: null, nom: 'Plateau par défaut', defaut: true, image: 'img/Plateaux de carte/plateau-defaut-mini.webp' },
    ...achetes.map(({ plateau: p }) => ({ kind: 'plateau', id: p.id, nom: p.nom, image: p.miniature ?? p.image })),
  ];

  let cat = null;
  try { cat = localStorage.getItem(CLE_CATEGORIE); } catch { /* stockage indisponible */ }
  afficherCategories();
  choisirCategorie(CATEGORIES.some((c) => c.kind === cat) ? cat : 'plateau');
  brancherCommandes();
  // Nombre d'objets possédés (affiché sur la roue fermée)
  return Object.values(roue.objets).reduce((t, l) => t + l.length, 0);
}

const estEquipe = (o) => (o.kind === 'plateau'
  ? (o.id ?? null) === roue.plateauChoisi
  : roue.moi[CHAMP[o.kind]] === o.id);

// ---------------------------------------------------------------------
//  Rendu
// ---------------------------------------------------------------------
function afficherCategories() {
  // Une barre de bronze en quatre cases ; un curseur d'or glisse sous la case choisie (--i, posé par choisirCategorie)
  $('roue-categories').style.setProperty('--n', CATEGORIES.length);
  $('roue-categories').innerHTML = '<span class="roue-categories__curseur" aria-hidden="true"></span>'
    + CATEGORIES.map((c) => `
    <button type="button" class="roue-categorie" role="tab" data-categorie="${c.kind}" aria-selected="false"
      aria-label="${c.titre} (${roue.objets[c.kind].length})">
      <span class="roue-categorie__icone" aria-hidden="true">${c.icone}</span>
      <span class="roue-categorie__nom" aria-hidden="true">${c.titre}</span>
      <span class="roue-categorie__nb" aria-hidden="true">${roue.objets[c.kind].length}</span>
    </button>`).join('');
}

// Petit aperçu d'un objet (sur la roue et, en grand, au centre)
function apercu(o) {
  if (o.kind === 'plateau') {
    return `<img class="apercu-roue apercu-roue--plateau" src="${esc(o.image)}" alt="" draggable="false">`;
  }
  if (o.kind === 'banner') {
    return o.payload.image
      ? `<img class="apercu-roue apercu-roue--banniere" src="${esc(new URL(o.payload.image, RACINE_IMAGES))}" alt="" draggable="false">`
      : '<span class="apercu-roue apercu-roue--vide">✦</span>';
  }
  if (o.kind === 'theme') {
    const c1 = couleur(o.payload.accent) ?? '#c9a24a';
    const c2 = couleur(o.payload.accent2) ?? c1;
    return `<span class="apercu-roue apercu-roue--theme" style="--c1:${c1};--c2:${c2}"></span>`;
  }
  return `<span class="apercu-roue apercu-roue--titre">«&#8239;${esc(o.payload.text ?? o.nom)}&#8239;»</span>`;
}

const objetsCourants = () => roue.objets[roue.categorie];
const pas = () => 360 / Math.max(1, objetsCourants().length);
const mod = (n, m) => ((n % m) + m) % m;
const indexCourant = () => mod(Math.round(-roue.angle / pas()), Math.max(1, objetsCourants().length));

function choisirCategorie(kind) {
  roue.categorie = kind;
  try { localStorage.setItem(CLE_CATEGORIE, kind); } catch { /* stockage indisponible */ }
  document.querySelectorAll('.roue-categorie').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.categorie === kind)));
  $('roue-categories').style.setProperty('--i', CATEGORIES.findIndex((c) => c.kind === kind));

  const objets = objetsCourants();
  const disque = $('roue-disque');
  disque.style.setProperty('--n', objets.length);
  disque.innerHTML = objets.map((o, i) => `
    <button type="button" class="roue__objet${estEquipe(o) ? ' est-equipe' : ''}" data-i="${i}" style="--a:${(i * pas()).toFixed(3)}deg"
      tabindex="-1" aria-label="${esc(`${LIBELLE[o.kind]} : ${o.nom}`)}">
      <span class="roue__jeton">${apercu(o)}</span>
    </button>`).join('');

  // La roue s'ouvre sur l'objet équipé
  const equipe = Math.max(0, objets.findIndex(estEquipe));
  tourner(-equipe * pas(), false);
}

// Fait tourner le disque jusqu'à l'angle donné (animé ou non), puis met à jour le centre
function tourner(angle, anime = true) {
  const disque = $('roue-disque');
  disque.classList.toggle('sans-transition', !anime || reduit);
  roue.angle = angle;
  disque.style.setProperty('--angle', `${angle}deg`);
  majCentre();
}

// Tourne de k crans (k > 0 : vers la droite, l'objet suivant arrive sous le repère)
function cran(k) {
  if (!objetsCourants().length) return;
  const cible = Math.round(roue.angle / pas()) * pas() - k * pas();
  tourner(cible);
}

// Amène l'objet i sous le repère par le plus court chemin
function allerA(i) {
  const cible = -i * pas();
  let delta = mod(cible - roue.angle + 180, 360) - 180;
  tourner(roue.angle + delta);
}

function majCentre() {
  const objets = objetsCourants();
  const centre = $('roue-centre');
  const cat = CATEGORIES.find((c) => c.kind === roue.categorie);
  if (!objets.length) {
    centre.innerHTML = `
      <span class="roue__vide">${cat.vide} pour l'instant.</span>
      <a class="roue__lien" href="boutique.html">Voir la boutique</a>`;
    return;
  }
  const i = indexCourant();
  const o = objets[i];
  document.querySelectorAll('.roue__objet').forEach((b) => b.classList.toggle('est-face', Number(b.dataset.i) === i));
  const equipe = estEquipe(o);
  let action;
  if (equipe && (o.kind !== 'plateau' || o.id)) action = '<button type="button" class="roue__action roue__action--retirer" data-roue-action="retirer">Retirer</button>';
  else if (equipe) action = '<span class="roue__etat">Équipé</span>';
  else action = '<button type="button" class="roue__action" data-roue-action="appliquer">Appliquer</button>';
  centre.innerHTML = `
    <span class="roue__apercu">${apercu(o)}</span>
    <span class="roue__type">${LIBELLE[o.kind]}${objets.length > 1 ? ` · ${i + 1} / ${objets.length}` : ''}</span>
    <strong class="roue__nom">${esc(o.nom)}</strong>
    ${o.defaut ? '<small class="roue__note">Gratuit : l’arène de pierre</small>' : ''}
    ${equipe && (o.kind !== 'plateau' || o.id) ? '<small class="roue__note">Équipé</small>' : ''}
    ${action}`;
}

// ---------------------------------------------------------------------
//  Appliquer / retirer
// ---------------------------------------------------------------------
async function agir(action) {
  if (roue.occupe) return;
  const o = objetsCourants()[indexCourant()];
  if (!o) return;
  roue.occupe = true;
  const bouton = $('roue-centre').querySelector('[data-roue-action]');
  if (bouton) bouton.disabled = true;

  let error;
  if (o.kind === 'plateau') {
    const id = action === 'retirer' ? null : o.id;
    ({ error } = await supabase.rpc('equiper_plateau', { p_plateau_id: id }));
    if (!error) roue.plateauChoisi = id;
  } else if (action === 'retirer') {
    ({ error } = await supabase.rpc('unequip_cosmetic', { p_kind: o.kind }));
    if (!error) roue.moi[CHAMP[o.kind]] = null;
  } else {
    ({ error } = await supabase.rpc('equip_cosmetic', { p_item_id: o.id }));
    if (!error) roue.moi[CHAMP[o.kind]] = o.id;
  }
  roue.occupe = false;

  if (error) {
    notifier(error.message || 'Impossible pour l\'instant.', 'erreur');
    majCentre();
    return;
  }
  notifier(action === 'retirer'
    ? (o.kind === 'plateau' ? 'Retour au plateau par défaut.' : `${LIBELLE[o.kind]} retiré${o.kind === 'banner' ? 'e' : ''}.`)
    : `${o.nom} : appliqué !`);
  document.querySelectorAll('.roue__objet').forEach((b) => {
    b.classList.toggle('est-equipe', estEquipe(objetsCourants()[Number(b.dataset.i)]));
  });
  majCentre();
}

// ---------------------------------------------------------------------
//  Commandes : glisser, molette, clavier, boutons, clic sur un objet
// ---------------------------------------------------------------------
function brancherCommandes() {
  $('roue-categories').addEventListener('click', (e) => {
    const b = e.target.closest('[data-categorie]');
    if (b && b.dataset.categorie !== roue.categorie) choisirCategorie(b.dataset.categorie);
  });
  $('roue-prec').addEventListener('click', () => cran(-1));
  $('roue-suiv').addEventListener('click', () => cran(1));
  $('roue-centre').addEventListener('click', (e) => {
    const b = e.target.closest('[data-roue-action]');
    if (b && !b.disabled) agir(b.dataset.roueAction);
  });

  const el = $('roue');
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); cran(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); cran(-1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $('roue-centre').querySelector('[data-roue-action]')?.click();
    }
  });

  // Molette : un cran à la fois
  let derniereMolette = 0;
  el.addEventListener('wheel', (e) => {
    if (!objetsCourants().length) return;
    e.preventDefault();
    const maintenant = performance.now();
    if (maintenant - derniereMolette < 180) return;
    derniereMolette = maintenant;
    cran(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
  }, { passive: false });

  // Glisser : la roue suit le doigt / la souris autour de son centre, puis se cale sur le cran le plus proche
  let glisse = null;
  const angleDe = (e) => {
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.roue__centre') || !objetsCourants().length) return;
    glisse = { id: e.pointerId, dernier: angleDe(e), total: 0, cible: e.target.closest('.roue__objet') };
    el.setPointerCapture(e.pointerId);
    $('roue-disque').classList.add('sans-transition');
  });
  el.addEventListener('pointermove', (e) => {
    if (!glisse || e.pointerId !== glisse.id) return;
    const a = angleDe(e);
    const d = mod(a - glisse.dernier + 180, 360) - 180;
    glisse.dernier = a;
    glisse.total += Math.abs(d);
    roue.angle += d;
    $('roue-disque').style.setProperty('--angle', `${roue.angle}deg`);
    majCentre();
  });
  const finir = (e) => {
    if (!glisse || e.pointerId !== glisse.id) return;
    const { total, cible } = glisse;
    glisse = null;
    // Simple clic sur un objet : on l'amène sous le repère
    if (total < 4 && cible) allerA(Number(cible.dataset.i));
    else tourner(Math.round(roue.angle / pas()) * pas());
  };
  el.addEventListener('pointerup', finir);
  el.addEventListener('pointercancel', finir);
}
