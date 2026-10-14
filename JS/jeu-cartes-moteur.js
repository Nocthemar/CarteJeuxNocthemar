// =====================================================================
//  Duel des Couronnes — règles du jeu (aucun affichage ici)
//  Faire tomber les 20 PV du héros adverse avant que les siens ne tombent.
//
//  Le tour : 1 énergie de plus par tour (10 au plus), rechargée à chaque tour, et des ACTIONS :
//  2 par tour, 3 à partir du tour 5. Une action sert à :
//    - jouer une carte (les Transcendantes demandent 2 actions et un allié déjà en jeu) ;
//    - attaquer avec une unité (une fois par tour chacune) ;
//    - défendre avec une unité : +2 Défense et Riposte jusqu'à ton prochain tour (elle n'attaque pas) ;
//    - activer la capacité d'une grande carte (une fois par tour, parfois de l'énergie en plus).
//  Sans action : le Jet du Destin (2 énergie), Défausser et Méditer (1 énergie chacun), une fois par tour chacun.
//
//  Les unités ont Attaque / Défense / PV. Attaquer : d20 + Attaque contre 8 + Défense de la cible
//  (héros : Défense 2). Sous le seuil, un dé de 5 ou plus fait une Éraflure (1 dégât). 20 naturel = critique (touche toujours, dégâts doublés) ; 1 naturel = échec
//  critique (raté, l'attaquant est exposé : -2 Défense jusqu'à son prochain tour).
//  Capacités (CAPACITES) : Garde, Provocation, Charge, Riposte, Interception, Esquive, Bouclier,
//  Soin, Inspiration, Percée, Drain. Certaines agissent pendant le tour adverse (réactions).
//  Plus une carte est rare, plus elle change le combat : capacités, puis capacités uniques (UNIQUES).
//  Chaque duel se joue sur un TERRAIN (TERRAINS) qui change une petite règle.
//  Le Jet du Destin a 20 résultats différents (DESTIN).
//
//  - 5 emplacements de troupes par camp, 7 cartes en main au plus
//  - Le Grimoire : 20 cartes (2 exemplaires au plus d'une carte, 1 seul d'une Transcendante,
//    2 Transcendantes et 4 objets au plus), complété par des cartes de base, mélangé au début
//  - Début : 3 cartes pour celui qui commence, 4 pour l'autre, puis un renvoi de main (une fois)
//  - 1 carte piochée par tour ; main pleine (7) : la carte piochée est brûlée (Tombeau)
//  - Le Tombeau : troupes mortes, sorts joués, cartes brûlées et défaussées (visible des deux joueurs)
//  - Épuisement : piocher dans un Grimoire vide coûte 1 PV, puis 2, puis 3…
//  Le duel se joue entièrement dans le navigateur. Seul le mode Histoire donne des
//  récompenses, et c'est le serveur qui les vérifie (valider_niveau_histoire, SQL/mode_histoire.sql).
// =====================================================================

export const PV_HEROS = 20;
export const DEFENSE_HEROS = 2;     // seuil pour toucher un héros : 8 + 2 = 10
export const SEUIL_BASE = 8;        // seuil pour toucher : 8 + Défense de la cible
export const ENERGIE_MAX = 10;
export const PLACES = 5;
export const MAIN_MAX = 7;          // une carte piochée main pleine est brûlée
export const MAIN_DEPART = 3;       // le second joueur pioche une carte de plus
export const COUT_DESTIN = 2;
export const COUT_DEFAUSSE = 1;     // défausser une carte de sa main (une fois par tour)
export const COUT_MEDITER = 1;      // regarder les 3 premières cartes du Grimoire (une fois par tour)
export const TAILLE_DECK = 20;      // le Grimoire
export const COPIES_MAX = 2;        // exemplaires au plus d'une même carte
export const TRANSCENDANTES_MAX = 2;   // Transcendantes au plus dans le Grimoire (1 exemplaire de chacune)
export const OBJETS_MAX = 4;        // objets de pouvoir au plus dans le Grimoire
export const UNITES_PAR_DECK = TAILLE_DECK;
export const BONUS_DEFENSE = 2;     // posture défensive
export const MALUS_EXPOSE = 2;      // après un échec critique

// Actions par tour : 2, puis 3 à partir du tour 5 (la partie monte en puissance)
export const actionsDuTour = (tour) => (tour >= 5 ? 3 : 2);

// ---------------------------------------------------------------------
//  Les capacités (mots-clés), affichées sur les cartes et dans la loupe
// ---------------------------------------------------------------------
export const CAPACITES = {
  garde:        { nom: 'Garde',        texte: 'Tant qu’elle est en jeu, ton héros ne peut pas être attaqué.' },
  provocation:  { nom: 'Provocation',  texte: 'Les attaques adverses doivent la viser en premier.' },
  charge:       { nom: 'Charge',       texte: 'Peut attaquer dès le tour où elle est posée.' },
  riposte:      { nom: 'Riposte',      texte: 'Réaction : attaquée et encore debout, elle rend son Attaque à l’attaquant.', reaction: true },
  interception: { nom: 'Interception', texte: 'Réaction : une fois par tour adverse, elle s’interpose quand ton héros est attaqué.', reaction: true },
  esquive:      { nom: 'Esquive',      texte: 'Réaction : la première attaque qui la vise à chaque tour adverse lance deux d20 et garde le plus bas.', reaction: true },
  bouclier:     { nom: 'Bouclier',     texte: 'Réaction : annule entièrement les premiers dégâts qu’elle subit (une seule fois).', reaction: true },
  soin:         { nom: 'Soin',         texte: 'Au début de ton tour, rend 2 PV à ton unité la plus blessée, sinon à ton héros.' },
  inspiration:  { nom: 'Inspiration',  texte: 'Tes autres unités ont +1 Attaque.' },
  percee:       { nom: 'Percée',       texte: 'Ignore Garde et Provocation : peut viser qui elle veut.' },
  drain:        { nom: 'Drain',        texte: 'Les dégâts qu’elle inflige soignent ton héros d’autant.' },
};

// La capacité donnée par chaque Veine (attaques des cartes du catalogue)
const CAP_VEINE = {
  trone: 'inspiration', chaine: 'provocation', forge: 'bouclier', racine: 'soin', esprit: 'soin',
  bete: 'charge', sang: 'drain', maree: 'riposte', tombeau: 'riposte', ombre: 'esquive',
  regard: 'percee', reve: 'interception', destin: 'bouclier',
};

// ---------------------------------------------------------------------
//  Les cartes
// ---------------------------------------------------------------------
// Unités : les cartes du catalogue (table cards). Coût / Attaque / Défense / PV de base selon la rareté,
// ajustés par le rang (Rang I = le plus fort) et la puissance moyenne des attaques.
//   act : actions pour la jouer ; condition 'allie' : il faut déjà une de tes unités en jeu
const BASE = {
  commune:       { c: 2, a: 2, d: 1, h: 3 },
  eveillee:      { c: 3, a: 3, d: 2, h: 4 },
  mythique:      { c: 4, a: 3, d: 3, h: 5 },
  legendaire:    { c: 5, a: 4, d: 4, h: 7 },
  transcendante: { c: 7, a: 5, d: 4, h: 8, act: 2, condition: 'allie' },
};

