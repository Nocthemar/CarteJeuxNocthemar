// =====================================================================
//  Duel des Couronnes — règles du jeu (aucun affichage ici)
//  Faire tomber les 20 PV du héros adverse avant que les siens ne tombent.
//  - 1 énergie de plus par tour (10 au plus), rechargée à chaque tour
//  - 5 emplacements de troupes par camp, 7 cartes en main au plus
//  - Capacités : Garde (doit être attaquée en premier), Charge (attaque dès son arrivée)
//  - Chaque attaque est un jet de d20 (table JETS), le Jet du Destin un second d20 (table DESTIN)
//  - Le Grimoire : 20 cartes (2 exemplaires au plus d'une carte, 4 objets au plus),
//    complété par des cartes de base, mélangé au début de la partie
//  - Début : 3 cartes pour celui qui commence, 4 pour l'autre, puis un renvoi de main (une fois)
//  - 1 carte piochée par tour ; main pleine (7) : la carte piochée est brûlée (Tombeau)
//  - Le Tombeau : troupes mortes, sorts joués, cartes brûlées et défaussées (visible des deux joueurs)
//  - Une fois par tour chacun, pour 1 énergie : Défausser (une carte au Tombeau, on en pioche une)
//    et Méditer (regarder les 3 premières cartes du Grimoire, en placer une dessous)
//  - Épuisement : piocher dans un Grimoire vide coûte 1 PV, puis 2, puis 3…
//  Le duel se joue entièrement dans le navigateur. Seul le mode Histoire donne des
//  récompenses, et c'est le serveur qui les vérifie (valider_niveau_histoire, SQL/mode_histoire.sql).
// =====================================================================

export const PV_HEROS = 20;
export const ENERGIE_MAX = 10;
export const PLACES = 5;
export const MAIN_MAX = 7;          // une carte piochée main pleine est brûlée
export const MAIN_DEPART = 3;       // le second joueur pioche une carte de plus
export const COUT_DESTIN = 2;
export const COUT_DEFAUSSE = 1;     // défausser une carte de sa main (une fois par tour)
export const COUT_MEDITER = 1;      // regarder les 3 premières cartes du Grimoire (une fois par tour)
export const TAILLE_DECK = 20;      // le Grimoire
export const COPIES_MAX = 2;        // exemplaires au plus d'une même carte
export const OBJETS_MAX = 4;        // objets de pouvoir au plus dans le Grimoire
export const UNITES_PAR_DECK = TAILLE_DECK;

// ---------------------------------------------------------------------
//  Les cartes
// ---------------------------------------------------------------------
// Unités : les cartes du catalogue (table cards). Coût / attaque / vie de base selon la rareté,
// ajustés par le rang (Rang I = le plus fort) et la puissance moyenne des attaques.
const BASE = {
  commune:       { c: 2, a: 2, h: 3 },
  eveillee:      { c: 3, a: 3, h: 4 },
  mythique:      { c: 4, a: 4, h: 5 },
  legendaire:    { c: 5, a: 5, h: 6 },
  transcendante: { c: 6, a: 6, h: 7 },
};
// Capacité donnée par la Veine de la 1re attaque
const VEINES_GARDE = ['forge', 'trone', 'chaine', 'racine'];
const VEINES_CHARGE = ['bete', 'sang', 'maree'];

const puissance = (p) => (p === '∞' ? 120 : Number.isFinite(Number(p)) ? Number(p) : 50);

export function uniteDepuisCarte(carte) {
  const b = BASE[carte.rarity] ?? BASE.commune;
  let { c, a, h } = b;
  if (carte.rank === 1) { a += 1; h += 1; }
  else if (carte.rank === 2) h += 1;

  const attaques = [carte.attack_1, carte.attack_2].filter((x) => x?.nom);
  const moyenne = attaques.length ? attaques.reduce((s, x) => s + puissance(x.puissance), 0) / attaques.length : 50;
  if (moyenne >= 80) { a += 1; h = Math.max(1, h - 1); }
  else if (moyenne <= 35) { a = Math.max(1, a - 1); h += 1; }

  const veine = attaques[0]?.veine ?? null;
  const k = VEINES_GARDE.includes(veine) ? 'guard' : VEINES_CHARGE.includes(veine) ? 'charge' : null;
  return { id: `c${carte.id}`, n: carte.name, c, t: 'u', a, h, k, veine, carte };
}

