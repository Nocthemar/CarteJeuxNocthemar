// =====================================================================
//  Duel des Couronnes — page jeu-cartes.html
//  - Solo      : contre l'IA « l'Ombre du Codex », avec les cartes du catalogue
//  - En ligne  : contre un ami, dans un salon (connexion Discord obligatoire),
//                chacun avec les cartes de son grimoire
//  - Histoire  : jeu-cartes.html?histoire=<niveau> lance un niveau du mode Histoire
//                (histoire.html, niveaux dans JS/histoire-data.js) : une partie contre l'IA
//                avec le deck, la difficulté et l'adversaire du niveau. Une victoire est
//                validée par le serveur (valider_niveau_histoire), qui donne les récompenses.
//  Le Grimoire : 20 cartes choisies dans la collection (2 exemplaires au plus, 4 objets au plus),
//  complété par des cartes de base (voir grimoire() dans le moteur).
//  Début de partie : renvoi de main (une fois), puis les tours.
//
//  En ligne, l'hôte (« joueur » pour le moteur) fait tourner les règles et les dés :
//  il envoie chaque événement avec l'état de la partie (sa main et sa pioche masquées).
//  L'invité (« adverse » pour le moteur) voit tout en miroir (miroir()) : ses troupes
//  en bas, et envoie ses actions à l'hôte.
//  Règles : JS/jeu-cartes-moteur.js — Affichage : JS/jeu-cartes-arene.js
//  Sons : JS/jeu-cartes-son.js — Salon : JS/jeu-cartes-ligne.js
// =====================================================================
import { supabase, getMonJoueur, connexionDiscord } from './supabase.js';
import { $, esc, notifier } from './commun.js';
import { chargerDeck, VEINES, RARETES } from './cartes.js';
import {
  PV_HEROS, TAILLE_DECK, JETS, DESTIN,
  uniteDepuisCarte, grimoire, construireDeck, melanger, OBJETS, OBJETS_MAX, COPIES_MAX, estObjet, objetDepuisNom, creerPartie, debutTour, finTour,
  renvoyerMain, renvoiFini, choixRenvoiIA, peutDefausser, defausser, peutMediter, mediter, placerSous, COUT_DEFAUSSE, COUT_MEDITER,
  peutJouer, jouer, ciblesSort, peutAttaquer, ciblesAttaque, attaquer, peutDestin, destin,
  trouver, ai, TROUPES, coutDe,
} from './jeu-cartes-moteur.js';
import { trouverNiveau } from './histoire-data.js';
import { rendre, animer, banniere, pause, htmlCarte, activerProfondeur, secouer, reduit } from './jeu-cartes-arene.js';
import { jouerSon, basculerMuet, estMuet, lireVolume, reglerVolume } from './jeu-cartes-son.js';
import { ouvrirSalon, nouveauCode, codeValide, TAILLE_SALON } from './jeu-cartes-ligne.js';

const NOM_ADVERSAIRE = "L'Ombre du Codex";

// Difficulté du duel contre l'Ombre (choisie dans le menu, retenue dans le navigateur).
// ia : le comportement de l'IA (ai(), JS/jeu-cartes-moteur.js) ; pv : les PV de l'Ombre.
// Le mode Histoire garde la difficulté de chaque niveau (JS/histoire-data.js).
const DIFFICULTES = {
  facile:    { pv: 16, texte: 'L’Ombre oublie parfois ses cartes et frappe au hasard. 16 PV.' },
  normal:    { pv: 20, texte: 'L’Ombre joue ses meilleures cartes et choisit ses cibles. 20 PV.' },
  difficile: { pv: 24, texte: 'L’Ombre tente plus souvent le Destin et a plus de vie. 24 PV.' },
};
const CLE_DIFFICULTE = 'duel-couronnes-difficulte';
let difficulte = 'normal';
try { const d = localStorage.getItem(CLE_DIFFICULTE); if (DIFFICULTES[d]) difficulte = d; } catch { /* stockage indisponible */ }

// Le plateau (CSS/jeu-cartes.css : classe plateau-… sur <body>) :
// - celui que le joueur a choisi, s'il en a acheté un en boutique (SQL/plateaux.sql, choisi dans la Collection) ;
// - sinon le plateau par défaut : l'arène de pierre (plateau-defaut).
// Pour tester un plateau : jeu-cartes.html?saison=hiver (printemps, ete, automne, cristaux)
const PLATEAUX = ['defaut', 'automne', 'ete', 'hiver', 'printemps', 'cristaux'];   // ceux que le CSS sait afficher
const saisonForcee = new URLSearchParams(location.search).get('saison');
function poserPlateau(id) {
  document.body.classList.remove(...PLATEAUX.map((x) => `plateau-${x}`));
  document.body.classList.add(`plateau-${id}`);
}
poserPlateau(PLATEAUX.includes(saisonForcee) ? saisonForcee : 'defaut');

// Le plateau choisi par le joueur (rien si la table n'existe pas encore : plateau par défaut)
async function chargerPlateauChoisi(discordId) {
  if (PLATEAUX.includes(saisonForcee)) return;
  const { data } = await supabase.from('joueur_plateaux').select('plateau_id')
    .eq('discord_id', discordId).eq('equipe', true).maybeSingle();
  if (PLATEAUX.includes(data?.plateau_id)) poserPlateau(data.plateau_id);
}
const CLE_SALON_EN_ATTENTE = 'duel-salon';   // salon à rejoindre après la connexion Discord

let mode = 'solo';          // onglet de l'accueil : 'solo' | 'ligne'
let role = null;            // pendant un duel en ligne : 'hote' | 'invite' (null en solo)
let moi = null;
let idsProfil = [];         // cartes du deck du profil
let objetsInventaire = [];  // objets possédés par le joueur (cartes de pouvoir)
let unitesCatalogue = [];   // toutes les unités du catalogue (l'Ombre et le mode Histoire)
let unitesGrimoire = null;  // unités de la collection du joueur (son Grimoire se construit avec)
let salon = null;
let histoire = null;        // niveau du mode Histoire en cours : { chapitre, niveau, index }, sinon null
let p = null;               // partie en cours (chez l'invité : copie en miroir reçue de l'hôte)
let occupe = false;         // une animation, le tour de l'IA, ou une action envoyée est en cours
let finAffichee = false;
let sel = { monTour: false, attaquant: null, sortIndex: null, cibles: null };
let ticketPass = null;      // Pass de saison : ticket du duel en cours (promesse d'un uuid), voir SQL/pass_saison.sql
let abandonParMoi = false;  // un abandon ne rapporte pas d'XP de pass

// Seulement les vraies cartes illustrées (pas la carte d'exemple)
const jouable = (c) => c?.image && c.description !== "Carte d'exemple";

// Toutes les actions locales et distantes passent par cette file, une à la fois
let file = Promise.resolve();
const enFile = (fn) => (file = file.then(fn).catch(console.error));


// ---------------------------------------------------------------------
//  Démarrage
// ---------------------------------------------------------------------
async function init() {
  remplirRegles();
  majBoutonSon();
  activerProfondeur();

  const [{ data, error }, joueur] = await Promise.all([
    supabase.from('cards').select('*').eq('is_available', true).order('id'),
    getMonJoueur().catch(() => null),
  ]);
  if (error) {
    $('accueil-deck').innerHTML = '<p class="vide">Impossible de charger les cartes.</p>';
    return;
  }
  moi = joueur;
  if (moi) chargerPlateauChoisi(moi.discord_id).catch(() => {});
  unitesCatalogue = (data ?? []).filter(jouable).map(uniteDepuisCarte);
  if (moi) {
    const [deck, inventaire] = await Promise.all([
      chargerDeck(moi.discord_id).catch(() => null),
      supabase.from('inventory').select('item:items(name, kind)').eq('discord_id', moi.discord_id),
    ]);
    idsProfil = (deck?.ids ?? []).filter((id) => id != null);
    objetsInventaire = objetsPossedes(inventaire?.data);
    // La collection (lisible seulement par son propriétaire, RLS de player_cards)
    const { data: lignes } = await supabase.from('player_cards').select('card:cards(*)').eq('discord_id', moi.discord_id);
    const vues = new Set();
    unitesGrimoire = (lignes ?? []).map((l) => l.card).filter((c) => jouable(c) && !vues.has(c.id) && vues.add(c.id)).map(uniteDepuisCarte);
  }

  // Mode Histoire : on lance directement le duel du niveau demandé
  const idHistoire = new URLSearchParams(location.search).get('histoire');
  if (idHistoire) return lancerHistoire(idHistoire);

  // Lien d'invitation (?salon=CODE), ou retour de la connexion Discord
  const code = (new URLSearchParams(location.search).get('salon') ?? sessionStorage.getItem(CLE_SALON_EN_ATTENTE) ?? '').toUpperCase();
  if (codeValide(code)) {
    await changerMode('ligne');
    if (moi) {
      sessionStorage.removeItem(CLE_SALON_EN_ATTENTE);
      entrerSalon(code, sessionStorage.getItem(`duel-hote-${code}`) ? 'hote' : 'invite');
    } else {
      sessionStorage.setItem(CLE_SALON_EN_ATTENTE, code);
    }
  } else {
    await changerMode(new URLSearchParams(location.search).get('mode') === 'ligne' ? 'ligne' : 'solo');
    // Lien « Choisir mes cartes » du profil : le panneau de choix s'ouvre tout de suite
    if (new URLSearchParams(location.search).get('deck') === 'choisir') {
      editionDeck = true;
      afficherDeck();
      $('accueil-deck').scrollIntoView({ block: 'start' });
    }
  }
}