const puissance = (p) => (p === '∞' ? 120 : Number.isFinite(Number(p)) ? Number(p) : 50);
const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function uniteDepuisCarte(carte) {
  const rarete = BASE[carte.rarity] ? carte.rarity : 'commune';
  const b = BASE[rarete];
  let { c, a, d, h } = b;
  if (carte.rank === 1) { a += 1; h += 1; }
  else if (carte.rank === 2) h += 1;

  const attaques = [carte.attack_1, carte.attack_2].filter((x) => x?.nom);
  const moyenne = attaques.length ? attaques.reduce((s, x) => s + puissance(x.puissance), 0) / attaques.length : 50;
  if (moyenne >= 80) { a += 1; h = Math.max(1, h - 1); }
  else if (moyenne <= 35) { a = Math.max(1, a - 1); d += 1; }

  // Capacités : aucune pour une commune, celle de la 1re Veine pour une éveillée,
  // celles des deux Veines à partir de mythique (une seule si les deux sont pareilles : +1 Défense)
  const veines = attaques.map((x) => x.veine).filter(Boolean);
  const caps = [];
  if (rarete !== 'commune') {
    const liste = rarete === 'eveillee' ? veines.slice(0, 1) : veines;
    for (const v of liste) { const k = CAP_VEINE[v]; if (k && !caps.includes(k)) caps.push(k); }
    if (rarete !== 'eveillee' && veines.length > 1 && caps.length === 1) d += 1;
  }
  // Capacité unique : par le nom de la carte, sinon celle de sa rareté (légendaire, transcendante)
  const unique = UNIQUE_PAR_NOM[sansAccents(carte.name)]
    ?? (rarete === 'legendaire' ? 'presence' : rarete === 'transcendante' ? 'fracas' : null);

  return {
    id: `c${carte.id}`, n: carte.name, c, t: 'u', a, d, h, caps, veine: veines[0] ?? null,
    act: b.act ?? 1, condition: b.condition ?? null, unique, carte,
  };
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

// Troupes du Codex : soldats, gardes, bêtes… (illustration low poly). Elles complètent le Grimoire
export const TROUPES = [
  { id: 't-ecuyer',     n: 'Écuyer de la Couronne', c: 1, t: 'u', a: 1, d: 1, h: 2, caps: [],               veine: 'trone',  icone: 'epee' },
  { id: 't-garde',      n: 'Garde du Pont',         c: 2, t: 'u', a: 1, d: 3, h: 3, caps: ['garde'],        veine: 'forge',  icone: 'bouclier' },
  { id: 't-archer',     n: 'Archer des Remparts',   c: 2, t: 'u', a: 2, d: 1, h: 2, caps: ['percee'],       veine: 'regard', icone: 'arc' },
  { id: 't-loup',       n: 'Loup des Cendres',      c: 2, t: 'u', a: 3, d: 1, h: 1, caps: ['charge'],       veine: 'ombre',  icone: 'croc' },
  { id: 't-chevalier',  n: 'Chevalier errant',      c: 3, t: 'u', a: 3, d: 2, h: 3, caps: [],               veine: 'trone',  icone: 'epee' },
  { id: 't-cavalier',   n: 'Cavalier de la Marche', c: 3, t: 'u', a: 3, d: 1, h: 2, caps: ['charge'],       veine: 'maree',  icone: 'lance' },
  { id: 't-sentinelle', n: 'Sentinelle de pierre',  c: 4, t: 'u', a: 2, d: 4, h: 5, caps: ['provocation'],  veine: 'racine', icone: 'bouclier' },
  { id: 't-lancier',    n: 'Lancier des Ruines',    c: 4, t: 'u', a: 4, d: 2, h: 4, caps: ['riposte'],      veine: 'sang',   icone: 'lance' },
];

// Renfort du Jet du Destin
export const MILICIEN = { id: 'milicien', n: 'Milicien de la Couronne', c: 1, t: 'u', a: 2, d: 1, h: 2, caps: [], veine: null, icone: 'epee' };

// ---------------------------------------------------------------------
//  Capacités uniques des grandes cartes (inventées pour l'instant : à ajuster)
//  arrivee(p, qui, u, ev) : à la pose ; actif : { nom, texte, cout (énergie), cible: 'ennemi'|'allie'|null, effet, utile (l'IA ne s'en sert que si utile() est vrai) }
//  Une capacité active coûte 1 action, une fois par tour.
// ---------------------------------------------------------------------
const UNIQUE_PAR_NOM = {
  'kaeliss': 'kaeliss',
  'dalek': 'dalek',
  'maitre du jeu': 'maitre',
  'elfe des neiges doree': 'blizzard',
};

export const UNIQUES = {
  kaeliss: {
    nom: 'Cœur Immuable',
    texte: 'À son arrivée, ton héros récupère 4 PV.',
    arrivee(p, qui, u, ev) { soignerHeros(p.camps[qui], 4, qui, ev); },
    actif: {
      nom: 'Maître du Flot', cout: 2, cible: 'ennemi',
      texte: '1 action et 2 énergie : inflige 3 dégâts à une unité adverse ; Kaéliss récupère autant de PV.',
      effet(p, qui, u, cible, ev) {
        const t = trouver(p.camps[autre(qui)], cible.uid);
        blesser(p, autre(qui), t, 3, ev, qui);
        const avant = u.h;
        u.h = Math.min(u.hMax, u.h + 3);
        if (u.h > avant) ev.touches.push({ camp: qui, uid: u.uid, valeur: u.h - avant, soin: true });
      },
    },
  },
  dalek: {
    nom: 'Seigneur des Rêves',
    texte: 'À son arrivée, endort l’unité adverse la plus forte : elle ne pourra ni attaquer ni défendre à son prochain tour.',
    arrivee(p, qui, u, ev) {
      const t = [...unites(p.camps[autre(qui)])].sort((x, y) => y.a - x.a)[0];
      if (t) { t.gele = 1; ev.touches.push({ camp: autre(qui), uid: t.uid, texte: 'Endormie', etat: true }); }
    },
    actif: {
      nom: 'Marcheur d’Esprit', cout: 2, cible: null,
      utile: (p, qui) => p.camps[qui].main.length <= 4,
      texte: '1 action et 2 énergie : pioche 2 cartes.',
      effet(p, qui, u, cible, ev) { ev.pioche = piocher(p.camps[qui], 2); },
    },
  },
  maitre: {
    nom: 'Coup du Sort',
    texte: 'À son arrivée, lance un Jet du Destin gratuit : deux d20, le meilleur est gardé.',
    arrivee(p, qui, u, ev) {
      const de = Math.max(d20(), d20());
      ev.destin = { de, info: destinInfo(de) };
      appliquerDestin(p, qui, de, ev);
    },
    actif: {
      nom: 'Plume du Codex', cout: 3, cible: null,
      utile: (p, qui, u) => p.camps[qui].actions >= 2 && !p.camps[qui].prochainCritique && unites(p.camps[qui]).some((x) => x !== u && peutAttaquer(x) && x.a >= 3),
      texte: '1 action et 3 énergie : ton prochain jet d’attaque est un 20 naturel.',
      effet(p, qui, u, cible, ev) {
        p.camps[qui].prochainCritique = true;
        ev.touches.push({ camp: qui, heros: true, texte: 'Prochain jet : 20 !', buff: true });
      },
    },
  },
  blizzard: {
    nom: 'Blizzard d’Erynedhal',
    texte: 'À son arrivée, gèle toutes les unités adverses : elles ne pourront ni attaquer ni défendre à leur prochain tour.',
    arrivee(p, qui, u, ev) {
      unites(p.camps[autre(qui)]).forEach((t) => { t.gele = 1; ev.touches.push({ camp: autre(qui), uid: t.uid, texte: 'Gelée', etat: true }); });
    },
  },
  // Légendaires sans capacité propre
  presence: {
    nom: 'Présence',
    texte: 'À son arrivée, tes autres unités gagnent +1 Attaque pour de bon.',
    arrivee(p, qui, u, ev) {
      unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => { x.a += 1; ev.touches.push({ camp: qui, uid: x.uid, texte: '+1 Attaque', buff: true }); });
    },
  },
  // Transcendantes sans capacité propre
  fracas: {
    nom: 'Entrée fracassante',
    texte: 'À son arrivée, inflige 2 dégâts à toutes les unités adverses.',
    arrivee(p, qui, u, ev) { unites(p.camps[autre(qui)]).forEach((t) => blesser(p, autre(qui), t, 2, ev, qui)); },
  },
};