// Sorts du Codex (les cartes du catalogue n'ont pas encore de sorts)
//   fx : unit (dégâts à une unité adverse), face (dégâts au héros adverse), heal (soin du héros),
//        buff (+v/+v à une de tes unités), draw (pioche v cartes), aoe (v dégâts à toutes les unités adverses)
export const SORTS = [
  { id: 's-forge',  n: 'Étincelle de la Forge', c: 1, t: 's', fx: 'unit', v: 2, veine: 'forge',  d: 'Inflige 2 dégâts à une unité adverse.' },
  { id: 's-ombre',  n: "Morsure de l'Ombre",    c: 2, t: 's', fx: 'face', v: 3, veine: 'ombre',  d: 'Inflige 3 dégâts au héros adverse.' },
  { id: 's-racine', n: 'Sève de la Racine',     c: 2, t: 's', fx: 'heal', v: 5, veine: 'racine', d: 'Rend 5 PV à ton héros.' },
  { id: 's-trone',  n: 'Serment du Trône',      c: 2, t: 's', fx: 'buff', v: 2, veine: 'trone',  d: 'Donne +2/+2 à une de tes unités.' },
  { id: 's-regard', n: 'Vision du Regard',      c: 3, t: 's', fx: 'draw', v: 2, veine: 'regard', d: 'Pioche 2 cartes.' },
  { id: 's-sang',   n: 'Saignée',               c: 4, t: 's', fx: 'unit', v: 5, veine: 'sang',   d: 'Inflige 5 dégâts à une unité adverse.' },
  { id: 's-maree',  n: 'Raz-de-Marée',          c: 5, t: 's', fx: 'aoe',  v: 2, veine: 'maree',  d: 'Inflige 2 dégâts à toutes les unités adverses.' },
];

// Troupes du Codex : unités génériques (illustration low poly). Les deux premières servent
// d'ajouts bon marché au deck (AJOUTS_CODEX) ; toutes servent si le joueur n'a aucune carte
export const TROUPES = [
  { id: 't-ecuyer',     n: 'Écuyer de la Couronne', c: 1, t: 'u', a: 1, h: 2, k: null,     veine: 'trone',  icone: 'epee' },
  { id: 't-garde',      n: 'Garde du Pont',         c: 2, t: 'u', a: 1, h: 4, k: 'guard',  veine: 'forge',  icone: 'bouclier' },
  { id: 't-archer',     n: 'Archer des Remparts',   c: 2, t: 'u', a: 2, h: 2, k: null,     veine: 'regard', icone: 'arc' },
  { id: 't-loup',       n: 'Loup des Cendres',      c: 2, t: 'u', a: 3, h: 1, k: 'charge', veine: 'ombre',  icone: 'croc' },
  { id: 't-chevalier',  n: 'Chevalier errant',      c: 3, t: 'u', a: 3, h: 3, k: null,     veine: 'trone',  icone: 'epee' },
  { id: 't-cavalier',   n: 'Cavalier de la Marche', c: 3, t: 'u', a: 3, h: 2, k: 'charge', veine: 'maree',  icone: 'lance' },
  { id: 't-sentinelle', n: 'Sentinelle de pierre',  c: 4, t: 'u', a: 2, h: 6, k: 'guard',  veine: 'racine', icone: 'bouclier' },
  { id: 't-lancier',    n: 'Lancier des Ruines',    c: 4, t: 'u', a: 4, h: 4, k: null,     veine: 'sang',   icone: 'lance' },
];

// Renfort du Jet du Destin
export const MILICIEN = { id: 'milicien', n: 'Milicien de la Couronne', c: 1, t: 'u', a: 2, h: 2, k: null, veine: null, icone: 'epee' };

// ---------------------------------------------------------------------
//  Cartes de base : elles complètent un Grimoire trop petit (troupes puis sorts du Codex,
//  des moins chères aux plus chères)
// ---------------------------------------------------------------------
export const CARTES_BASE = [...TROUPES, ...SORTS].sort((a, b) => a.c - b.c);
export const AJOUTS_CODEX = CARTES_BASE;   // (ancien nom)

// ---------------------------------------------------------------------
//  Cartes de pouvoir : les objets de l'Équipement (img/Equipement), effets tirés
//  de leur description dans le Codex. Un joueur a ceux qu'il possède (table inventory).
//    heal : soin du héros (v)        ready : une unité alliée peut attaquer à nouveau
//    rage : +v attaque / -1 vie       talisman : +v au prochain jet de d20
//    coffre : pioche 1 et +1 énergie  jeton : la prochaine carte coûte v de moins
// ---------------------------------------------------------------------
export const OBJETS = [
  { id: 'o-potion',   n: 'Potion de soin',          c: 1, t: 's', fx: 'heal',     v: 4, image: 'img/Equipement/Potion de soin.webp',          d: 'Rend 4 PV à ton héros.' },
  { id: 'o-trousse',  n: 'Trousse de soins',        c: 3, t: 's', fx: 'heal',     v: 8, image: 'img/Equipement/Trousse de soins.webp',        d: 'Rend 8 PV à ton héros.' },
  { id: 'o-endu',     n: "Tonique d'endurance",     c: 2, t: 's', fx: 'ready',    v: 1, image: 'img/Equipement/Tonique d’endurance.webp',     d: 'Une de tes unités peut attaquer une fois de plus ce tour.' },
  { id: 'o-rage',     n: 'Tonique de rage',         c: 2, t: 's', fx: 'rage',     v: 3, image: 'img/Equipement/Tonique de rage.webp',         d: 'Une de tes unités gagne +3 attaque mais perd 1 vie.' },
  { id: 'o-talisman', n: 'Talisman du Dé',          c: 1, t: 's', fx: 'talisman', v: 5, image: 'img/Equipement/Talisman du Dé.webp',          d: '+5 à ton prochain jet de d20.' },
  { id: 'o-coffre',   n: "Nécessaire d'aventurier", c: 1, t: 's', fx: 'coffre',   v: 1, image: 'img/Equipement/Nécessaire d’aventurier.webp', d: 'Ouvre un coffre : pioche 1 carte et regagne 1 énergie.' },
  { id: 'o-jeton',    n: 'Jeton du marchand',       c: 0, t: 's', fx: 'jeton',    v: 2, image: 'img/Equipement/Jeton du marchand.webp',       d: 'Ta prochaine carte coûte 2 de moins.' },
];
export const OBJETS_PAR_DECK = OBJETS_MAX;   // (ancien nom)