// Objets possédés par le joueur (table inventory) qui existent comme cartes de pouvoir
function objetsPossedes(lignes) {
  return (lignes ?? []).map(({ item }) => item && objetDepuisNom(item.name)).filter(Boolean);
}

// ---------------------------------------------------------------------
//  Accueil : solo ou en ligne
// ---------------------------------------------------------------------
async function changerMode(nouveau) {
  mode = nouveau;
  editionDeck = false;
  document.querySelectorAll('.mode').forEach((b) => {
    const actif = b.dataset.mode === mode;
    b.classList.toggle('est-actif', actif);
    b.setAttribute('aria-selected', String(actif));
  });
  $('panneau-ligne').hidden = mode !== 'ligne';
  $('btn-jouer').hidden = mode !== 'solo';
  $('choix-difficulte').hidden = mode !== 'solo';

  afficherDeck();
  majPanneauLigne();
}

// ---------------------------------------------------------------------
//  Le Grimoire : 20 cartes choisies dans la collection du joueur (2 exemplaires au plus d'une
//  carte, 4 objets de pouvoir au plus), plus les troupes du Codex. Ce qui manque est complété
//  par les cartes de base (grimoire() dans le moteur). Choix retenu dans le navigateur.
//  Les 5 cartes favorites du profil restent une vitrine : elles ne sont pas le Grimoire.
// ---------------------------------------------------------------------
const CLE_CHOIX = 'duel-couronnes-grimoire';
const cleCarte = (c) => (c.carte ? `u${c.carte.id}` : c.id);
let choix = null;            // clés des cartes choisies, un élément par exemplaire
let editionDeck = false;     // panneau « Choisir mes cartes » ouvert
let grimoireJoueur = [];     // cartes choisies (sans le complément de base), pour la partie

// Cartes qu'on peut mettre dans son Grimoire : sa collection, les troupes du Codex, ses objets
function reserve() {
  const persos = unitesGrimoire ?? [];
  const objets = [...new Map(objetsInventaire.map((o) => [o.id, o])).values()];
  return { persos, troupes: TROUPES, objets, toutes: [...persos, ...TROUPES, ...objets] };
}

function lireChoix() {
  try { return JSON.parse(localStorage.getItem(CLE_CHOIX) ?? 'null'); } catch { return null; }
}
function garderChoix() {
  try { localStorage.setItem(CLE_CHOIX, JSON.stringify(choix)); } catch { /* stockage indisponible */ }
}

// Les cartes choisies, en respectant les limites (cartes disparues de la collection ignorées)
function cartesChoisies() {
  const { toutes } = reserve();
  const cartes = [];
  for (const cle of choix ?? []) {
    const c = toutes.find((x) => cleCarte(x) === cle);
    if (!c || cartes.length >= TAILLE_DECK) continue;
    if (cartes.filter((x) => x === c).length >= COPIES_MAX) continue;
    if (estObjet(c) && cartes.filter(estObjet).length >= OBJETS_MAX) continue;
    cartes.push(c);
  }
  return cartes;
}
const exemplaires = (cartes, c) => cartes.filter((x) => x === c).length;

// Grimoire proposé d'office : la collection (favorites du profil d'abord) en 2 exemplaires,
// puis les objets possédés, dans les limites
function choixParDefaut() {
  const { persos, objets } = reserve();
  const fav = idsProfil.map((id) => persos.find((u) => u.carte.id === id)).filter(Boolean);
  const ordre = [...fav, ...persos.filter((u) => !fav.includes(u))];
  return [...ordre.flatMap((u) => [u, u]), ...objets.flatMap((o) => [o, o])].map(cleCarte);
}

function afficherDeck() {
  if (!choix) {
    choix = lireChoix();
    if (!Array.isArray(choix)) choix = choixParDefaut();
  }
  const cartes = cartesChoisies();
  grimoireJoueur = cartes;
  const complet = grimoire(cartes);
  const nbObjets = cartes.filter(estObjet).length;
  const nbBase = complet.length - cartes.length;

  const parties = [`${cartes.length} choisie${cartes.length > 1 ? 's' : ''}`];
  if (nbObjets) parties.push(`dont ${nbObjets} objet${nbObjets > 1 ? 's' : ''}`);
  if (nbBase) parties.push(`+ ${nbBase} de base`);
  $('accueil-deck-titre').textContent = `Ton Grimoire (${complet.length} cartes) : ${parties.join(', ')}`;

  // L'éventail : 5 cartes différentes du Grimoire (les choisies d'abord)
  const vitrine = [...new Set(complet)].slice(0, 5);
  $('accueil-deck').innerHTML = vitrine.map((c) =>
    `<span class="deck-place">${htmlCarte(c)}${exemplaires(complet, c) > 1 ? `<span class="deck-place__nb">×${exemplaires(complet, c)}</span>` : ''}</span>`).join('')
    + `<button type="button" class="btn-dc deck-modifier${editionDeck ? ' btn-dc--ambre' : ''}" id="btn-choisir">${editionDeck ? 'Valider mon Grimoire' : 'Choisir mes cartes'}</button>`
    + (!moi ? '<p class="accueil__note">Connecte-toi avec Discord pour jouer avec ta collection : sans compte, ton Grimoire est fait de cartes de base.</p>'
      : !(unitesGrimoire ?? []).length ? '<p class="accueil__note">Ta collection est vide : ton Grimoire est complété avec des cartes de base. Les cartes s\'obtiennent à la <a href="boutique.html">boutique</a>.</p>' : '');
  $('accueil-deck').classList.toggle('est-en-edition', editionDeck);

  afficherChoix(cartes);
  $('btn-jouer').disabled = false;
  $('btn-pret').disabled = false;
  $('accueil-deck-titre').classList.remove('est-invalide');
  if (salon && !salon.presence.pret) salon.annoncer({ grimoire: idsGrimoire() });
}

// Panneau de choix : chaque clic ajoute un exemplaire (2 au plus), un clic de plus retire la carte
function afficherChoix(cartes) {
  const zone = $('choix-deck');
  zone.hidden = !editionDeck;
  if (!editionDeck) return;
  const { persos, troupes, objets } = reserve();
  const plein = cartes.length >= TAILLE_DECK;
  const objetsPleins = cartes.filter(estObjet).length >= OBJETS_MAX;
  const groupe = (titre, liste, bloque) => !liste.length ? '' : `
    <div class="choix-deck__groupe">
      <h3 class="choix-deck__titre">${titre} <span>${liste.length}</span></h3>
      <div class="choix-deck__cartes">${liste.map((c) => {
        const n = exemplaires(cartes, c);
        const bloquee = !n && (plein || bloque);
        return `<span class="deck-place${bloquee ? ' est-bloquee' : ''}" data-cle="${esc(cleCarte(c))}">${htmlCarte(c, { choisie: n > 0 })}${n ? `<span class="deck-place__nb">×${n}</span>` : ''}</span>`;
      }).join('')}</div>
    </div>`;
  zone.innerHTML = `
    <p class="choix-deck__aide">Un clic ajoute un exemplaire (${COPIES_MAX} au plus), un clic de plus retire la carte.
      ${TAILLE_DECK} cartes au plus, dont ${OBJETS_MAX} objets ; ce qui manque est complété par des cartes de base.
      <strong>${cartes.length} / ${TAILLE_DECK}</strong></p>
    ${groupe('Ta collection', persos, false)}
    ${moi && !persos.length ? '<p class="choix-deck__vide">Ta collection est vide pour l\'instant.</p>' : ''}
    ${groupe('Troupes du Codex', troupes, false)}
    ${groupe('Objets de pouvoir', objets, objetsPleins)}
    <p class="choix-deck__aide"><button type="button" class="btn-dc" id="btn-vider-grimoire">Tout retirer</button></p>`;
}

function basculerCarte(cle) {
  const { toutes } = reserve();
  const c = toutes.find((x) => cleCarte(x) === cle);
  if (!c) return;
  const actuelles = cartesChoisies();
  const n = exemplaires(actuelles, c);
  if (n >= COPIES_MAX) {
    choix = actuelles.filter((x) => x !== c).map(cleCarte);           // 2 exemplaires : on retire
  } else if (actuelles.length >= TAILLE_DECK) {
    return notifier(`Ton Grimoire est plein (${TAILLE_DECK} cartes) : retire d'abord une carte.`, 'erreur');
  } else if (estObjet(c) && actuelles.filter(estObjet).length >= OBJETS_MAX) {
    if (!n) return notifier(`${OBJETS_MAX} objets au plus dans le Grimoire.`, 'erreur');
    choix = actuelles.filter((x) => x !== c).map(cleCarte);
  } else {
    choix = [...actuelles.map(cleCarte), cle];
  }
  jouerSon('clic');
  garderChoix();
  afficherDeck();
}

$('accueil-deck').addEventListener('click', (e) => {
  if (e.target.closest('#btn-choisir')) {
    if (salon?.presence.pret) return notifier('Tu es prêt : clique « Je ne suis plus prêt » pour changer ton Grimoire.', 'erreur');
    editionDeck = !editionDeck;
    afficherDeck();
    if (editionDeck) $('choix-deck').scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'nearest' });
  }
});
$('choix-deck').addEventListener('click', (e) => {
  if (e.target.closest('#btn-vider-grimoire')) {
    choix = [];
    garderChoix();
    afficherDeck();
    return;
  }
  const place = e.target.closest('.deck-place[data-cle]');
  if (place) basculerCarte(place.dataset.cle);
});