// ---------------------------------------------------------------------
//  Les terrains : chaque duel se joue sur l'un d'eux, qui change une petite règle
//  (noms et effets à ajuster)
// ---------------------------------------------------------------------
export const TERRAINS = {
  pravorn:   { nom: 'Lices de Pravorn',        texte: 'Terre de tournois : les unités avec Charge ont +1 Attaque.' },
  erynedhal: { nom: 'Neiges d’Erynedhal',      texte: 'Le froid engourdit les bras : un jet de 1 ou 2 est un échec critique.' },
  aelkor:    { nom: 'Bibliothèques d’Aelkor',  texte: 'La magie y coule à flots : les sorts et les objets coûtent 1 énergie de moins.' },
  vharos:    { nom: 'Remparts de Vharos',      texte: 'Une forteresse : toutes les unités ont +1 Défense.' },
  marais:    { nom: 'Marais de Brume',         texte: 'La vase ralentit tout : Charge ne fait plus effet, chaque unité attend son tour.' },
  ruines:    { nom: 'Ruines hantées',          texte: 'Les morts murmurent : quand une unité meurt, son camp pioche une carte.' },
};
export const TERRAINS_IDS = Object.keys(TERRAINS);
export const terrainDe = (p) => TERRAINS[p?.terrainId] ?? null;

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

// Limites du Grimoire : 2 exemplaires d'une carte, 1 seul d'une Transcendante, 2 Transcendantes, 4 objets
export const estObjet = (c) => !!c && OBJETS.some((o) => o.id === c.id);
export const estTranscendante = (c) => c?.carte?.rarity === 'transcendante';
export const copiesMax = (c) => (estTranscendante(c) ? 1 : COPIES_MAX);
// La carte c peut-elle encore entrer dans la liste (sans dépasser les limites) ?
export function peutAjouter(liste, c) {
  if (!c || liste.length >= TAILLE_DECK) return false;
  if (liste.filter((x) => x.id === c.id).length >= copiesMax(c)) return false;
  if (estObjet(c) && liste.filter(estObjet).length >= OBJETS_MAX) return false;
  if (estTranscendante(c) && liste.filter(estTranscendante).length >= TRANSCENDANTES_MAX) return false;
  return true;
}