// Retrouve un objet à partir d'un nom d'inventaire (« Tonique d’endurance », « potion de soin »…)
const cleObjet = (nom) => String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim().toLowerCase();
export const objetDepuisNom = (nom) => OBJETS.find((o) => cleObjet(o.n) === cleObjet(nom)) ?? null;

// Le Grimoire d'un joueur : les cartes choisies (dans l'ordre, avec répétitions pour les
// exemplaires), en respectant COPIES_MAX par carte, OBJETS_MAX objets et TAILLE_DECK cartes,
// puis complété avec les cartes de base jusqu'à TAILLE_DECK. Renvoie la liste (non mélangée).
export const estObjet = (c) => !!c && OBJETS.some((o) => o.id === c.id);
export function grimoire(cartes = []) {
  const liste = [];
  const nb = new Map();
  const ajouter = (c) => {
    if (!c || liste.length >= TAILLE_DECK) return false;
    if ((nb.get(c.id) ?? 0) >= COPIES_MAX) return false;
    if (estObjet(c) && liste.filter(estObjet).length >= OBJETS_MAX) return false;
    nb.set(c.id, (nb.get(c.id) ?? 0) + 1);
    liste.push(c);
    return true;
  };
  cartes.forEach(ajouter);
  // Complément : un exemplaire de chaque carte de base, puis un second, jusqu'à 20
  for (let tour = 0; tour < COPIES_MAX && liste.length < TAILLE_DECK; tour++) {
    for (const c of CARTES_BASE) ajouter(c);
  }
  return liste;
}

// Un Grimoire mélangé, prêt pour une partie
export function construireDeck(cartes = []) {
  return melanger(grimoire(cartes));
}

// (ancienne interface : les unités et les objets d'un deck)
export function compositionDeck(unites = [], objets = []) {
  const cartes = grimoire([...unites, ...objets]);
  return { cartes, unites: cartes.filter((c) => c.t === 'u'), objets: cartes.filter((c) => c.t !== 'u') };
}

// Coût réel d'une carte (le Jeton du marchand réduit la suivante)
export const coutDe = (camp, carte) => (carte.fx === 'jeton' ? carte.c : Math.max(0, carte.c - (camp.reduction ?? 0)));

export function melanger(liste) {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}


// ---------------------------------------------------------------------
//  Les dés
// ---------------------------------------------------------------------
export const d20 = () => 1 + Math.floor(Math.random() * 20);

// Jet d'attaque : la table se modifie ici sans toucher au reste
export const JETS = [
  { min: 1,  max: 1,  q: 'echec',    label: 'Échec critique', degats: () => 0,         texte: "0 dégât, et l'arme se brise (attaque divisée par 2 pour de bon)." },
  { min: 2,  max: 5,  q: 'faible',   label: 'Coup faible',    degats: (a) => Math.floor(a / 2), texte: 'Dégâts divisés par 2.' },
  { min: 6,  max: 14, q: 'normal',   label: 'Coup normal',    degats: (a) => a,         texte: 'Dégâts normaux.' },
  { min: 15, max: 19, q: 'solide',   label: 'Coup solide',    degats: (a) => a + 1,     texte: '+1 dégât.' },
  { min: 20, max: 20, q: 'critique', label: 'Critique !',     degats: (a) => a * 2,     texte: 'Dégâts doublés.' },
];
export const rollInfo = (de) => JETS.find((j) => de >= j.min && de <= j.max);

// Jet du Destin
export const DESTIN = [
  { min: 1,  max: 4,  q: 'malediction', label: 'Malédiction', texte: 'Ton héros subit 3 dégâts.' },
  { min: 5,  max: 8,  q: 'soin',        label: 'Soin',        texte: 'Ton héros récupère 4 PV.' },
  { min: 9,  max: 12, q: 'pioche',      label: 'Pioche',      texte: 'Tu pioches 2 cartes.' },
  { min: 13, max: 16, q: 'renfort',     label: 'Renfort',     texte: 'Un Milicien de la Couronne (2/2) rejoint tes rangs.' },
  { min: 17, max: 19, q: 'benediction', label: 'Bénédiction', texte: 'Tes unités gagnent +1/+1.' },
  { min: 20, max: 20, q: 'grace',       label: 'Grâce divine', texte: 'Tes unités gagnent +2/+2.' },
];
export const destinInfo = (de) => DESTIN.find((j) => de >= j.min && de <= j.max);