// Ce que l'adversaire reçoit en ligne : les clés des cartes choisies (l'hôte refait les limites)
const idsGrimoire = () => grimoireJoueur.map(cleCarte);

// Grimoire d'un joueur à partir de clés (en ligne) : cartes du catalogue relues par l'hôte,
// troupes du Codex et objets connus seulement
async function grimoireDepuisCles(cles) {
  const liste = (Array.isArray(cles) ? cles : []).slice(0, TAILLE_DECK).map(String);
  const ids = [...new Set(liste.filter((k) => /^u\d+$/.test(k)).map((k) => Number(k.slice(1))))];
  const { data } = ids.length ? await supabase.from('cards').select('*').in('id', ids) : { data: [] };
  const unites = new Map((data ?? []).filter(jouable).map((c) => [`u${c.id}`, uniteDepuisCarte(c)]));
  return liste.map((k) => unites.get(k) ?? TROUPES.find((t) => t.id === k) ?? OBJETS.find((o) => o.id === k)).filter(Boolean);
}

document.querySelector('.modes').addEventListener('click', (e) => {
  const b = e.target.closest('.mode');
  if (!b || !b.dataset.mode || b.dataset.mode === mode) return;   // « Histoire » est un simple lien
  if (salon) return notifier('Quitte d\'abord le salon pour jouer en solo.', 'erreur');
  changerMode(b.dataset.mode);
});


// ---------------------------------------------------------------------
//  Mode Histoire : un niveau = une partie contre l'IA avec une configuration précise
// ---------------------------------------------------------------------
const CLE_RESULTAT_HISTOIRE = 'histoire-resultat';   // lu par JS/histoire.js au retour sur la carte

async function lancerHistoire(id) {
  const trouve = trouverNiveau(id);
  // Niveau inconnu, ou joueur non connecté (la progression est liée au compte) : retour à la carte
  if (!trouve || !moi) { location.replace('histoire.html'); return; }
  histoire = trouve;
  await changerMode('solo');   // ton deck de duel, celui choisi dans le menu
  nouvellePartieSolo();
}

// Deck adverse d'un niveau : noms de cartes du catalogue, de troupes du Codex ou d'objets
const cleNom = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'").trim().toLowerCase();
function deckHistoire(noms) {
  const unites = [];
  const objets = [];
  for (const nom of noms ?? []) {
    const k = cleNom(nom);
    const u = unitesCatalogue.find((x) => cleNom(x.n) === k) ?? TROUPES.find((x) => cleNom(x.n) === k);
    if (u) { unites.push(u); continue; }
    const o = objetDepuisNom(nom);
    if (o) objets.push(o);
  }
  // Chaque carte du niveau en 2 exemplaires, le reste en cartes de base
  return construireDeck([...unites, ...objets].flatMap((c) => [c, c]));
}

// Fin d'un niveau : la victoire est validée par le serveur (première victoire = récompenses),
// et le résultat est gardé pour le message affiché sur la carte
async function finHistoire(gagne) {
  const resultat = { niveau: histoire.niveau.id, gagne, recompenses: null, erreur: null };
  if (gagne) {
    const { data, error } = await supabase.rpc('valider_niveau_histoire', { p_niveau_id: histoire.niveau.id });
    // Fonction absente : le SQL du mode Histoire n'a pas encore été lancé dans Supabase
    if (error) resultat.erreur = /schema cache|PGRST20[25]/.test(`${error.code} ${error.message}`)
      ? 'le mode Histoire n’est pas encore installé dans Supabase (SQL/mode_histoire.sql).'
      : error.message;
    else resultat.recompenses = data;
  }
  try { sessionStorage.setItem(CLE_RESULTAT_HISTOIRE, JSON.stringify(resultat)); } catch { /* stockage indisponible */ }
  return resultat;
}

function texteRecompense({ gagne, recompenses: r, erreur }) {
  if (!gagne) return 'Retourne sur la carte et retente ta chance.';
  if (erreur) return `Victoire non enregistrée : ${erreur}`;
  if (!r || r.deja) return 'Niveau déjà terminé : pas de nouvelle récompense.';
  const gains = [];
  if (r.or) gains.push(`+${r.or} pièces`);
  if (r.carte) gains.push(`la carte « ${r.carte} »`);   // l'XP de pass s'affiche à part (afficherXpPass)
  return gains.length ? `Récompenses : ${gains.join(', ')}.` : '';
}


// ---------------------------------------------------------------------
//  Partie : déroulé commun (solo et hôte)
// ---------------------------------------------------------------------
const avatars = () => ({ joueur: moi?.avatar_url ?? null, adverse: role ? salon?.adversaire?.avatar ?? null : null });
const afficher = () => rendre(p, sel, avatars());
const nomAdverse = () => p.camps.adverse.nom;

function montrerPlateau() {
  finAffichee = false;
  abandonParMoi = false;
  ticketPass = demanderTicketPass();
  sel = { monTour: false, attaquant: null, sortIndex: null, cibles: null };
  $('fin').hidden = true;
  $('ecran-accueil').hidden = true;
  $('ecran-duel').hidden = false;
  document.body.classList.add('en-duel');   // le duel prend tout l'écran (CSS/jeu-cartes.css)
  scrollTo(0, 0);
  afficher();
}

function nouvellePartieSolo() {
  role = null;
  const niv = histoire?.niveau;
  // L'Ombre : des cartes du catalogue en 2 exemplaires et 2 objets au hasard
  const deckAdverse = niv
    ? deckHistoire(niv.deck)
    : construireDeck([...melanger(unitesCatalogue).flatMap((u) => [u, u]), ...melanger(OBJETS).slice(0, 2).flatMap((o) => [o, o])]);
  const premier = Math.random() < 0.5 ? 'joueur' : 'adverse';
  p = creerPartie(construireDeck(grimoireJoueur), deckAdverse, moi?.username ?? 'Toi',
    niv ? niv.adversaire : NOM_ADVERSAIRE, premier,
    niv ? { pvAdverse: niv.pv, energieBonusAdverse: niv.energieBonus } : { pvAdverse: DIFFICULTES[difficulte].pv });
  renvoyerMain(p, 'adverse', choixRenvoiIA(p.camps.adverse));   // l'IA renvoie ses cartes trop chères
  montrerPlateau();
  ouvrirRenvoi();
}

// ---------------------------------------------------------------------
//  Renvoi de main (une fois, avant le premier tour)
// ---------------------------------------------------------------------
let renvoiChoisis = new Set();
function ouvrirRenvoi() {
  if (!p || p.renvoi?.joueur) return;
  renvoiChoisis = new Set();
  majRenvoi();
  $('renvoi-attente').hidden = true;
  $('btn-renvoi').disabled = false;
  if (!$('renvoi').open) $('renvoi').showModal();
}
function majRenvoi() {
  $('renvoi-main').innerHTML = p.camps.joueur.main.map((c, i) =>
    htmlCarte(c, { index: i, choisie: renvoiChoisis.has(i) })).join('');
  const n = renvoiChoisis.size;
  $('btn-renvoi').textContent = n ? `Renvoyer ${n} carte${n > 1 ? 's' : ''}` : 'Garder ma main';
  $('renvoi-texte').textContent = p.actif === 'joueur'
    ? 'Tu commences : 3 cartes. Touche celles que tu veux renvoyer dans ton Grimoire, tu en repiocheras autant.'
    : 'Ton adversaire commence : tu as 4 cartes. Touche celles que tu veux renvoyer dans ton Grimoire, tu en repiocheras autant.';
}
$('renvoi-main').addEventListener('click', (e) => {
  const b = e.target.closest('.dc-carte[data-index]');
  if (!b || $('btn-renvoi').disabled) return;
  const i = Number(b.dataset.index);
  renvoiChoisis.has(i) ? renvoiChoisis.delete(i) : renvoiChoisis.add(i);
  jouerSon('clic');
  majRenvoi();
});
$('renvoi').addEventListener('cancel', (e) => e.preventDefault());   // on doit choisir
$('btn-renvoi').addEventListener('click', () => {
  const indices = [...renvoiChoisis];
  $('btn-renvoi').disabled = true;
  if (role === 'invite') {
    // L'hôte applique le renvoi ; on attend la suite
    $('renvoi-attente').hidden = false;
    invite.renvoi = { pid: invite.pid, id: crypto.randomUUID(), n: invite.dernier, a: { type: 'renvoi', indices } };
    salon?.envoyer('choix', invite.renvoi);
    return;
  }
  enFile(async () => {
    const ev = renvoyerMain(p, 'joueur', indices);
    if (!ev) return;
    diffuser(ev);
    if (ev.n) jouerSon('pioche');
    if (renvoiFini(p)) {
      $('renvoi').close();
      afficher();
      await commencerTour();
    } else {
      $('renvoi-attente').hidden = false;   // en ligne : on attend l'invité
      afficher();
    }
  });
});

// Début de tour (solo / hôte) : le moteur, puis l'affichage
async function commencerTour() {
  const ev = debutTour(p);
  diffuser(ev);
  await afficherTour(ev);
  if (p.fini) return terminer();
  if (p.actif === 'adverse' && !role) await tourIA();
}