// Le Grimoire d'un joueur : les cartes choisies (dans l'ordre, avec répétitions pour les
// exemplaires), dans les limites, puis complété avec les cartes de base jusqu'à TAILLE_DECK.
// Renvoie la liste (non mélangée).
export function grimoire(cartes = []) {
  const liste = [];
  const ajouter = (c) => { if (!peutAjouter(liste, c)) return false; liste.push(c); return true; };
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

// Coût réel d'une carte : le Jeton du marchand réduit la suivante ; le terrain d'Aelkor fait payer 1 de moins
// les sorts et les objets. camp.terrainId : le terrain du duel (recopié dans chaque camp)
export function coutDe(camp, carte) {
  if (carte.fx === 'jeton') return carte.c;
  let cout = carte.c - (camp.reduction ?? 0);
  if (carte.t === 's' && camp.terrainId === 'aelkor') cout -= 1;
  return Math.max(0, cout);
}
// Actions pour jouer une carte
export const actionsDe = (carte) => carte?.act ?? 1;
// Capacités d'une carte ou d'une unité
export const capsDe = (x) => x?.caps ?? [];
export const aCap = (x, k) => capsDe(x).includes(k);   // x (carte ou unité) a-t-elle la capacité k ?

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

// Résultats d'un jet d'attaque (d20 + Attaque contre le seuil : 8 + Défense de la cible)
export const JETS = [
  { q: 'echec',    jet: '1 naturel',        label: 'Échec critique', texte: 'Raté, et l’attaquant est exposé : -2 Défense jusqu’à son prochain tour.' },
  { q: 'faible',   jet: '2 à 4, sous le seuil', label: 'Raté',        texte: 'Aucun dégât.' },
  { q: 'eraflure', jet: '5 ou plus, sous le seuil', label: 'Éraflure', texte: 'Le coup passe de justesse : 1 dégât.' },
  { q: 'normal',   jet: 'seuil atteint',    label: 'Touché',         texte: 'Dégâts = Attaque.' },
  { q: 'solide',   jet: 'seuil + 5',        label: 'Coup solide',    texte: '+1 dégât.' },
  { q: 'critique', jet: '20 naturel',       label: 'Critique !',     texte: 'Touche toujours, dégâts doublés.' },
];
export const rollInfo = (q) => JETS.find((j) => j.q === q);

// Jet du Destin : 20 résultats, des plus funestes aux plus glorieux
export const DESTIN = [
  { min: 1,  max: 1,  q: 'malediction', label: 'Malédiction',     texte: 'Ton héros subit 3 dégâts.' },
  { min: 2,  max: 2,  q: 'trahison',    label: 'Trahison',        texte: 'Une de tes unités, au hasard, subit 2 dégâts.' },
  { min: 3,  max: 3,  q: 'brouillard',  label: 'Brouillard',      texte: 'Une carte de ta main, au hasard, part au Tombeau.' },
  { min: 4,  max: 4,  q: 'presage',     label: 'Mauvais présage', texte: 'Ton prochain jet d’attaque a -3.' },
  { min: 5,  max: 6,  q: 'soin',        label: 'Soin',            texte: 'Ton héros récupère 4 PV.' },
  { min: 7,  max: 7,  q: 'eclair',      label: 'Éclair',          texte: 'Une unité adverse, au hasard, subit 3 dégâts.' },
  { min: 8,  max: 9,  q: 'pioche',      label: 'Pioche',          texte: 'Tu pioches 2 cartes.' },
  { min: 10, max: 10, q: 'fortune',     label: 'Fortune',         texte: 'Tu gagnes 2 énergie ce tour.' },
  { min: 11, max: 11, q: 'souffle',     label: 'Second souffle',  texte: 'Tu gagnes 1 action ce tour.' },
  { min: 12, max: 13, q: 'renfort',     label: 'Renfort',         texte: 'Un Milicien de la Couronne (2/1/2) rejoint tes rangs.' },
  { min: 14, max: 14, q: 'armure',      label: 'Armure bénie',    texte: 'Tes unités gagnent +1 Défense pour de bon.' },
  { min: 15, max: 15, q: 'tempete',     label: 'Tempête',         texte: 'Toutes les unités adverses subissent 1 dégât.' },
  { min: 16, max: 16, q: 'prophetie',   label: 'Prophétie',       texte: 'Ton prochain jet d’attaque a +5.' },
  { min: 17, max: 17, q: 'benediction', label: 'Bénédiction',     texte: 'Tes unités gagnent +1/+1.' },
  { min: 18, max: 18, q: 'chatiment',   label: 'Châtiment',       texte: 'Le héros adverse subit 3 dégâts.' },
  { min: 19, max: 19, q: 'elan',        label: 'Élan héroïque',   texte: 'Tes unités qui ont déjà agi peuvent agir à nouveau ce tour.' },
  { min: 20, max: 20, q: 'grace',       label: 'Grâce divine',    texte: 'Tes unités gagnent +2/+2 et ton héros récupère 3 PV.' },
];
export const destinInfo = (de) => DESTIN.find((j) => de >= j.min && de <= j.max);


// ---------------------------------------------------------------------
//  La partie
// ---------------------------------------------------------------------
let compteur = 0;
const instancier = (def) => ({
  uid: ++compteur, def, n: def.n, a: def.a, d: def.d ?? 1, h: def.h, hMax: def.h, caps: [...capsDe(def)],
  prete: aCap(def, 'charge'), aAttaque: false, defend: false, expose: false, gele: 0, bloquee: false,
  bouclier: aCap(def, 'bouclier'), esquiveUtilisee: false, interceptionUtilisee: false, capaciteUtilisee: false,
});

function creerCamp(nom, deck) {
  return {
    nom, pv: PV_HEROS, pvMax: PV_HEROS,
    energie: 0, energieMax: 0, actions: 0, actionsMax: 0, destinUtilise: false,
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
//   terrain             le terrain du duel (TERRAINS) ; au hasard s'il manque
// La partie commence par le renvoi de main : p.renvoi[qui] passe à true quand le joueur a choisi
// (renvoyerMain), et le premier tour ne commence qu'une fois les deux renvois faits (renvoiFini).
export function creerPartie(deckJoueur, deckAdverse, nomJoueur, nomAdverse, premier, options = {}) {
  const auHasard = (liste) => liste[Math.floor(Math.random() * liste.length)];
  const terrainId = TERRAINS[options.terrain] ? options.terrain : auHasard(TERRAINS_IDS);
  const p = {
    camps: { joueur: creerCamp(nomJoueur, melanger(deckJoueur)), adverse: creerCamp(nomAdverse, melanger(deckAdverse)) },
    actif: premier, tour: 0, fini: null, terrainId,
    renvoi: { joueur: false, adverse: false },
    jets: [],   // historique des derniers jets (affichage)
  };
  p.camps.joueur.terrainId = p.camps.adverse.terrainId = terrainId;
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
  const renvoyees = choisis.sort((x, y) => y - x).map((i) => camp.main.splice(i, 1)[0]);
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
  const qui = p.actif;
  const camp = p.camps[qui];
  if (qui === 'joueur' || p.tour === 0) p.tour += 1;
  camp.energieMax = Math.min(ENERGIE_MAX, camp.energieMax + 1);
  camp.energie = Math.min(ENERGIE_MAX, camp.energieMax + (camp.energieBonus ?? 0));
  camp.actionsMax = actionsDuTour(p.tour);
  camp.actions = camp.actionsMax;
  camp.destinUtilise = false;
  camp.defausseUtilisee = false;
  camp.mediterUtilise = false;
  // Tes unités : prêtes, la posture défensive et l'exposition prennent fin ; une unité gelée
  // (ou endormie) passe ce tour sans agir
  unites(camp).forEach((u) => {
    u.prete = true; u.aAttaque = false; u.defend = false; u.expose = false; u.capaciteUtilisee = false;
    u.bloquee = u.gele > 0;
    u.gele = 0;
  });
  // Les réactions de l'adversaire se rechargent pour ce tour
  unites(p.camps[autre(qui)]).forEach((u) => { u.esquiveUtilisee = false; u.interceptionUtilisee = false; });

  const ev = { type: 'tour', qui, pioche: piocher(camp, 1), touches: [] };
  // Soin : au début de ton tour, 2 PV à ton unité la plus blessée, sinon à ton héros
  unites(camp).filter((u) => aCap(u, 'soin')).forEach(() => {
    const blessee = unites(camp).filter((x) => x.h < x.hMax).sort((x, y) => (y.hMax - y.h) - (x.hMax - x.h))[0];
    if (blessee) {
      const avant = blessee.h;
      blessee.h = Math.min(blessee.hMax, blessee.h + 2);
      ev.touches.push({ camp: qui, uid: blessee.uid, valeur: blessee.h - avant, soin: true });
    } else soignerHeros(camp, 2, qui, ev);
  });
  // Épuisement : Grimoire vide, le héros perd des PV (ev.fatigue = PV perdus)
  if (ev.pioche.epuisement) ev.fatigue = ev.pioche.epuisement;
  nettoyer(p);
  return ev;
}

export function finTour(p) {
  p.actif = autre(p.actif);
}

export const unites = (camp) => camp.terrain.filter(Boolean);
export const trouver = (camp, uid) => camp.terrain.find((u) => u?.uid === uid) ?? null;
const placeLibre = (camp) => camp.terrain.findIndex((u) => !u);
const libre = (p, qui) => p.actif === qui && !p.fini && !p.camps[qui].meditation;

// Attaque et Défense du moment : Inspiration, posture défensive, exposition,
// terrain (Pravorn : Charge +1 Attaque ; Vharos : +1 Défense)
export function attaqueDe(p, qui, u) {
  const inspirants = unites(p.camps[qui]).filter((x) => x !== u && aCap(x, 'inspiration')).length;
  const terrain = p?.terrainId === 'pravorn' && aCap(u, 'charge') ? 1 : 0;
  return Math.max(0, u.a + inspirants + terrain);
}
export function defenseDe(u, p = null) {
  const terrain = p?.terrainId === 'vharos' ? 1 : 0;
  return Math.max(0, u.d + (u.defend ? BONUS_DEFENSE : 0) - (u.expose ? MALUS_EXPOSE : 0) + terrain);
}
// Seuil pour toucher une cible ({ camp, uid } ou { camp, heros })
export function seuilDe(p, cible) {
  if (cible.heros) return SEUIL_BASE + DEFENSE_HEROS;
  const t = trouver(p.camps[cible.camp], cible.uid);
  return SEUIL_BASE + (t ? defenseDe(t, p) : 0);
}
// Chance de toucher (de 5 % à 95 % : 1 rate toujours, 20 touche toujours)
export function chanceDeToucher(p, qui, u, cible) {
  const besoin = seuilDe(p, cible) - attaqueDe(p, qui, u) - (p.camps[qui].bonusDe ?? 0);
  return Math.min(0.95, Math.max(0.05, (21 - besoin) / 20));
}

// Une carte peut-elle être jouée (énergie, actions, place, condition, cible) ?
export function peutJouer(p, qui, index) {
  const camp = p.camps[qui];
  const carte = camp.main[index];
  if (!carte || !libre(p, qui) || coutDe(camp, carte) > camp.energie || actionsDe(carte) > camp.actions) return false;
  if (carte.t === 'u') {
    if (carte.condition === 'allie' && !unites(camp).length) return false;
    return placeLibre(camp) >= 0;
  }
  if (carte.fx === 'unit') return unites(p.camps[autre(qui)]).length > 0;
  if (carte.fx === 'buff' || carte.fx === 'rage') return unites(camp).length > 0;
  if (carte.fx === 'ready') return unites(camp).some((u) => u.aAttaque && u.a > 0 && !u.bloquee);
  return true;
}
// Pourquoi une carte ne peut pas être jouée (aide du joueur), ou ''
export function raisonInjouable(p, qui, index) {
  const camp = p.camps[qui];
  const carte = camp.main[index];
  if (!carte) return '';
  if (coutDe(camp, carte) > camp.energie) return 'Pas assez d’énergie.';
  if (actionsDe(carte) > camp.actions) return actionsDe(carte) > 1 ? `Il faut ${actionsDe(carte)} actions.` : 'Plus d’action ce tour.';
  if (carte.t === 'u' && carte.condition === 'allie' && !unites(camp).length) return 'Il faut déjà une de tes unités en jeu.';
  if (carte.t === 'u' && placeLibre(camp) < 0) return 'Plus de place sur le terrain.';
  return '';
}

// Cibles d'un sort : null si le sort n'en demande pas
export function ciblesSort(p, qui, carte) {
  if (carte.fx === 'unit') return unites(p.camps[autre(qui)]).map((u) => ({ camp: autre(qui), uid: u.uid }));
  if (carte.fx === 'buff' || carte.fx === 'rage') return unites(p.camps[qui]).map((u) => ({ camp: qui, uid: u.uid }));
  if (carte.fx === 'ready') return unites(p.camps[qui]).filter((u) => u.aAttaque && u.a > 0 && !u.bloquee).map((u) => ({ camp: qui, uid: u.uid }));
  return null;
}

// Cibles d'une attaque :
// - Provocation : les attaques doivent viser ces unités d'abord ;
// - Garde : tant qu'une Garde est en jeu, le héros ne peut pas être visé ;
// - Percée (l'attaquant, uid) : ignore les deux.
export function ciblesAttaque(p, qui, uid = null) {
  const adv = autre(qui);
  const ennemis = unites(p.camps[adv]);
  const perce = uid != null && aCap(trouver(p.camps[qui], uid), 'percee');
  const provoc = perce ? [] : ennemis.filter((u) => aCap(u, 'provocation'));
  const liste = (provoc.length ? provoc : ennemis).map((u) => ({ camp: adv, uid: u.uid }));
  const garde = !perce && ennemis.some((u) => aCap(u, 'garde'));
  if (!provoc.length && !garde) liste.push({ camp: adv, heros: true });
  return liste;
}

export const peutAttaquer = (u) => !!u && u.prete && !u.aAttaque && !u.bloquee && u.a > 0;
export const peutDefendre = (u) => !!u && u.prete && !u.aAttaque && !u.bloquee && !u.defend;
const memeCible = (x, y) => x.camp === y.camp && (x.heros ? y.heros : x.uid === y.uid);

// Retire les unités détruites (elles vont au Tombeau, sauf le Milicien du Destin qui n'est pas
// une carte) et regarde si un héros est tombé
function nettoyer(p) {
  const morts = [];
  for (const qui of ['joueur', 'adverse']) {
    const camp = p.camps[qui];
    let tombes = 0;
    camp.terrain = camp.terrain.map((u) => {
      if (u && u.h <= 0) {
        morts.push(u.uid);
        tombes += 1;
        if (u.def && u.def.id !== MILICIEN.id) camp.tombeau.push(u.def);
        return null;
      }
      return u;
    });
    if (!tombes) continue;
    // Ruines hantées : le camp pioche une carte par unité tombée
    if (p.terrainId === 'ruines') piocher(camp, tombes);
  }
  if (p.camps.joueur.pv <= 0) p.fini = 'adverse';
  else if (p.camps.adverse.pv <= 0) p.fini = 'joueur';
  return morts;
}

// Dégâts à une unité (le Bouclier les annule une fois) ; ev.touches reçoit le coup
function blesser(p, campCible, t, degats, ev, source) {
  if (!t || degats <= 0) return 0;
  if (t.bouclier) {
    t.bouclier = false;
    ev.touches.push({ camp: campCible, uid: t.uid, texte: 'Bouclier !', etat: true });
    return 0;
  }
  t.h -= degats;
  if (source) p.camps[source].stats.degats += degats;
  ev.touches.push({ camp: campCible, uid: t.uid, valeur: degats });
  return degats;
}
function soignerHeros(camp, v, qui, ev) {
  const avant = camp.pv;
  camp.pv = Math.min(camp.pvMax, camp.pv + v);
  ev.touches.push({ camp: qui, heros: true, valeur: camp.pv - avant, soin: true });
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
  camp.actions -= actionsDe(carte);
  if (carte.fx !== 'jeton') camp.reduction = 0;   // la réduction du Jeton ne sert qu'une fois
  camp.stats.cartes += 1;
  const ev = { type: carte.t === 'u' ? 'pose' : 'sort', qui, carte, cible, index, touches: [] };   // index : pour l'animation (main -> plateau)

  if (carte.t === 'u') {
    const place = placeLibre(camp);
    const u = instancier(carte);
    if (p.terrainId === 'marais') u.prete = false;   // Marais de Brume : Charge sans effet
    camp.terrain[place] = u;
    ev.uid = u.uid;
    ev.place = place;
    // Capacité unique à l'arrivée
    const unique = UNIQUES[carte.unique];
    if (unique?.arrivee) {
      ev.effet = { nom: unique.nom, texte: unique.texte };
      unique.arrivee(p, qui, u, ev);
    }
    ev.morts = nettoyer(p);
    return ev;
  }
  cast(p, qui, carte, cible, ev);
  camp.tombeau.push(carte);   // un sort joué va au Tombeau
  ev.morts = nettoyer(p);
  return ev;
}

// ---------------------------------------------------------------------
//  Défendre (1 action) : l'unité se met en garde jusqu'à ton prochain tour :
//  +2 Défense et Riposte ; elle n'attaque pas ce tour
// ---------------------------------------------------------------------
export function defendre(p, qui, uid) {
  const camp = p.camps[qui];
  const u = trouver(camp, uid);
  if (!libre(p, qui) || camp.actions < 1 || !peutDefendre(u)) return null;
  camp.actions -= 1;
  u.defend = true;
  u.aAttaque = true;
  return { type: 'defense', qui, uid, n: u.n };
}

// ---------------------------------------------------------------------
//  Capacité active d'une grande carte (1 action, une fois par tour, parfois de l'énergie)
// ---------------------------------------------------------------------
export const capaciteActive = (u) => UNIQUES[u?.def?.unique]?.actif ?? null;
export function peutActiver(p, qui, uid) {
  const camp = p.camps[qui];
  const u = trouver(camp, uid);
  const act = capaciteActive(u);
  if (!act || !libre(p, qui) || camp.actions < 1 || u.capaciteUtilisee || u.bloquee || camp.energie < act.cout) return false;
  return act.cible !== 'ennemi' || unites(p.camps[autre(qui)]).length > 0;
}
export function ciblesCapacite(p, qui, uid) {
  const act = capaciteActive(trouver(p.camps[qui], uid));
  if (act?.cible === 'ennemi') return unites(p.camps[autre(qui)]).map((u) => ({ camp: autre(qui), uid: u.uid }));
  if (act?.cible === 'allie') return unites(p.camps[qui]).map((u) => ({ camp: qui, uid: u.uid }));
  return null;
}
export function activer(p, qui, uid, cible = null) {
  if (!peutActiver(p, qui, uid)) return null;
  const camp = p.camps[qui];
  const u = trouver(camp, uid);
  const act = capaciteActive(u);
  const cibles = ciblesCapacite(p, qui, uid);
  if (cibles && !cibles.some((c) => cible && memeCible(c, cible))) return null;
  camp.actions -= 1;
  camp.energie -= act.cout;
  u.capaciteUtilisee = true;
  const ev = { type: 'capacite', qui, uid, cible, nom: act.nom, texte: act.texte, n: u.n, veine: u.def.veine, touches: [] };
  act.effet(p, qui, u, cible, ev);
  ev.morts = nettoyer(p);
  return ev;
}

// ---------------------------------------------------------------------
//  Défausser (1 énergie, une fois par tour, sans action) : une carte de la main au Tombeau, on en pioche une
// ---------------------------------------------------------------------
export const peutDefausser = (p, qui) => {
  const camp = p.camps[qui];
  return libre(p, qui) && !camp.defausseUtilisee && camp.energie >= COUT_DEFAUSSE && camp.main.length > 0;
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
//  Méditer (1 énergie, une fois par tour, sans action) : le joueur regarde les 3 premières cartes de son
//  Grimoire (camp.meditation), puis en place une dessous ou n'en place aucune (placerSous).
//  Tant que le choix n'est pas fait, aucune autre action n'est possible.
// ---------------------------------------------------------------------
export const peutMediter = (p, qui) => {
  const camp = p.camps[qui];
  return libre(p, qui) && !camp.mediterUtilise && camp.energie >= COUT_MEDITER && camp.deck.length > 0;
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
  switch (carte.fx) {
    case 'unit':
      blesser(p, autre(qui), trouver(adverse, cible.uid), carte.v, ev, qui);
      break;
    case 'face':
      adverse.pv -= carte.v;
      camp.stats.degats += carte.v;
      ev.touches.push({ camp: autre(qui), heros: true, valeur: carte.v });
      break;
    case 'heal':
      soignerHeros(camp, carte.v, qui, ev);
      break;
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
      u.defend = false;
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
      unites(adverse).forEach((u) => blesser(p, autre(qui), u, carte.v, ev, qui));
      break;
    default: break;
  }
}

// Attaque montrée à l'écran (nom, Veine), sans effet sur les dégâts : sur un bon jet (15 ou plus),
// la plus puissante des deux attaques de la carte, sinon l'autre. null pour les troupes du Codex.
export function attaqueJouee(def, de) {
  const liste = [def?.carte?.attack_1, def?.carte?.attack_2].filter((x) => x?.nom);
  if (!liste.length) return null;
  const [faible, forte = faible] = [...liste].sort((x, y) => puissance(x.puissance) - puissance(y.puissance));
  const choisie = de >= 15 ? forte : faible;
  return { nom: choisie.nom, veine: choisie.veine ?? null };
}

// Attaque d'une unité (1 action) : d20 + Attaque contre 8 + Défense de la cible.
// Réactions de la défense : Interception (le héros visé est protégé), Esquive (deux d20, le plus bas),
// Bouclier (premiers dégâts annulés), Riposte (ou posture défensive) : l'Attaque rendue à l'attaquant.
export function attaquer(p, qui, uid, cible) {
  const camp = p.camps[qui];
  const adv = autre(qui);
  const adverse = p.camps[adv];
  const u = trouver(camp, uid);
  if (!libre(p, qui) || camp.actions < 1 || !peutAttaquer(u)) return null;
  if (!ciblesAttaque(p, qui, uid).some((c) => memeCible(c, cible))) return null;
  camp.actions -= 1;
  u.aAttaque = true;
  const ev = { type: 'attaque', qui, uid, cible, n: u.n, touches: [], riposte: 0 };

  // Interception : une unité adverse s'interpose devant son héros (une fois par tour adverse)
  if (cible.heros && !aCap(u, 'percee')) {
    const garde = unites(adverse).find((x) => aCap(x, 'interception') && !x.interceptionUtilisee);
    if (garde) {
      garde.interceptionUtilisee = true;
      ev.interception = { uid: garde.uid, n: garde.n };
      cible = { camp: adv, uid: garde.uid };
      ev.cible = cible;
    }
  }
  const t = cible.heros ? null : trouver(adverse, cible.uid);

  // Le jet : Esquive = deux d20, le plus bas ; Plume du Codex = 20 naturel
  let des = [d20()];
  if (t && aCap(t, 'esquive') && !t.esquiveUtilisee) { t.esquiveUtilisee = true; des.push(d20()); ev.esquive = true; }
  let de = Math.min(...des);
  if (camp.prochainCritique) { de = 20; des = [20]; camp.prochainCritique = false; }
  const bonus = camp.bonusDe ?? 0;
  camp.bonusDe = 0;
  const atk = attaqueDe(p, qui, u);
  const seuil = seuilDe(p, cible);
  const total = de + atk + bonus;
  const echec = de === 1 || (de === 2 && p.terrainId === 'erynedhal');
  // Sous le seuil : un dé de 5 ou plus fait quand même une Éraflure (1 dégât) ; de 2 à 4, c'est raté
  const q = echec ? 'echec' : de === 20 ? 'critique' : total >= seuil + 5 ? 'solide' : total >= seuil ? 'normal' : de >= 5 ? 'eraflure' : 'faible';
  const info = rollInfo(q);
  Object.assign(ev, { de, des, bonus, atk, total, seuil, info, attaque: attaqueJouee(u.def, de) });
  camp.stats.jets += 1;
  if (q === 'critique') camp.stats.critiques += 1;
  if (q === 'echec') camp.stats.echecs += 1;

  let degats = q === 'critique' ? atk * 2 : q === 'solide' ? atk + 1 : q === 'normal' ? atk : q === 'eraflure' ? Math.min(1, atk) : 0;
  if (q === 'echec') { u.expose = true; ev.expose = true; }

  if (degats > 0) {
    if (cible.heros) {
      adverse.pv -= degats;
      camp.stats.degats += degats;
    } else if (t.bouclier) {
      t.bouclier = false;
      ev.bouclier = true;
      degats = 0;
    } else {
      t.h -= degats;
      camp.stats.degats += degats;
    }
  }
  ev.degats = degats;
  // Drain : les dégâts infligés soignent le héros de l'attaquant
  if (degats > 0 && aCap(u, 'drain')) {
    const avant = camp.pv;
    camp.pv = Math.min(camp.pvMax, camp.pv + degats);
    ev.drain = camp.pv - avant;
  }
  // Riposte : la cible encore debout (Riposte, ou en posture défensive) rend son Attaque
  if (t && t.h > 0 && (aCap(t, 'riposte') || t.defend) && t.a > 0) {
    const coup = attaqueDe(p, adv, t);
    if (u.bouclier) { u.bouclier = false; ev.bouclierAttaquant = true; }
    else { u.h -= coup; ev.riposte = coup; }
  }

  // Esquive : les deux dés sont gardés dans l'historique (le plus bas compte)
  const esquive = des.length > 1 ? `Esquive : ${des.join(' et ')} · ` : '';
  p.jets.unshift({ qui, de, q, label: info.label, quoi: `${u.n} attaque`, detail: `${esquive}${total} contre ${seuil}` });
  p.jets.length = Math.min(p.jets.length, 8);
  ev.morts = nettoyer(p);
  return ev;
}

// Jet du Destin : 2 énergie, sans action, une fois par tour
export const peutDestin = (p, qui) => libre(p, qui) && !p.camps[qui].destinUtilise
  && p.camps[qui].energie >= COUT_DESTIN;

// Effet d'un Jet du Destin (aussi lancé par le Maître du Jeu)
function appliquerDestin(p, qui, de, ev) {
  const camp = p.camps[qui];
  const adv = autre(qui);
  const info = destinInfo(de);
  const auHasard = (liste) => liste[Math.floor(Math.random() * liste.length)];
  switch (info.q) {
    case 'malediction':
      camp.pv -= 3;
      ev.touches.push({ camp: qui, heros: true, valeur: 3 });
      break;
    case 'trahison': {
      const u = auHasard(unites(camp));
      if (u) blesser(p, qui, u, 2, ev, null);
      break;
    }
    case 'brouillard': {
      if (camp.main.length) {
        const [carte] = camp.main.splice(Math.floor(Math.random() * camp.main.length), 1);
        camp.tombeau.push(carte);
        ev.touches.push({ camp: qui, heros: true, texte: `${carte.n} part au Tombeau`, etat: true });
      }
      break;
    }
    case 'presage':
      camp.bonusDe = (camp.bonusDe ?? 0) - 3;
      ev.touches.push({ camp: qui, heros: true, texte: '-3 au prochain jet', etat: true });
      break;
    case 'eclair': {
      const u = auHasard(unites(p.camps[adv]));
      if (u) blesser(p, adv, u, 3, ev, qui);
      break;
    }
    case 'fortune':
      camp.energie = Math.min(ENERGIE_MAX + 2, camp.energie + 2);
      ev.touches.push({ camp: qui, heros: true, texte: '+2 énergie', buff: true });
      break;
    case 'souffle':
      camp.actions += 1;
      ev.touches.push({ camp: qui, heros: true, texte: '+1 action', buff: true });
      break;
    case 'armure':
      unites(camp).forEach((u) => { u.d += 1; ev.touches.push({ camp: qui, uid: u.uid, texte: '+1 Défense', buff: true }); });
      break;
    case 'tempete':
      unites(p.camps[adv]).forEach((u) => blesser(p, adv, u, 1, ev, qui));
      break;
    case 'prophetie':
      camp.bonusDe = (camp.bonusDe ?? 0) + 5;
      ev.touches.push({ camp: qui, heros: true, texte: '+5 au prochain jet', buff: true });
      break;
    case 'chatiment':
      p.camps[adv].pv -= 3;
      camp.stats.degats += 3;
      ev.touches.push({ camp: adv, heros: true, valeur: 3 });
      break;
    case 'elan':
      unites(camp).filter((u) => u.aAttaque && !u.bloquee).forEach((u) => {
        u.aAttaque = false; u.defend = false; u.prete = true;
        ev.touches.push({ camp: qui, uid: u.uid, texte: 'De nouveau prête !', buff: true });
      });
      break;
    case 'soin':
      soignerHeros(camp, 4, qui, ev);
      break;
    case 'pioche':
      ev.pioche = piocher(camp, 2);
      break;
    case 'renfort': {
      const place = placeLibre(camp);
      if (place >= 0) {
        const u = instancier(MILICIEN);
        camp.terrain[place] = u;
        ev.renfort = u.uid;
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
      if (info.q === 'grace') soignerHeros(camp, 3, qui, ev);
      break;
    }
    default: break;
  }
  return info;
}

export function destin(p, qui) {
  if (!peutDestin(p, qui)) return null;
  const camp = p.camps[qui];
  camp.energie -= COUT_DESTIN;
  camp.destinUtilise = true;
  camp.stats.destins += 1;
  camp.stats.jets += 1;

  let de = d20();
  if (camp.bonusDe) { de = Math.max(1, Math.min(20, de + camp.bonusDe)); camp.bonusDe = 0; }
  if (de === 20) camp.stats.critiques += 1;
  if (de === 1) camp.stats.echecs += 1;
  const ev = { type: 'destin', qui, de, touches: [] };
  ev.info = appliquerDestin(p, qui, de, ev);
  ev.uid = ev.renfort;   // (le Milicien arrivé, pour son animation)
  p.jets.unshift({ qui, de, q: ev.info.q, label: ev.info.label, quoi: 'Jet du Destin', destin: true });
  p.jets.length = Math.min(p.jets.length, 8);
  ev.morts = nettoyer(p);
  return ev;
}


// ---------------------------------------------------------------------
//  IA : renvoie la prochaine action de l'Ombre, ou null pour finir le tour
//  { type: 'jouer', index, cible } | { type: 'destin' } | { type: 'attaque', uid, cible }
//  | { type: 'defendre', uid } | { type: 'capacite', uid, cible }
//  | { type: 'defausser', index } | { type: 'mediter' } | { type: 'placer', index }
//  Elle suit les mêmes règles que le joueur, avec ses actions du tour.
//  difficulte : 'facile' (oublie parfois une carte, vise au hasard, ne se défend pas, Destin rare),
//               'normal' (le jeu habituel), 'difficile' (Destin plus souvent ; les boss
//               ont en plus des PV et de l'énergie en bonus, voir creerPartie)
// ---------------------------------------------------------------------
const CHANCE_DESTIN = { facile: 0.15, normal: 0.4, difficile: 0.6 };

// Renvoi de main de l'IA : les cartes trop chères pour les premiers tours (coût 5 ou plus)
export function choixRenvoiIA(camp) {
  return camp.main.map((c, i) => (c.c >= 5 ? i : -1)).filter((i) => i >= 0);
}

// Valeur d'une attaque pour l'IA : dégâts espérés, unités tuées, riposte encaissée
function valeurAttaque(p, qui, u, cible) {
  const adv = autre(qui);
  const chance = chanceDeToucher(p, qui, u, cible);
  const atk = attaqueDe(p, qui, u);
  if (cible.heros) {
    const pv = p.camps[adv].pv;
    return chance * atk * (pv <= atk ? 6 : pv <= 8 ? 1.6 : 1.1);
  }
  const t = trouver(p.camps[adv], cible.uid);
  const tue = !t.bouclier && t.h <= atk;
  let v = chance * (tue ? 3 + t.a * 1.5 + t.hMax * 0.4 + (capsDe(t).length + (t.def.unique ? 2 : 0)) : (t.bouclier ? 0.5 : atk * 0.7));
  // Riposte si la cible survit
  if ((aCap(t, 'riposte') || t.defend) && (!tue || chance < 1)) {
    const coup = attaqueDe(p, adv, t);
    v -= (1 - chance * (tue ? 1 : 0)) * (coup >= u.h ? 2 + u.a * 1.5 : coup * 0.5);
  }
  return v;
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

  if (camp.actions > 0) {
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
        const tues = ennemis.filter((u) => u.h <= c.v && !u.bouclier).sort((x, y) => y.a - x.a);
        const cible = tues[0] ?? (c.v >= 4 ? [...ennemis].sort((x, y) => y.a - x.a)[0] : null);
        if (cible) return { type: 'jouer', index: i, cible: { camp: autre(qui), uid: cible.uid } };
        continue;
      }
      if (c.fx === 'buff' || c.fx === 'rage') {
        const u = [...unites(camp)].sort((x, y) => (y.a + y.h) - (x.a + x.h))[0];
        return { type: 'jouer', index: i, cible: { camp: qui, uid: u.uid } };
      }
      if (c.fx === 'ready') {
        if (camp.actions < 2) continue;   // il faut encore une action pour attaquer
        const u = unites(camp).filter((x) => x.aAttaque && x.a > 0 && !x.bloquee).sort((x, y) => y.a - x.a)[0];
        return { type: 'jouer', index: i, cible: { camp: qui, uid: u.uid } };
      }
      if (c.fx === 'talisman' && (camp.bonusDe || !unites(camp).some(peutAttaquer) || camp.actions < 2)) continue;
      if (c.fx === 'jeton' && (camp.reduction || !camp.main.some((x) => x !== c && x.c > camp.energie && x.c - c.v <= camp.energie))) continue;
      if (c.fx === 'aoe' && ennemis.length < 2) continue;
      if (c.fx === 'heal' && camp.pv > camp.pvMax - c.v) continue;
      if (c.fx === 'draw' && camp.main.length > 5) continue;
      return { type: 'jouer', index: i };
    }

    // 3. Capacités des grandes cartes
    if (!facile) {
      for (const u of unites(camp)) {
        if (!peutActiver(p, qui, u.uid)) continue;
        if (capaciteActive(u).utile && !capaciteActive(u).utile(p, qui, u)) continue;
        const cibles = ciblesCapacite(p, qui, u.uid);
        if (!cibles) return { type: 'capacite', uid: u.uid };
        const t = cibles.map((c) => trouver(adv, c.uid)).sort((x, y) => (y.h <= 3) - (x.h <= 3) || y.a - x.a)[0];
        if (t) return { type: 'capacite', uid: u.uid, cible: { camp: autre(qui), uid: t.uid } };
      }
    }

    // 4. Le Destin, plus ou moins souvent selon la difficulté, s'il reste de l'énergie
    if (peutDestin(p, qui) && camp.pv > 3 && Math.random() < (CHANCE_DESTIN[difficulte] ?? 0.4)) return { type: 'destin' };

    // 5. Attaques : la meilleure cible de chaque unité prête (facile : au hasard)
    const pretes = unites(camp).filter(peutAttaquer).sort((x, y) => y.a - x.a);
    let meilleure = null;
    for (const u of pretes) {
      const cibles = ciblesAttaque(p, qui, u.uid);
      if (facile) return { type: 'attaque', uid: u.uid, cible: cibles[Math.floor(Math.random() * cibles.length)] };
      for (const cible of cibles) {
        const v = valeurAttaque(p, qui, u, cible);
        if (!meilleure || v > meilleure.v) meilleure = { v, uid: u.uid, cible };
      }
    }
    if (meilleure && meilleure.v > 0.4) return { type: 'attaque', uid: meilleure.uid, cible: meilleure.cible };

    // 6. Défendre : la plus solide de ses unités, si la menace adverse est réelle
    if (!facile) {
      const menace = ennemis.reduce((s, u) => s + u.a, 0);
      const aGarder = unites(camp).filter(peutDefendre).sort((x, y) => (y.h + y.d) - (x.h + x.d))[0];
      if (aGarder && menace > 0 && (menace >= camp.pv / 2 || ennemis.some((e) => e.a >= aGarder.h))) {
        return { type: 'defendre', uid: aGarder.uid };
      }
    }
    // Sinon, la meilleure attaque même médiocre
    if (meilleure && meilleure.v > 0) return { type: 'attaque', uid: meilleure.uid, cible: meilleure.cible };
  }

  // 7. Énergie restante (sans action) : défausser une carte injouable avant longtemps, ou méditer
  if (!facile && peutDefausser(p, qui) && !camp.main.some((c, i) => peutJouer(p, qui, i))) {
    const lourde = camp.main.map((c, i) => ({ c, i })).filter(({ c }) => c.c > camp.energieMax + 2).sort((x, y) => y.c.c - x.c.c)[0];
    if (lourde) return { type: 'defausser', index: lourde.i };
  }
  if (!facile && peutMediter(p, qui) && camp.deck.length >= 3) return { type: 'mediter' };
  return null;
}