// ---------------------------------------------------------------------
//  La partie
// ---------------------------------------------------------------------
let compteur = 0;
const instancier = (def) => ({
  uid: ++compteur, def, n: def.n, a: def.a, h: def.h, hMax: def.h, k: def.k,
  prete: def.k === 'charge', aAttaque: false, brisee: false,
});

function creerCamp(nom, deck) {
  return {
    nom, pv: PV_HEROS, pvMax: PV_HEROS,
    energie: 0, energieMax: 0, destinUtilise: false,
    deck, main: [], tombeau: [], terrain: Array(PLACES).fill(null),
    epuisement: 0, defausseUtilisee: false, mediterUtilise: false, meditation: null,
    stats: { jets: 0, critiques: 0, echecs: 0, cartes: 0, degats: 0, destins: 0 },
  };
}

export const autre = (qui) => (qui === 'joueur' ? 'adverse' : 'joueur');

// deckJoueur / deckAdverse : les Grimoires (construireDeck), mélangés ici de nouveau.
// options (mode Histoire, toutes facultatives) :
//   pvAdverse          PV du héros adverse (20 par défaut)
//   energieBonusAdverse énergie en plus à chaque tour de l'adversaire (boss)
// La partie commence par le renvoi de main : p.renvoi[qui] passe à true quand le joueur a choisi
// (renvoyerMain), et le premier tour ne commence qu'une fois les deux renvois faits (renvoiFini).
export function creerPartie(deckJoueur, deckAdverse, nomJoueur, nomAdverse, premier, options = {}) {
  const p = {
    camps: { joueur: creerCamp(nomJoueur, melanger(deckJoueur)), adverse: creerCamp(nomAdverse, melanger(deckAdverse)) },
    actif: premier, tour: 0, fini: null,
    renvoi: { joueur: false, adverse: false },
    jets: [],   // historique des derniers jets (affichage)
  };
  if (options.pvAdverse > 0) p.camps.adverse.pv = p.camps.adverse.pvMax = options.pvAdverse;
  if (options.energieBonusAdverse > 0) p.camps.adverse.energieBonus = options.energieBonusAdverse;
  piocher(p.camps[premier], MAIN_DEPART);
  piocher(p.camps[autre(premier)], MAIN_DEPART + 1);   // le second joueur a une carte de plus
  return p;
}

export const renvoiFini = (p) => !!p.renvoi && p.renvoi.joueur && p.renvoi.adverse;

// Renvoi de main (une seule fois, avant le premier tour) : les cartes choisies (index dans la
// main) retournent dans le Grimoire, qui est remélangé, puis le joueur repioche autant de cartes
export function renvoyerMain(p, qui, indices = []) {
  if (!p.renvoi || p.renvoi[qui] || p.fini) return null;
  const camp = p.camps[qui];
  const choisis = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < camp.main.length);
  const renvoyees = choisis.sort((a, b) => b - a).map((i) => camp.main.splice(i, 1)[0]);
  camp.deck = melanger([...camp.deck, ...renvoyees]);
  const pioche = piocher(camp, renvoyees.length);
  p.renvoi[qui] = true;
  return { type: 'renvoi', qui, n: renvoyees.length, pioche };
}

// Pioche n cartes sur le dessus du Grimoire.
// - main pleine (MAIN_MAX) : la carte est brûlée et va au Tombeau
// - Grimoire vide : épuisement, le héros perd 1 PV, puis 2, puis 3… à chaque carte manquante
// Renvoie { piochees, brulees, epuisement } (epuisement : PV perdus). Après une pioche, l'appelant
// vérifie la fin de partie (nettoyer), car l'épuisement peut faire tomber un héros.
export function piocher(camp, n = 1) {
  const res = { piochees: [], brulees: [], epuisement: 0 };
  for (let i = 0; i < n; i++) {
    if (!camp.deck.length) {
      camp.epuisement += 1;
      camp.pv -= camp.epuisement;
      res.epuisement += camp.epuisement;
      continue;
    }
    const carte = camp.deck.shift();
    if (camp.main.length >= MAIN_MAX) { res.brulees.push(carte); camp.tombeau.push(carte); }
    else { camp.main.push(carte); res.piochees.push(carte); }
  }
  return res;
}

// Ramène une carte du Tombeau (pour les futures cartes de la Veine du Tombeau).
// vers : 'main' (si elle n'est pas pleine) ou 'grimoire' (sur le dessus). Renvoie la carte, ou null.
export function ramenerDuTombeau(p, qui, index, vers = 'main') {
  const camp = p.camps[qui];
  const carte = camp.tombeau[index];
  if (!carte) return null;
  if (vers === 'main' && camp.main.length >= MAIN_MAX) return null;
  camp.tombeau.splice(index, 1);
  if (vers === 'main') camp.main.push(carte);
  else camp.deck.unshift(carte);
  return carte;
}