// Affichage d'un début de tour (commun aux trois rôles)
async function afficherTour(ev) {
  occupe = true;
  const monTour = p.actif === 'joueur';
  if (monTour && ev.pioche.piochees.length) jouerSon('pioche');
  sel = { monTour: false, attaquant: null, sortIndex: null, cibles: null };
  afficher();
  await banniere(monTour ? 'À toi de jouer' : `Tour de ${nomAdverse()}`, `Tour ${p.tour}`, monTour ? 'banniere--moi' : '');
  if (ev.pioche.brulees.length) await banniere('Main pleine', `${ev.pioche.brulees[0].n} est brûlée et part au Tombeau.`, 'banniere--malediction');
  if (ev.fatigue) {
    afficher();
    await banniere('Épuisement', `Grimoire vide : ${monTour ? 'ton héros' : nomAdverse()} perd ${ev.fatigue} PV.`, 'banniere--malediction');
  }
  deverrouiller();
}

function deverrouiller() {
  occupe = false;
  sel = { monTour: p.actif === 'joueur' && !p.fini, attaquant: null, sortIndex: null, cibles: null };
  majConsigne();
  afficher();
  if (sel.monTour && p.camps.joueur.meditation?.length) ouvrirMeditation();
}

// ---------------------------------------------------------------------
//  Méditer : les 3 premières cartes du Grimoire, on peut en placer une dessous
// ---------------------------------------------------------------------
function ouvrirMeditation() {
  const cartes = p.camps.joueur.meditation ?? [];
  $('meditation-cartes').innerHTML = cartes.map((c, i) =>
    `<span class="meditation__carte">${htmlCarte(c, { index: i })}<small>${i + 1}${i === 0 ? ' · la prochaine' : ''}</small></span>`).join('');
  if (!$('meditation').open) $('meditation').showModal();
}
$('meditation').addEventListener('cancel', (e) => e.preventDefault());
$('meditation-cartes').addEventListener('click', (e) => {
  const b = e.target.closest('.dc-carte[data-index]');
  if (!b) return;
  $('meditation').close();
  agir({ type: 'placer', index: Number(b.dataset.index) });
});
$('btn-meditation-garder').addEventListener('click', () => {
  $('meditation').close();
  agir({ type: 'placer', index: null });
});

async function tourIA() {
  for (let i = 0; i < 30 && !p.fini; i++) {
    await pause(650);
    const a = ai(p, 'adverse', histoire?.niveau.difficulte ?? difficulte);
    if (!a) break;
    await appliquer('adverse', a);
  }
  if (p.fini) return terminer();
  await pause(400);
  finTour(p);
  await commencerTour();
}

// Applique une action au moteur (solo / hôte), l'envoie à l'invité, puis l'anime
async function appliquer(qui, a) {
  let ev = null;
  if (a.type === 'jouer') ev = jouer(p, qui, a.index, a.cible ?? null);
  else if (a.type === 'attaque') ev = attaquer(p, qui, a.uid, a.cible);
  else if (a.type === 'destin') ev = destin(p, qui);
  else if (a.type === 'defausser') ev = defausser(p, qui, a.index);
  else if (a.type === 'mediter') ev = mediter(p, qui);
  else if (a.type === 'placer') ev = placerSous(p, qui, a.index ?? null);
  if (!ev) return false;
  diffuser(ev);
  await executer(ev);
  return true;
}

// Anime un événement du moteur, puis redessine le plateau
async function executer(ev) {
  await animer(ev);
  afficher();
  if (ev.type === 'pose') await animer({ ...ev, type: 'apres-pose' });
  if (ev.type === 'destin' && ev.uid) await animer({ type: 'apres-pose', uid: ev.uid, carte: { n: 'Milicien de la Couronne' } });
}

async function terminer(raison = '') {
  if (finAffichee) return;
  finAffichee = true;
  for (const d of ['renvoi', 'meditation']) if ($(d).open) $(d).close();
  occupe = true;
  sel = { monTour: false, attaquant: null, sortIndex: null, cibles: null };
  afficher();
  await pause(600);
  const gagne = p.fini === 'joueur';
  const resultat = histoire ? await finHistoire(gagne) : null;
  jouerSon(gagne ? 'fanfare' : 'tonnerre');
  const s = p.camps.joueur.stats;
  $('fin-sur').textContent = gagne ? 'La couronne est à toi' : `${nomAdverse()} l'emporte`;
  $('fin-titre').textContent = gagne ? 'Victoire' : 'Défaite';
  $('fin-titre').className = `fin__titre ${gagne ? 'fin__titre--victoire' : 'fin__titre--defaite'}`;
  $('fin-texte').textContent = raison || (gagne
    ? `Le héros adverse est tombé au tour ${p.tour}.`
    : `Ton héros est tombé au tour ${p.tour}. Le destin n'était pas de ton côté.`);
  $('fin-stats').innerHTML = [
    ['Jets de d20', s.jets], ['Critiques', s.critiques], ['Échecs critiques', s.echecs],
    ['Cartes jouées', s.cartes], ['Dégâts infligés', s.degats], ['Jets du Destin', s.destins],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  if (resultat) $('fin-texte').textContent += ' ' + texteRecompense(resultat);
  afficherXpPass(gagne, resultat);
  $('btn-rejouer').textContent = role ? 'Revanche' : histoire ? (gagne ? 'Rejouer le niveau' : 'Réessayer') : 'Rejouer';
  $('btn-menu-fin').textContent = histoire ? 'Retour à la carte' : 'Retour au menu';
  $('btn-menu-fin').hidden = !!role;
  $('btn-quitter-fin').hidden = !role;
  $('fin').hidden = false;
  $('btn-rejouer').focus();
}


// ---------------------------------------------------------------------
//  Pass de saison (pass.html, SQL/pass_saison.sql)
//  Duel contre l'IA ou un ami : un ticket est demandé au serveur au début du duel, puis échangé
//  contre l'XP à la fin (le serveur vérifie la durée, le plafond du jour, l'adversaire).
//  Mode Histoire : l'XP vient de valider_niveau_histoire (premières victoires seulement).
// ---------------------------------------------------------------------
function demanderTicketPass() {
  if (!moi || histoire) return null;
  const params = role ? { p_mode: 'ami', p_salon: salon?.code ?? null } : { p_mode: 'ia' };
  return supabase.rpc('pass_commencer_partie', params)
    .then(({ data, error }) => (error ? null : data))
    .catch(() => null);
}

const RAISONS_PASS = {
  plafond: 'Plafond d\'XP de pass du jour atteint',
  courte: 'Partie trop courte pour l\'XP de pass (2 minutes minimum)',
};

// Petit message « +X XP de pass » sur l'écran de fin (lien vers la page du pass)
async function afficherXpPass(gagne, resultat) {
  const el = $('fin-pass');
  el.hidden = true;
  let r = null;
  if (histoire) {
    if (resultat?.recompenses?.xp) r = { xp: resultat.recompenses.xp };
  } else if (ticketPass && !abandonParMoi) {
    const attente = ticketPass;
    ticketPass = null;   // un ticket ne sert qu'une fois
    const ticket = await attente;
    if (ticket) {
      const { data, error } = await supabase.rpc('pass_fin_partie', { p_ticket: ticket, p_victoire: gagne });
      if (!error) r = data;
    }
  }
  if (!r) return;
  if (r.xp > 0) {
    el.textContent = `+${r.xp} XP de pass${r.raison === 'plafond' ? ' (plafond du jour atteint)' : ''}`;
  } else if (RAISONS_PASS[r.raison]) {
    el.textContent = RAISONS_PASS[r.raison];
  } else return;
  el.classList.toggle('fin__pass--vide', !(r.xp > 0));
  el.hidden = false;
}


// ---------------------------------------------------------------------
//  Actions du joueur de cet écran
// ---------------------------------------------------------------------
function annuler() {
  sel = { ...sel, attaquant: null, sortIndex: null, cibles: null, defausse: false };
  majConsigne();
  afficher();
}

function majConsigne() {
  let t = '';
  if (p && !sel.monTour && !p.fini && role && p.actif === 'adverse') t = `${nomAdverse()} joue…`;
  else if (!sel.monTour) t = '';
  else if (sel.attaquant) t = 'Choisis la cible de ton attaque (Échap pour annuler).';
  else if (sel.sortIndex != null) t = 'Choisis la cible du sort (Échap pour annuler).';
  else if (sel.defausse) t = 'Choisis la carte à défausser (Échap pour annuler).';
  else t = 'Joue une carte, attaque avec une unité prête, ou finis ton tour. Clic droit : voir une carte.';
  $('consigne').textContent = t;
}

// Une action du joueur : appliquée ici (solo / hôte) ou envoyée à l'hôte (invité)
function agir(a) {
  if (occupe || !sel.monTour) return;
  occupe = true;
  sel = { monTour: false, attaquant: null, sortIndex: null, cibles: null };
  afficher();
  if (role === 'invite') return envoyerChoix(a);
  enFile(async () => {
    if (a.type === 'fin') {
      finTour(p);
      await commencerTour();
      return;
    }
    await appliquer('joueur', a);
    if (p.fini) return terminer();
    deverrouiller();
  });
}

// Carte de la main
$('main-joueur').addEventListener('click', (e) => {
  const b = e.target.closest('.dc-carte[data-index]');
  if (!b || occupe || !sel.monTour) return;
  const i = Number(b.dataset.index);
  if (sel.defausse) return agir({ type: 'defausser', index: i });
  if (!peutJouer(p, 'joueur', i)) { secouer(b); jouerSon('clic'); return; }
  const carte = p.camps.joueur.main[i];
  const cibles = carte.t === 's' ? ciblesSort(p, 'joueur', carte) : null;
  if (!cibles) return agir({ type: 'jouer', index: i });
  if (sel.sortIndex === i) return annuler();
  sel = { ...sel, attaquant: null, sortIndex: i, cibles };
  majConsigne();
  afficher();
});

// Unités et héros : choisir un attaquant, ou une cible
$('scene-table').addEventListener('click', (e) => {
  if (occupe || !sel.monTour) return;
  const unite = e.target.closest('.dc-unite');
  const heros = e.target.closest('.dc-heros');
  if (!unite && !heros) return;
  const cible = unite ? { camp: unite.dataset.camp, uid: Number(unite.dataset.uid) } : { camp: heros.dataset.heros, heros: true };

  // Une sélection attend sa cible
  if (sel.cibles?.some((c) => c.camp === cible.camp && (c.heros ? cible.heros : c.uid === cible.uid))) {
    if (sel.sortIndex != null) return agir({ type: 'jouer', index: sel.sortIndex, cible });
    if (sel.attaquant) return agir({ type: 'attaque', uid: sel.attaquant, cible });
  }
  // Une de mes unités prêtes : elle devient l'attaquant
  if (unite && cible.camp === 'joueur' && sel.sortIndex == null) {
    const u = trouver(p.camps.joueur, cible.uid);
    if (sel.attaquant === u.uid) return annuler();
    if (!peutAttaquer(u)) { secouer(unite); return; }
    sel = { ...sel, attaquant: u.uid, sortIndex: null, cibles: ciblesAttaque(p, 'joueur') };
    jouerSon('clic');
    majConsigne();
    afficher();
    return;
  }
  // Cible impossible (une Garde protège, par exemple)
  if (sel.cibles) { secouer(unite ?? heros); jouerSon('clic'); }
});

const finirTour = () => agir({ type: 'fin' });
function lancerDestin() {
  if (!p || !peutDestin(p, 'joueur')) return;
  agir({ type: 'destin' });
}

$('btn-fin').addEventListener('click', finirTour);
$('btn-destin').addEventListener('click', lancerDestin);
$('btn-defausser').addEventListener('click', () => {
  if (!p || occupe || !sel.monTour || !peutDefausser(p, 'joueur')) return;
  if (sel.defausse) return annuler();
  sel = { ...sel, attaquant: null, sortIndex: null, cibles: null, defausse: true };
  jouerSon('clic');
  majConsigne();
  afficher();
});
$('btn-mediter').addEventListener('click', () => {
  if (!p || occupe || !sel.monTour || !peutMediter(p, 'joueur')) return;
  agir({ type: 'mediter' });
});

// Glisser une carte de la main sur son Tombeau : la défausser
$('main-joueur').addEventListener('dragstart', (e) => {
  const b = e.target.closest('.dc-carte[data-index]');
  if (!b || !p || occupe || !sel.monTour || !peutDefausser(p, 'joueur')) { e.preventDefault(); return; }
  e.dataTransfer.setData('text/plain', b.dataset.index);
  e.dataTransfer.effectAllowed = 'move';
  $('tombeau-joueur').classList.add('est-cible');
});
$('main-joueur').addEventListener('dragend', () => $('tombeau-joueur').classList.remove('est-cible'));
$('tombeau-joueur').addEventListener('dragover', (e) => { if ($('tombeau-joueur').classList.contains('est-cible')) e.preventDefault(); });
$('tombeau-joueur').addEventListener('drop', (e) => {
  e.preventDefault();
  $('tombeau-joueur').classList.remove('est-cible');
  const i = Number(e.dataTransfer.getData('text/plain'));
  if (Number.isInteger(i)) agir({ type: 'defausser', index: i });
});

// Un clic sur un Tombeau : son contenu (visible des deux joueurs)
for (const qui of ['joueur', 'adverse']) {
  $(`tombeau-${qui}`).addEventListener('click', () => {
    if (!p) return;
    const camp = p.camps[qui];
    $('tombeau-titre').textContent = qui === 'joueur' ? 'Ton Tombeau' : `Tombeau de ${camp.nom}`;
    tombeauOuvert = qui;
    $('tombeau-cartes').innerHTML = camp.tombeau.length
      ? [...camp.tombeau].reverse().map((c, i) => htmlCarte(c, { index: i })).join('')
      : '<p class="vide">Aucune carte au Tombeau pour l\'instant.</p>';
    $('tombeau').showModal();
  });
}
for (const qui of ['joueur', 'adverse']) {
  $(`tombeau-${qui}`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $(`tombeau-${qui}`).click(); }
  });
}
$('tombeau-fermer').addEventListener('click', () => $('tombeau').close());
$('tombeau').addEventListener('click', (e) => { if (e.target === $('tombeau')) $('tombeau').close(); });
$('btn-jouer').addEventListener('click', nouvellePartieSolo);