export function debutTour(p) {
  const camp = p.camps[p.actif];
  if (p.actif === 'joueur' || p.tour === 0) p.tour += 1;
  camp.energieMax = Math.min(ENERGIE_MAX, camp.energieMax + 1);
  camp.energie = Math.min(ENERGIE_MAX, camp.energieMax + (camp.energieBonus ?? 0));
  camp.destinUtilise = false;
  camp.defausseUtilisee = false;
  camp.mediterUtilise = false;
  camp.terrain.forEach((u) => { if (u) { u.prete = true; u.aAttaque = false; } });
  const ev = { type: 'tour', qui: p.actif, pioche: piocher(camp, 1) };
  // Épuisement : Grimoire vide, le héros perd des PV (ev.fatigue = PV perdus)
  if (ev.pioche.epuisement) {
    ev.fatigue = ev.pioche.epuisement;
    nettoyer(p);
  }
  return ev;
}

export function finTour(p) {
  p.actif = autre(p.actif);
}

export const unites = (camp) => camp.terrain.filter(Boolean);
export const trouver = (camp, uid) => camp.terrain.find((u) => u?.uid === uid) ?? null;
const placeLibre = (camp) => camp.terrain.findIndex((u) => !u);

// Une carte peut-elle être jouée (énergie, place, cible) ?
export function peutJouer(p, qui, index) {
  const camp = p.camps[qui];
  const carte = camp.main[index];
  if (!carte || p.fini || p.actif !== qui || camp.meditation || coutDe(camp, carte) > camp.energie) return false;
  if (carte.t === 'u') return placeLibre(camp) >= 0;
  if (carte.fx === 'unit') return unites(p.camps[autre(qui)]).length > 0;
  if (carte.fx === 'buff' || carte.fx === 'rage') return unites(camp).length > 0;
  if (carte.fx === 'ready') return unites(camp).some((u) => u.aAttaque && u.a > 0);
  return true;
}

// Cibles d'un sort : null si le sort n'en demande pas
export function ciblesSort(p, qui, carte) {
  if (carte.fx === 'unit') return unites(p.camps[autre(qui)]).map((u) => ({ camp: autre(qui), uid: u.uid }));
  if (carte.fx === 'buff' || carte.fx === 'rage') return unites(p.camps[qui]).map((u) => ({ camp: qui, uid: u.uid }));
  if (carte.fx === 'ready') return unites(p.camps[qui]).filter((u) => u.aAttaque && u.a > 0).map((u) => ({ camp: qui, uid: u.uid }));
  return null;
}

// Cibles d'une attaque : les unités en Garde d'abord, sinon toutes les unités et le héros
export function ciblesAttaque(p, qui) {
  const adv = autre(qui);
  const ennemis = unites(p.camps[adv]);
  const gardes = ennemis.filter((u) => u.k === 'guard');
  const liste = (gardes.length ? gardes : ennemis).map((u) => ({ camp: adv, uid: u.uid }));
  if (!gardes.length) liste.push({ camp: adv, heros: true });
  return liste;
}

export const peutAttaquer = (u) => !!u && u.prete && !u.aAttaque && u.a > 0;
const memeCible = (a, b) => a.camp === b.camp && (a.heros ? b.heros : a.uid === b.uid);

// Retire les unités détruites (elles vont au Tombeau, sauf le Milicien du Destin qui n'est pas
// une carte) et regarde si un héros est tombé
function nettoyer(p) {
  const morts = [];
  for (const qui of ['joueur', 'adverse']) {
    const camp = p.camps[qui];
    camp.terrain = camp.terrain.map((u) => {
      if (u && u.h <= 0) {
        morts.push(u.uid);
        if (u.def && u.def.id !== MILICIEN.id) camp.tombeau.push(u.def);
        return null;
      }
      return u;
    });
  }
  if (p.camps.joueur.pv <= 0) p.fini = 'adverse';
  else if (p.camps.adverse.pv <= 0) p.fini = 'joueur';
  return morts;
}

// Joue une carte de la main. cible : { camp, uid } pour les sorts qui en demandent une
export function jouer(p, qui, index, cible = null) {
  if (!peutJouer(p, qui, index)) return null;
  const camp = p.camps[qui];
  const carte = camp.main[index];
  const cibles = carte.t === 's' ? ciblesSort(p, qui, carte) : null;
  if (cibles && !cibles.some((c) => cible && memeCible(c, cible))) return null;

  camp.main.splice(index, 1);
  camp.energie -= coutDe(camp, carte);
  if (carte.fx !== 'jeton') camp.reduction = 0;   // la réduction du Jeton ne sert qu'une fois
  camp.stats.cartes += 1;
  const ev = { type: carte.t === 'u' ? 'pose' : 'sort', qui, carte, cible };

  if (carte.t === 'u') {
    const place = placeLibre(camp);
    const u = instancier(carte);
    camp.terrain[place] = u;
    ev.uid = u.uid;
    ev.place = place;
    return ev;
  }
  cast(p, qui, carte, cible, ev);
  camp.tombeau.push(carte);   // un sort joué va au Tombeau
  ev.morts = nettoyer(p);
  return ev;
}

// ---------------------------------------------------------------------
//  Défausser (1 énergie, une fois par tour) : une carte de la main au Tombeau, on en pioche une
// ---------------------------------------------------------------------
export const peutDefausser = (p, qui) => {
  const camp = p.camps[qui];
  return p.actif === qui && !p.fini && !camp.meditation && !camp.defausseUtilisee
    && camp.energie >= COUT_DEFAUSSE && camp.main.length > 0;
};

export function defausser(p, qui, index) {
  if (!peutDefausser(p, qui)) return null;
  const camp = p.camps[qui];
  const carte = camp.main[index];
  if (!carte) return null;
  camp.main.splice(index, 1);
  camp.energie -= COUT_DEFAUSSE;
  camp.defausseUtilisee = true;
  camp.tombeau.push(carte);
  const ev = { type: 'defausse', qui, carte, pioche: piocher(camp, 1) };
  ev.morts = nettoyer(p);
  return ev;
}

// ---------------------------------------------------------------------
//  Méditer (1 énergie, une fois par tour) : le joueur regarde les 3 premières cartes de son
//  Grimoire (camp.meditation), puis en place une dessous ou n'en place aucune (placerSous).
//  Tant que le choix n'est pas fait, aucune autre action n'est possible.
// ---------------------------------------------------------------------
export const peutMediter = (p, qui) => {
  const camp = p.camps[qui];
  return p.actif === qui && !p.fini && !camp.meditation && !camp.mediterUtilise
    && camp.energie >= COUT_MEDITER && camp.deck.length > 0;
};

export function mediter(p, qui) {
  if (!peutMediter(p, qui)) return null;
  const camp = p.camps[qui];
  camp.energie -= COUT_MEDITER;
  camp.mediterUtilise = true;
  camp.meditation = camp.deck.slice(0, 3);
  return { type: 'mediter', qui, cartes: camp.meditation };
}

// index : 0, 1 ou 2 (la carte à placer sous le Grimoire), ou null pour ne rien changer
export function placerSous(p, qui, index = null) {
  const camp = p.camps[qui];
  if (!camp.meditation || p.actif !== qui) return null;
  let carte = null;
  if (Number.isInteger(index) && index >= 0 && index < camp.meditation.length) {
    [carte] = camp.deck.splice(index, 1);
    camp.deck.push(carte);
  }
  camp.meditation = null;
  return { type: 'placer', qui, sous: !!carte };
}

// Effet d'un sort
function cast(p, qui, carte, cible, ev) {
  const camp = p.camps[qui];
  const adverse = p.camps[autre(qui)];
  ev.touches = [];   // [{ camp, uid | heros, valeur, soin }]
  switch (carte.fx) {
    case 'unit': {
      const u = trouver(adverse, cible.uid);
      u.h -= carte.v;
      camp.stats.degats += carte.v;
      ev.touches.push({ camp: autre(qui), uid: u.uid, valeur: carte.v });
      break;
    }
    case 'face':
      adverse.pv -= carte.v;
      camp.stats.degats += carte.v;
      ev.touches.push({ camp: autre(qui), heros: true, valeur: carte.v });
      break;
    case 'heal': {
      const avant = camp.pv;
      camp.pv = Math.min(camp.pvMax, camp.pv + carte.v);
      ev.touches.push({ camp: qui, heros: true, valeur: camp.pv - avant, soin: true });
      break;
    }
    case 'buff': {
      const u = trouver(camp, cible.uid);
      u.a += carte.v; u.h += carte.v; u.hMax += carte.v;
      ev.touches.push({ camp: qui, uid: u.uid, valeur: carte.v, buff: true });
      break;
    }
    case 'draw':
      ev.pioche = piocher(camp, carte.v);
      break;
    case 'ready': {
      const u = trouver(camp, cible.uid);
      u.aAttaque = false;
      u.prete = true;
      ev.touches.push({ camp: qui, uid: u.uid, texte: 'Encore une attaque !', buff: true });
      break;
    }
    case 'rage': {
      const u = trouver(camp, cible.uid);
      u.a += carte.v;
      u.h = Math.max(1, u.h - 1);
      ev.touches.push({ camp: qui, uid: u.uid, texte: `+${carte.v} attaque`, buff: true });
      break;
    }
    case 'talisman':
      camp.bonusDe = (camp.bonusDe ?? 0) + carte.v;
      ev.touches.push({ camp: qui, heros: true, texte: `+${carte.v} au prochain d20`, buff: true });
      break;
    case 'coffre':
      ev.pioche = piocher(camp, 1);
      camp.energie = Math.min(ENERGIE_MAX, camp.energie + 1);
      ev.touches.push({ camp: qui, heros: true, texte: '+1 énergie', buff: true });
      break;
    case 'jeton':
      camp.reduction = (camp.reduction ?? 0) + carte.v;
      ev.touches.push({ camp: qui, heros: true, texte: `Prochaine carte -${carte.v}`, buff: true });
      break;
    case 'aoe':
      unites(adverse).forEach((u) => {
        u.h -= carte.v;
        camp.stats.degats += carte.v;
        ev.touches.push({ camp: autre(qui), uid: u.uid, valeur: carte.v });
      });
      break;
    default: break;
  }
}