// Choix de la difficulté (contre l'Ombre)
function choisirDifficulte(d) {
  difficulte = d;
  try { localStorage.setItem(CLE_DIFFICULTE, d); } catch { /* stockage indisponible */ }
  document.querySelectorAll('.difficulte__btn').forEach((b) => {
    const choisi = b.dataset.difficulte === d;
    b.setAttribute('aria-checked', String(choisi));
    b.tabIndex = choisi ? 0 : -1;
  });
  $('difficulte-texte').textContent = DIFFICULTES[d].texte;
}
choisirDifficulte(difficulte);
$('choix-difficulte').addEventListener('click', (e) => {
  const b = e.target.closest('[data-difficulte]');
  if (b) choisirDifficulte(b.dataset.difficulte);
});
// Flèches gauche / droite : comme un groupe de boutons radio
$('choix-difficulte').addEventListener('keydown', (e) => {
  const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!pas) return;
  e.preventDefault();
  const ids = Object.keys(DIFFICULTES);
  const d = ids[(ids.indexOf(difficulte) + pas + ids.length) % ids.length];
  choisirDifficulte(d);
  document.querySelector(`.difficulte__btn[data-difficulte="${d}"]`).focus();
});

$('btn-rejouer').addEventListener('click', () => {
  if (!role) return nouvellePartieSolo();
  revenirAuSalon();   // revanche : retour au salon, on se redéclare prêt
});
$('btn-quitter-fin').addEventListener('click', () => quitterSalon());
// Fin d'un duel en solo (victoire, défaite, abandon) : retour au menu du jeu
$('btn-menu-fin').addEventListener('click', () => {
  if (histoire) { location.href = `histoire.html?chapitre=${encodeURIComponent(histoire.chapitre.id)}`; return; }
  p = null;
  revenirAccueil();
  scrollTo(0, 0);
});
$('btn-abandon').addEventListener('click', () => {
  if (!p || p.fini || !confirm('Abandonner le duel ?')) return;
  abandonParMoi = true;
  if (role === 'invite') {
    salon?.envoyer('choix', { pid: invite.pid, id: crypto.randomUUID(), n: invite.dernier, a: { type: 'abandon' } });
    return;
  }
  enFile(async () => {
    p.fini = 'adverse';
    diffuser({ type: 'abandon', qui: 'joueur' });
    await terminer('Tu as abandonné le duel.');
  });
});

// Raccourcis : Espace pour finir le tour, D pour le Destin, Échap pour annuler
document.addEventListener('keydown', (e) => {
  if ($('ecran-duel').hidden || !$('fin').hidden || $('regles').open || $('renvoi').open || $('meditation').open || $('loupe').open) return;
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); finirTour(); }
  else if (e.key === 'd' || e.key === 'D') lancerDestin();
  else if (e.key === 'Escape' && (sel.attaquant || sel.sortIndex != null || sel.defausse)) annuler();
});


// ---------------------------------------------------------------------
//  En ligne : le salon
// ---------------------------------------------------------------------
function majPanneauLigne() {
  if (mode !== 'ligne') return;
  $('ligne-connexion').hidden = !!moi;
  $('ligne-accueil').hidden = !moi || !!salon;
  $('ligne-salon').hidden = !salon;
}

$('btn-connexion').addEventListener('click', () => connexionDiscord());

$('btn-creer').addEventListener('click', () => {
  const code = nouveauCode();
  sessionStorage.setItem(`duel-hote-${code}`, '1');
  entrerSalon(code, 'hote');
});

$('form-rejoindre').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('code-salon').value.trim().toUpperCase();
  if (!codeValide(code)) return notifier('Ce code n\'est pas valide : cinq lettres ou chiffres.', 'erreur');
  entrerSalon(code, sessionStorage.getItem(`duel-hote-${code}`) ? 'hote' : 'invite');
});
$('code-salon').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

function entrerSalon(code, r) {
  salon = ouvrirSalon(code, {
    discord_id: moi.discord_id,
    nom: moi.username ?? 'Aventurier',
    avatar: moi.avatar_url ?? null,
    role: r,
  }, {
    surPresence,
    surMessage,
    surErreur: (texte) => { $('salon-etat').textContent = texte; },
  });
  salon.role = r;
  salon.adversaire = null;
  salon.annoncer({ grimoire: idsGrimoire() });

  // Le lien de la page devient le lien d'invitation (?salon=CODE)
  history.replaceState(null, '', `${location.pathname}?salon=${code}`);
  $('salon-code').textContent = code;
  $('salon-etat').textContent = 'Connexion au salon…';
  majPanneauLigne();
  majBoutonPret();
  afficherJoueurs([]);
}

async function quitterSalon() {
  if (!salon) return;
  const s = salon;
  salon = null;
  role = null;
  p = null;
  oublierAbsence();
  sessionStorage.removeItem(`duel-hote-${s.code}`);
  history.replaceState(null, '', location.pathname);
  await s.fermer();
  revenirAccueil();
  majPanneauLigne();
}