// Attaque d'une unité : jet de d20 ; une unité attaquée riposte avec son attaque (sans jet)
export function attaquer(p, qui, uid, cible) {
  const camp = p.camps[qui];
  const adverse = p.camps[autre(qui)];
  const u = trouver(camp, uid);
  if (!peutAttaquer(u) || p.actif !== qui || p.fini || camp.meditation) return null;
  if (!ciblesAttaque(p, qui).some((c) => memeCible(c, cible))) return null;

  let de = d20();
  if (camp.bonusDe) { de = Math.min(20, de + camp.bonusDe); camp.bonusDe = 0; }
  const info = rollInfo(de);
  camp.stats.jets += 1;
  if (info.q === 'critique') camp.stats.critiques += 1;
  if (info.q === 'echec') camp.stats.echecs += 1;

  const degats = info.degats(u.a);
  u.aAttaque = true;
  const ev = { type: 'attaque', qui, uid, cible, de, info, degats, riposte: 0, brise: false };

  if (info.q === 'echec') {
    u.a = Math.floor(u.a / 2);
    u.brisee = true;
    ev.brise = true;
  }
  if (cible.heros) {
    adverse.pv -= degats;
  } else {
    const t = trouver(adverse, cible.uid);
    t.h -= degats;
    ev.riposte = t.a;
    u.h -= t.a;
  }
  camp.stats.degats += degats;
  p.jets.unshift({ qui, de, q: info.q, label: info.label, quoi: `${u.n} attaque` });
  p.jets.length = Math.min(p.jets.length, 8);
  ev.morts = nettoyer(p);
  return ev;
}

// Jet du Destin : 2 énergie, une fois par tour
export const peutDestin = (p, qui) => p.actif === qui && !p.fini && !p.camps[qui].meditation
  && !p.camps[qui].destinUtilise && p.camps[qui].energie >= COUT_DESTIN;

export function destin(p, qui) {
  if (!peutDestin(p, qui)) return null;
  const camp = p.camps[qui];
  camp.energie -= COUT_DESTIN;
  camp.destinUtilise = true;
  camp.stats.destins += 1;
  camp.stats.jets += 1;

  let de = d20();
  if (camp.bonusDe) { de = Math.min(20, de + camp.bonusDe); camp.bonusDe = 0; }
  const info = destinInfo(de);
  if (de === 20) camp.stats.critiques += 1;
  if (de === 1) camp.stats.echecs += 1;
  const ev = { type: 'destin', qui, de, info, touches: [] };

  switch (info.q) {
    case 'malediction':
      camp.pv -= 3;
      ev.touches.push({ camp: qui, heros: true, valeur: 3 });
      break;
    case 'soin': {
      const avant = camp.pv;
      camp.pv = Math.min(camp.pvMax, camp.pv + 4);
      ev.touches.push({ camp: qui, heros: true, valeur: camp.pv - avant, soin: true });
      break;
    }
    case 'pioche':
      ev.pioche = piocher(camp, 2);
      break;
    case 'renfort': {
      const place = placeLibre(camp);
      if (place >= 0) {
        const u = instancier(MILICIEN);
        camp.terrain[place] = u;
        ev.uid = u.uid;
      } else ev.complet = true;
      break;
    }
    case 'benediction':
    case 'grace': {
      const bonus = info.q === 'grace' ? 2 : 1;
      unites(camp).forEach((u) => {
        u.a += bonus; u.h += bonus; u.hMax += bonus;
        ev.touches.push({ camp: qui, uid: u.uid, valeur: bonus, buff: true });
      });
      break;
    }
    default: break;
  }
  p.jets.unshift({ qui, de, q: info.q, label: info.label, quoi: 'Jet du Destin', destin: true });
  p.jets.length = Math.min(p.jets.length, 8);
  ev.morts = nettoyer(p);
  return ev;
}


// ---------------------------------------------------------------------
//  IA : renvoie la prochaine action de l'Ombre, ou null pour finir le tour
//  { type: 'jouer', index, cible } | { type: 'destin' } | { type: 'attaque', uid, cible }
//  | { type: 'defausser', index } | { type: 'mediter' } | { type: 'placer', index }
//  Elle suit les mêmes règles que le joueur.
//  difficulte : 'facile' (oublie parfois une carte, vise au hasard, Destin rare),
//               'normal' (le jeu habituel), 'difficile' (Destin plus souvent ; les boss
//               ont en plus des PV et de l'énergie en bonus, voir creerPartie)
// ---------------------------------------------------------------------
const CHANCE_DESTIN = { facile: 0.15, normal: 0.5, difficile: 0.75 };

// Renvoi de main de l'IA : les cartes trop chères pour les premiers tours (coût 5 ou plus)
export function choixRenvoiIA(camp) {
  return camp.main.map((c, i) => (c.c >= 5 ? i : -1)).filter((i) => i >= 0);
}