function revenirAccueil() {
  for (const d of ['renvoi', 'meditation', 'tombeau']) if ($(d).open) $(d).close();
  $('fin').hidden = true;
  $('ecran-duel').hidden = true;
  $('ecran-accueil').hidden = false;
  document.body.classList.remove('en-duel');
}

function revenirAuSalon() {
  role = null;
  p = null;
  oublierAbsence();
  revenirAccueil();
  majBoutonPret();
  surPresence(salon?.liste() ?? []);
}

$('btn-quitter').addEventListener('click', () => quitterSalon());
$('btn-copier').addEventListener('click', async () => {
  const lien = `${location.origin}${location.pathname}?salon=${salon.code}`;
  try {
    await navigator.clipboard.writeText(lien);
    notifier('Lien du salon copié : envoie-le à ton ami.');
  } catch {
    prompt('Copie ce lien et envoie-le à ton ami :', lien);
  }
});

function majBoutonPret() {
  if (!salon) return;
  $('btn-pret').textContent = salon.presence.pret ? 'Je ne suis plus prêt' : 'Je suis prêt';
  $('btn-pret').classList.toggle('btn-dc--ambre', !salon.presence.pret);
}

$('btn-pret').addEventListener('click', async () => {
  if (!salon) return;
  await salon.annoncer({ pret: !salon.presence.pret, grimoire: idsGrimoire() });
  majBoutonPret();
  surPresence(salon.liste());
});

function surPresence(tous) {
  if (!salon) return;
  // Page rechargée : l'ancienne connexion reste visible quelques secondes ; on ne garde que la plus récente
  // d'un même compte dans un même rôle
  const liste = tous.filter((x) => !tous.some((y) => y !== x && y.discord_id === x.discord_id && y.role === x.role && y.rejoint > x.rejoint));
  // Salon de deux : les deux premiers arrivés jouent, les suivants repartent
  const dedans = liste.slice(0, TAILLE_SALON);
  if (liste.length > TAILLE_SALON && !dedans.some((x) => x.cle === salon.cle)) {
    notifier('Ce salon est complet.', 'erreur');
    quitterSalon();
    return;
  }
  const moiDedans = dedans.find((x) => x.cle === salon.cle);
  const adversaire = dedans.find((x) => x.cle !== salon.cle) ?? null;
  const avant = salon.adversaire;
  salon.adversaire = adversaire;
  afficherJoueurs(dedans);

  const etat = $('salon-etat');
  if (!moiDedans) etat.textContent = 'Connexion au salon…';
  else if (adversaire && adversaire.role === salon.role) etat.textContent = salon.role === 'invite'
    ? 'L\'hôte a quitté ce salon : l\'un de vous doit en créer un nouveau.'
    : 'Ce salon a deux hôtes (onglet dupliqué ?) : créez un nouveau salon.';
  else if (!adversaire) etat.textContent = salon.role === 'hote'
    ? 'En attente de ton adversaire… Copie le lien du salon et envoie-le-lui.'
    : 'L\'hôte n\'est pas (ou plus) dans ce salon. Attends-le, ou crée ton propre salon.';
  else if (!salon.presence.pret) etat.textContent = 'Vérifie ton deck, puis déclare-toi prêt.';
  else if (!adversaire.pret) etat.textContent = `En attente de ${adversaire.nom}…`;
  else etat.textContent = 'Le duel commence !';

  // L'adversaire a disparu du salon en plein duel (onglet en arrière-plan, connexion coupée,
  // page rechargée…) : on lui laisse le temps de revenir avant de finir le duel
  if (role && p && !p.fini) {
    if (!adversaire) {
      if (!absence && avant) attendreRetour(avant.nom);
      if (absence) return;
    } else {
      const revenu = !!absence;
      oublierAbsence();
      const autreOnglet = !!salon.cleDuel && adversaire.cle !== salon.cleDuel;   // il a rechargé sa page
      if (autreOnglet && role === 'invite') {
        // L'hôte a rechargé sa page : la partie (qu'il faisait tourner) est perdue
        p.fini = 'joueur';
        terminer(`${adversaire.nom} a rechargé la page : le duel est interrompu.`);
        return;
      }
      if (revenu) notifier(`${adversaire.nom} est de retour.`);
      if ((revenu || autreOnglet) && role === 'hote') {
        salon.cleDuel = adversaire.cle;
        envoyerEtat();   // messages perdus pendant l'absence, ou page rechargée : il retrouve la partie
      }
    }
  }

  // L'hôte lance le duel quand les deux joueurs sont prêts
  if (salon.role === 'hote' && !role && salon.presence.pret && adversaire?.pret && adversaire.role === 'invite') {
    commencerEnLigne(adversaire);
  }
}

// Délai laissé à un adversaire déconnecté pour revenir (ex. : il est passé sur Discord depuis son téléphone)
const DELAI_RETOUR = 45000;
let absence = null;
function attendreRetour(nom) {
  notifier(`${nom} s'est déconnecté : on l'attend encore ${DELAI_RETOUR / 1000} secondes…`, 'erreur');
  absence = setTimeout(() => {
    absence = null;
    if (!salon || salon.adversaire || !role || !p || p.fini) return;
    p.fini = 'joueur';
    terminer(`${nom} a quitté le duel.`);
  }, DELAI_RETOUR);
}
function oublierAbsence() {
  clearTimeout(absence);
  absence = null;
}

function afficherJoueurs(dedans) {
  const places = [0, 1].map((i) => dedans[i] ?? null);
  $('salon-joueurs').innerHTML = places.map((x) => {
    if (!x) return `
      <div class="salon__joueur salon__joueur--vide">
        <span class="salon__avatar" aria-hidden="true">?</span>
        <span class="salon__nom">En attente d'un adversaire…</span>
      </div>`;
    const c = x.cle === salon.cle;
    return `
      <div class="salon__joueur${x.pret ? ' est-pret' : ''}">
        ${x.avatar ? `<img class="salon__avatar" src="${esc(x.avatar)}" alt="">` : '<span class="salon__avatar" aria-hidden="true">✦</span>'}
        <span class="salon__nom">${esc(x.nom)}${c ? ' <small>(toi)</small>' : ''}</span>
        <span class="salon__role">${x.role === 'hote' ? 'Hôte' : 'Invité'}</span>
        <span class="salon__pret">${x.pret ? 'Prêt' : 'Prépare son deck…'}</span>
      </div>`;
  }).join('');
}


// ---------------------------------------------------------------------
//  En ligne : l'hôte fait tourner la partie
// ---------------------------------------------------------------------
const hote = { pid: null, n: 0, historique: [], choixVus: new Set() };

// Copie allégée : des fiches des cartes, on garde seulement ce que la face affiche
// (image, rareté, et le nom, le rang et les attaques écrits dans le cadre : htmlInfos de JS/cartes.js)
const alleger = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'carte' && v
  ? { id: v.id, image: v.image, rarity: v.rarity, name: v.name, rank: v.rank, attack_1: v.attack_1, attack_2: v.attack_2 }
  : v)));

// État envoyé à l'invité : la main et la pioche de l'hôte sont masquées
function etatPourInvite() {
  const e = alleger(p);
  e.camps.joueur.main = e.camps.joueur.main.map(() => ({ cache: true }));
  e.camps.joueur.meditation = e.camps.joueur.meditation ? e.camps.joueur.meditation.map(() => 0) : null;
  e.camps.joueur.deck = e.camps.joueur.deck.map(() => 0);
  e.camps.adverse.deck = e.camps.adverse.deck.map(() => 0);
  return e;
}
function evenementPourInvite(ev) {
  const e = alleger(ev);
  if (e.qui === 'joueur' && e.pioche) e.pioche.piochees = e.pioche.piochees.map(() => ({ cache: true }));
  if (e.qui === 'joueur' && e.cartes) e.cartes = e.cartes.map(() => 0);   // Méditer : cartes cachées
  return e;
}

// L'état complet, sans animation : pour l'invité qui a manqué trop de messages ou rechargé la page
const RENVOI_MAX = 6;
function envoyerEtat() {
  if (role !== 'hote' || !salon || !p || p.fini) return;
  salon.envoyer('jeu', { pid: hote.pid, n: hote.n, etatComplet: true, ev: { type: 'etat' }, etat: etatPourInvite() });
}

// Envoie un événement du moteur à l'invité (rien en solo)
function diffuser(ev) {
  if (role !== 'hote' || !salon) return;
  const msg = { pid: hote.pid, n: ++hote.n, ev: evenementPourInvite(ev), etat: etatPourInvite() };
  hote.historique.push(msg);
  salon.envoyer('jeu', msg);
}

async function commencerEnLigne(adversaire) {
  role = 'hote';   // réserve la place tout de suite (pas de double lancement)
  // Le Grimoire de l'invité : ses cartes relues dans le catalogue public (limites refaites par le moteur)
  const sonGrimoire = await grimoireDepuisCles(adversaire.grimoire);

  await salon.annoncer({ pret: false });
  majBoutonPret();
  Object.assign(hote, { pid: crypto.randomUUID(), n: 0, historique: [], choixVus: new Set() });
  salon.cleDuel = adversaire.cle;
  const premier = Math.random() < 0.5 ? 'joueur' : 'adverse';
  p = creerPartie(construireDeck(grimoireJoueur), construireDeck(sonGrimoire), salon.presence.nom, adversaire.nom, premier);
  montrerPlateau();
  diffuser({ type: 'debut' });
  ouvrirRenvoi();   // les deux joueurs choisissent leur renvoi ; le tour 1 commence ensuite
}

// Action reçue de l'invité (dans son sens à lui : retournée en miroir)
function traiterChoix(c) {
  if (c.pid !== hote.pid || !c.id || hote.choixVus.has(c.id) || !p || p.fini) return;
  // Action périmée ou hors de son tour (l'abandon et le renvoi de main, eux, se font hors tour)
  const horsTour = c.a?.type === 'abandon' || (c.a?.type === 'renvoi' && !p.renvoi?.adverse);
  if (!horsTour && (c.n !== hote.n || p.actif !== 'adverse')) return;
  hote.choixVus.add(c.id);
  const a = miroir(c.a);
  enFile(async () => {
    if (a.type === 'fin') { finTour(p); await commencerTour(); return; }
    if (a.type === 'renvoi') {
      const ev = renvoyerMain(p, 'adverse', Array.isArray(a.indices) ? a.indices : []);
      if (!ev) return;
      diffuser(ev);
      afficher();
      if (renvoiFini(p)) { $('renvoi').close(); await commencerTour(); }
      return;
    }
    if (a.type === 'abandon') {
      p.fini = 'joueur';
      diffuser({ type: 'abandon', qui: 'adverse' });
      await terminer(`${nomAdverse()} a abandonné le duel.`);
      return;
    }
    // Action refusée par le moteur : on renvoie l'état pour débloquer l'invité
    if (!(await appliquer('adverse', a))) diffuser({ type: 'refus', qui: 'adverse' });
    if (p.fini) await terminer();
  });
}


// ---------------------------------------------------------------------
//  En ligne : l'invité rejoue les événements de l'hôte
// ---------------------------------------------------------------------
const invite = { pid: null, dernier: 0, activite: 0, choixEnvoye: null, renvoi: null };

// Le plateau vu de l'autre côté : « joueur » et « adverse » échangés partout
const ECHANGE = { joueur: 'adverse', adverse: 'joueur' };
function miroir(x) {
  if (Array.isArray(x)) return x.map(miroir);
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === 'camps' && v) o.camps = { joueur: miroir(v.adverse), adverse: miroir(v.joueur) };
    else if (k === 'renvoi' && v && typeof v === 'object') o.renvoi = { joueur: v.adverse, adverse: v.joueur };
    else if (['qui', 'camp', 'actif', 'fini'].includes(k) && ECHANGE[v]) o[k] = ECHANGE[v];
    else o[k] = miroir(v);
  }
  return o;
}

function envoyerChoix(a) {
  invite.choixEnvoye = { pid: invite.pid, id: crypto.randomUUID(), n: invite.dernier, a };
  invite.activite = Date.now();
  majConsigne();
  salon?.envoyer('choix', invite.choixEnvoye);
}

function surMessage(evenement, contenu) {
  if (!salon) return;
  if (salon.role === 'hote') {
    if (evenement === 'choix') traiterChoix(contenu);
    // L'invité a manqué des messages : on les renvoie dans l'ordre,
    // ou, s'il en manque beaucoup (ou s'il a rechargé la page), l'état de la partie d'un coup
    if (evenement === 'renvoi' && role === 'hote' && p) {
      const manquants = contenu.pid === hote.pid ? hote.historique.filter((m) => m.n >= contenu.depuis) : null;
      if (manquants && manquants.length <= RENVOI_MAX) manquants.forEach((m) => salon.envoyer('jeu', m));
      else envoyerEtat();
    }
    return;
  }
  if (evenement !== 'jeu') return;
  // Les événements sont rejoués dans l'ordre, sans trou ni doublon.
  // Nouveau duel (même si son tout premier message s'est perdu) : on repart de zéro
  if (contenu.etatComplet) {
    // plus ancien que ce qu'on a déjà, ou duel que l'invité a déjà quitté (retour au salon)
    if (contenu.pid === invite.pid && (contenu.n < invite.dernier || role !== 'invite')) return;
    Object.assign(invite, { pid: contenu.pid, dernier: contenu.n, activite: Date.now(), choixEnvoye: null });
    enFile(() => jouerEtat(contenu));
    return;
  }
  if (contenu.pid !== invite.pid) Object.assign(invite, { pid: contenu.pid, dernier: 0, choixEnvoye: null });
  if (contenu.n <= invite.dernier) return;
  if (contenu.n > invite.dernier + 1) {
    salon.envoyer('renvoi', { depuis: invite.dernier + 1, pid: invite.pid });
    return;
  }
  invite.dernier = contenu.n;
  invite.activite = Date.now();
  invite.choixEnvoye = null;   // l'hôte a avancé : l'action envoyée a été traitée
  enFile(() => jouerMessage(contenu));
}

async function jouerMessage(m) {
  const ev = miroir(m.ev);
  const etat = miroir(m.etat);
  if (ev.type === 'debut') {
    role = 'invite';
    p = etat;
    if (salon) salon.cleDuel = salon.adversaire?.cle ?? null;
    await salon?.annoncer({ pret: false });
    majBoutonPret();
    montrerPlateau();
    ouvrirRenvoi();
  } else if (!p || role !== 'invite') {
    return;   // duel quitté
  } else if (ev.type === 'tour') {
    p = etat;
    await afficherTour(ev);
  } else if (ev.type === 'abandon' || ev.type === 'refus') {
    p = etat;
  } else if (ev.type === 'renvoi') {
    p = etat;
    afficher();
    if (ev.qui === 'joueur' && ev.n) jouerSon('pioche');
  } else {
    await animer(ev);
    p = etat;
    afficher();
    if (ev.type === 'pose') await animer({ ...ev, type: 'apres-pose' });
    if (ev.type === 'destin' && ev.uid) await animer({ type: 'apres-pose', uid: ev.uid, carte: { n: 'Milicien de la Couronne' } });
  }
  invite.activite = Date.now();
  if (p.fini) {
    const raison = ev.type === 'abandon'
      ? (ev.qui === 'joueur' ? 'Tu as abandonné le duel.' : `${nomAdverse()} a abandonné le duel.`)
      : '';
    return terminer(raison);
  }
  if (ev.type === 'tour' && $('renvoi').open) $('renvoi').close();
  if (ev.type !== 'debut' && ev.type !== 'renvoi') deverrouiller();
  else afficher();
}

// L'état complet reçu de l'hôte : le plateau est remis à jour d'un coup, sans rejouer les animations
async function jouerEtat(m) {
  const nouveau = role !== 'invite' || !p;
  role = 'invite';
  p = miroir(m.etat);
  if (nouveau) {
    if (salon) salon.cleDuel = salon.adversaire?.cle ?? null;
    await salon?.annoncer({ pret: false });
    majBoutonPret();
    montrerPlateau();
  }
  invite.activite = Date.now();
  if (p.fini) return terminer();
  if (!renvoiFini(p)) {
    if (!p.renvoi?.joueur) ouvrirRenvoi();
    afficher();
    return;
  }
  if ($('renvoi').open) $('renvoi').close();
  deverrouiller();
}

// Veille de l'invité : si rien ne bouge depuis un moment alors qu'il attend l'hôte
// (connexion coupée un instant, message perdu…), il renvoie son action et redemande la suite
const SILENCE_MAX = 5000;
setInterval(() => {
  if (!salon || role !== 'invite' || !invite.pid || !p || p.fini) return;
  if (sel.monTour) return;   // c'est à lui de jouer
  if (Date.now() - invite.activite < SILENCE_MAX) return;
  invite.activite = Date.now();
  if (invite.renvoi && !p.renvoi?.joueur) salon.envoyer('choix', invite.renvoi);   // renvoi de main perdu
  if (invite.choixEnvoye) salon.envoyer('choix', invite.choixEnvoye);
  salon.envoyer('renvoi', { depuis: invite.dernier + 1, pid: invite.pid });
}, 1000);


// ---------------------------------------------------------------------
//  Loupe : une carte en grand, et tout ce qu'elle fait
//  Clic droit (ou appui long sur un écran tactile) sur une carte : troupes du plateau (les tiennes
//  et celles de l'adversaire), cartes de ta main, du Tombeau, du renvoi de main, de Méditer.
//  La fiche : type, rareté, coût, attaque et vie (actuelles et de base), capacité, dégâts selon le d20,
//  riposte, attaques de la carte (Veine, puissance, effet), état sur le plateau.
// ---------------------------------------------------------------------
let tombeauOuvert = null;   // 'joueur' | 'adverse' : le Tombeau affiché (pour retrouver ses cartes)
const CAPACITES = {
  guard: ['Garde', "Les unités adverses doivent l'attaquer avant de pouvoir viser autre chose."],
  charge: ['Charge', 'Peut attaquer dès le tour où elle est posée.'],
};
const CHIFFRES_RANG = ['', 'I', 'II', 'III', 'IV', 'V'];

// La carte (et, sur le plateau, l'unité) derrière un élément touché
function carteDe(el) {
  if (!p) return null;
  const unite = el.closest('.dc-unite[data-uid]');
  if (unite) {
    const camp = unite.dataset.camp;
    const u = trouver(p.camps[camp], Number(unite.dataset.uid));
    return u ? { def: u.def, u, camp } : null;
  }
  const carte = el.closest('.dc-carte[data-index]');
  if (!carte) return null;
  const i = Number(carte.dataset.index);
  const j = p.camps.joueur;
  const listes = {
    'main-joueur': j.main,
    'renvoi-main': j.main,
    'meditation-cartes': j.meditation ?? [],
    'tombeau-cartes': tombeauOuvert ? [...p.camps[tombeauOuvert].tombeau].reverse() : [],
  };
  const zone = Object.keys(listes).find((id) => carte.closest(`#${id}`));
  const def = zone ? listes[zone][i] : null;
  return def ? { def, main: zone === 'main-joueur' } : null;
}