export function ai(p, qui = 'adverse', difficulte = 'normal') {
  const camp = p.camps[qui];
  const adv = p.camps[autre(qui)];
  const ennemis = unites(adv);
  const facile = difficulte === 'facile';

  // 0. Méditation en cours : la carte la plus chère qu'elle ne pourra pas jouer bientôt part dessous
  if (camp.meditation) {
    const loin = camp.meditation
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.c > Math.min(ENERGIE_MAX, camp.energieMax + 2))
      .sort((x, y) => y.c.c - x.c.c)[0];
    return { type: 'placer', index: loin ? loin.i : null };
  }

  // 1. Victoire immédiate avec un sort sur le héros
  const fatal = camp.main.findIndex((c, i) => c.fx === 'face' && c.v >= adv.pv && peutJouer(p, qui, i));
  if (fatal >= 0) return { type: 'jouer', index: fatal };

  // 2. Cartes, de la plus chère à la moins chère, si elles servent à quelque chose
  const ordre = camp.main.map((c, i) => ({ c, i })).filter(({ i }) => peutJouer(p, qui, i)).sort((x, y) => y.c.c - x.c.c);
  // Facile : une fois sur quatre, l'IA « oublie » ses cartes et passe aux attaques
  const oublie = facile && Math.random() < 0.25;
  for (const { c, i } of oublie ? [] : ordre) {
    if (c.t === 'u') return { type: 'jouer', index: i };
    if (c.fx === 'unit') {
      // de préférence une unité qu'il tue, la plus menaçante
      const tues = ennemis.filter((u) => u.h <= c.v).sort((a, b) => b.a - a.a);
      const cible = tues[0] ?? (c.v >= 4 ? [...ennemis].sort((a, b) => b.a - a.a)[0] : null);
      if (cible) return { type: 'jouer', index: i, cible: { camp: autre(qui), uid: cible.uid } };
      continue;
    }
    if (c.fx === 'buff' || c.fx === 'rage') {
      const u = [...unites(camp)].sort((a, b) => (b.a + b.h) - (a.a + a.h))[0];
      return { type: 'jouer', index: i, cible: { camp: qui, uid: u.uid } };
    }
    if (c.fx === 'ready') {
      const u = unites(camp).filter((x) => x.aAttaque && x.a > 0).sort((a, b) => b.a - a.a)[0];
      return { type: 'jouer', index: i, cible: { camp: qui, uid: u.uid } };
    }
    if (c.fx === 'talisman' && (camp.bonusDe || !unites(camp).some(peutAttaquer))) continue;
    if (c.fx === 'jeton' && (camp.reduction || !camp.main.some((x) => x !== c && x.c > camp.energie && x.c - c.v <= camp.energie))) continue;
    if (c.fx === 'aoe' && ennemis.length < 2) continue;
    if (c.fx === 'heal' && camp.pv > camp.pvMax - c.v) continue;
    if (c.fx === 'draw' && camp.main.length > 5) continue;
    return { type: 'jouer', index: i };
  }

  // 3. Le Destin, plus ou moins souvent selon la difficulté, s'il reste de l'énergie
  if (peutDestin(p, qui) && camp.pv > 3 && Math.random() < (CHANCE_DESTIN[difficulte] ?? 0.5)) return { type: 'destin' };

  // 4. Attaques
  const pretes = unites(camp).filter(peutAttaquer).sort((a, b) => b.a - a.a);
  for (const u of pretes) {
    const cibles = ciblesAttaque(p, qui);
    const unitesCibles = cibles.filter((c) => !c.heros).map((c) => trouver(adv, c.uid));
    const heros = cibles.find((c) => c.heros);
    // Facile : une cible au hasard, sans calcul
    if (facile) return { type: 'attaque', uid: u.uid, cible: cibles[Math.floor(Math.random() * cibles.length)] };
    // Garde : il faut la frapper, la plus fragile d'abord
    if (!heros) {
      const g = unitesCibles.sort((a, b) => a.h - b.h)[0];
      return { type: 'attaque', uid: u.uid, cible: { camp: autre(qui), uid: g.uid } };
    }
    // Échange favorable : tuer une unité dangereuse sans mourir
    const echange = unitesCibles
      .filter((t) => t.h <= u.a && t.a < u.h && t.a >= 2)
      .sort((a, b) => b.a - a.a)[0];
    if (echange && adv.pv > u.a) return { type: 'attaque', uid: u.uid, cible: { camp: autre(qui), uid: echange.uid } };
    return { type: 'attaque', uid: u.uid, cible: heros };
  }

  // 5. Énergie restante : défausser une carte injouable avant longtemps, ou méditer
  if (!facile && peutDefausser(p, qui) && !camp.main.some((c, i) => peutJouer(p, qui, i))) {
    const lourde = camp.main.map((c, i) => ({ c, i })).filter(({ c }) => c.c > camp.energieMax + 2).sort((x, y) => y.c.c - x.c.c)[0];
    if (lourde) return { type: 'defausser', index: lourde.i };
  }
  if (!facile && peutMediter(p, qui) && camp.deck.length >= 3) return { type: 'mediter' };
  return null;
}