function ficheLoupe({ def, u, camp, main }) {
  const carte = def.carte;   // vraie carte du catalogue (sinon : troupe, sort ou objet du Codex)
  const unite = def.t === 'u';
  const type = def.fx && def.image ? 'Objet de pouvoir' : def.t === 's' ? 'Sort du Codex' : carte ? 'Unité' : 'Troupe du Codex';
  const details = [type];
  if (carte?.rarity) details.push(RARETES[carte.rarity] ?? carte.rarity);
  if (carte?.rank) details.push(`Rang ${CHIFFRES_RANG[carte.rank] ?? carte.rank}`);
  const cout = main ? coutDe(p.camps.joueur, def) : def.c;
  const lignes = [
    `<div class="loupe__ligne"><dt>Coût</dt><dd><b class="loupe__energie">${cout}</b> énergie${cout !== def.c ? ` <small>(au lieu de ${def.c})</small>` : ''}</dd></div>`,
  ];
  if (unite) {
    const a = u ? u.a : def.a;
    const h = u ? u.h : def.h;
    const hMax = u ? u.hMax : def.h;
    lignes.push(`<div class="loupe__ligne"><dt>Attaque</dt><dd><b class="loupe__stat loupe__stat--a">${a}</b>${u && a !== def.a ? ` <small>(de base : ${def.a})</small>` : ''}</dd></div>`);
    lignes.push(`<div class="loupe__ligne"><dt>Vie</dt><dd><b class="loupe__stat loupe__stat--h">${h}</b>${u ? ` / ${hMax}` : ''}${u && hMax !== def.h ? ` <small>(de base : ${def.h})</small>` : ''}</dd></div>`);
  }
  const proprietaire = camp ? ` · <span class="loupe__camp">${camp === 'joueur' ? 'À toi' : esc(nomAdverse())}</span>` : '';
  // en-tête fixe : nom, type, coût, attaque et vie restent en place quand la fiche défile
  let html = `
    <div class="loupe__entete">
      <h2 id="loupe-titre" class="loupe__nom">${esc(def.n)}</h2>
      <p class="loupe__type">${details.map(esc).join(' · ')}${proprietaire}</p>
      <dl class="loupe__stats">${lignes.join('')}</dl>
    </div>`;

  // État sur le plateau
  if (u) {
    const etats = [];
    if (u.aAttaque) etats.push('A déjà attaqué ce tour');
    else if (peutAttaquer(u)) etats.push('Prête à attaquer');
    else if (!u.prete) etats.push("Vient d'arriver : attaquera au prochain tour");
    if (u.h < u.hMax) etats.push(`Blessée (${u.hMax - u.h} PV perdus)`);
    if (u.brisee) etats.push('Arme brisée : attaque divisée par 2 pour de bon');
    if (etats.length) html += `<p class="loupe__etat">${etats.map(esc).join(' · ')}</p>`;
  }
  // Capacité
  if (unite && CAPACITES[def.k]) {
    const [nom, texte] = CAPACITES[def.k];
    html += `<h3 class="loupe__titre">Capacité</h3><p class="loupe__texte"><b>${nom}</b> : ${esc(texte)}</p>`;
  }
  // Effet d'un sort ou d'un objet
  if (def.t === 's' && def.d) html += `<h3 class="loupe__titre">Effet</h3><p class="loupe__texte">${esc(def.d)}</p>`;
  // Dégâts selon le jet de d20, et riposte
  if (unite) {
    const a = u ? u.a : def.a;
    const jets = JETS.map((j) => `
      <li class="jet--${j.q}"><span>${j.min === j.max ? j.min : `${j.min}–${j.max}`}</span><b>${j.degats(a)}</b><small>${esc(j.label)}${j.q === 'echec' ? " · l'arme se brise" : ''}</small></li>`).join('');
    html += `<h3 class="loupe__titre">Dégâts en attaquant (jet de d20)</h3>
      <ul class="loupe__jets">${jets}</ul>
      <p class="loupe__texte">Attaquée, elle riposte avec <b>${a}</b> dégât${a > 1 ? 's' : ''} (sans jet).</p>`;
  }
  // Attaques de la vraie carte
  const attaques = carte ? [carte.attack_1, carte.attack_2].filter((x) => x?.nom) : [];
  if (attaques.length) {
    const items = attaques.map((x) => {
      const [veine, icone] = VEINES[x.veine] ?? ['Veine inconnue', '✦'];
      return `<li><span class="loupe__veine" title="${esc(veine)}">${icone}</span>
        <span><b>${esc(x.nom)}</b>${x.puissance != null ? ` <em>${esc(x.puissance)}</em>` : ''}${x.effet ? `<small>${esc(x.effet)}</small>` : ''}<small class="loupe__veine-nom">${esc(veine)}</small></span></li>`;
    }).join('');
    html += `<h3 class="loupe__titre">Attaques</h3><ul class="loupe__attaques">${items}</ul>`;
    if (attaques.length > 1) html += "<p class=\"loupe__note\">Sur un jet de 15 ou plus, c'est la plus puissante des deux qui est lancée.</p>";
  }
  if (carte?.description) html += `<p class="loupe__description">${esc(carte.description)}</p>`;
  return html;
}

function ouvrirLoupe(info) {
  const { def, u } = info;
  const visible = u ? { ...def, a: u.a, h: u.h } : def;   // sur le plateau : attaque et vie actuelles
  $('loupe-carte').innerHTML = htmlCarte(visible, { cout: info.main ? coutDe(p.camps.joueur, def) : def.c });
  $('loupe-fiche').innerHTML = ficheLoupe(info);
  jouerSon('clic');
  if (!$('loupe').open) $('loupe').showModal();
  $('loupe-fermer').focus();
}
$('loupe-fermer').addEventListener('click', () => $('loupe').close());
$('loupe').addEventListener('click', (e) => { if (e.target === $('loupe')) $('loupe').close(); });

// Clic droit sur une carte
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('#loupe')) return;
  const info = carteDe(e.target);
  if (!info) return;
  e.preventDefault();
  ouvrirLoupe(info);
});
// Appui long (écran tactile) ; le clic qui suit est ignoré, pour ne pas jouer la carte
let appui = null;
let ignorerClic = false;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || e.target.closest('#loupe')) return;
  const info = carteDe(e.target);
  if (!info) return;
  appui = { x: e.clientX, y: e.clientY, minuteur: setTimeout(() => { appui = null; ignorerClic = true; ouvrirLoupe(info); }, 450) };
});
const annulerAppui = () => { if (appui) { clearTimeout(appui.minuteur); appui = null; } };
document.addEventListener('pointermove', (e) => { if (appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 10) annulerAppui(); });
document.addEventListener('pointerup', annulerAppui);
document.addEventListener('pointercancel', annulerAppui);
document.addEventListener('click', (e) => {
  if (!ignorerClic) return;
  ignorerClic = false;
  e.stopPropagation();
  e.preventDefault();
}, true);


// ---------------------------------------------------------------------
//  Plein écran (comme un jeu) : le navigateur cache aussi ses propres barres
// ---------------------------------------------------------------------
$('btn-plein-ecran').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { notifier("Le plein écran n'est pas disponible sur ce navigateur.", 'erreur'); }
});
document.addEventListener('fullscreenchange', () => {
  $('btn-plein-ecran').classList.toggle('est-actif', !!document.fullscreenElement);
  $('btn-plein-ecran').title = document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran';
});


// ---------------------------------------------------------------------
//  Son et règles
// ---------------------------------------------------------------------
function majBoutonSon() {
  const m = estMuet();
  $('btn-son').setAttribute('aria-pressed', String(m));
  $('btn-son').title = m ? 'Activer le son' : 'Couper le son';
  $('btn-son').classList.toggle('est-muet', m);
}
$('btn-son').addEventListener('click', () => { basculerMuet(); majBoutonSon(); jouerSon('clic'); });

// Curseur du volume : le pourcentage s'affiche à côté ; un petit son d'essai quand on le lâche
const curseurVolume = $('volume');
function majVolume() {
  const pct = Math.round(lireVolume() * 100);
  curseurVolume.value = pct;
  curseurVolume.style.setProperty('--pct', `${pct}%`);
  $('volume-valeur').textContent = `${pct} %`;
}
curseurVolume.addEventListener('input', () => { reglerVolume(curseurVolume.value / 100); majVolume(); majBoutonSon(); });
curseurVolume.addEventListener('change', () => jouerSon('clic'));
majVolume();

function remplirRegles() {
  $('regles-jets').innerHTML = JETS.map((j) => `<li><b>${j.min === j.max ? j.min : `${j.min}–${j.max}`}</b> ${esc(j.label.replace(' !', ''))} : ${esc(j.texte)}</li>`).join('');
  $('regles-destin').innerHTML = DESTIN.map((j) => `<li><b>${j.min === j.max ? j.min : `${j.min}–${j.max}`}</b> ${esc(j.label)} : ${esc(j.texte)}</li>`).join('');
  $('regles-pv').textContent = PV_HEROS;
}
document.querySelectorAll('[data-ouvrir-regles]').forEach((b) => b.addEventListener('click', () => $('regles').showModal()));
$('regles-fermer').addEventListener('click', () => $('regles').close());
$('regles').addEventListener('click', (e) => { if (e.target === $('regles')) $('regles').close(); });

if (reduit) document.documentElement.classList.add('anim-reduites');
init();
