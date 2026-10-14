// =====================================================================
//  Duel des Couronnes — le 2 contre 2 en ligne (camp partagé)
//  Règles du camp partagé : creerPartieEquipes() dans JS/jeu-cartes-moteur.js.
//
//  Un salon de quatre : l'hôte fait tourner la partie (l'arbitre, creerArbitre) ; les quatre écrans,
//  le sien compris, ne font que rejouer les messages « jeu » de l'arbitre et lui envoyer leurs
//  actions (« choix »). Chaque écran voit la partie depuis sa place (vueEquipe) : son équipe en bas,
//  sa propre main, et son allié à côté de son héros.
//  Places : l'équipe de l'hôte est « joueur » pour le moteur (l'hôte en est le joueur 0),
//  l'autre équipe est « adverse ». Ordre des tours : A1, B1, A2, B2.
// =====================================================================
import {
  creerPartieEquipes, renvoyerMainMembre, renvoiFini, membreDe, debutTour, finTour, autre,
  jouer, attaquer, destin, defendre, activer, defausser, mediter, placerSous,
} from './jeu-cartes-moteur.js';

// ---------------------------------------------------------------------
//  Copies à envoyer
// ---------------------------------------------------------------------
// Des fiches des cartes, on garde seulement ce que la face affiche
// (image, rareté, et le nom, le rang et les attaques écrits dans le cadre : htmlInfos de JS/cartes.js)
export const alleger = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'carte' && v
  ? { id: v.id, image: v.image, rarity: v.rarity, name: v.name, rank: v.rank, attack_1: v.attack_1, attack_2: v.attack_2 }
  : v)));

// Le plateau vu de l'autre côté : « joueur » et « adverse » échangés partout
const ECHANGE = { joueur: 'adverse', adverse: 'joueur' };
export function miroir(x) {
  if (Array.isArray(x)) return x.map(miroir);
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === 'camps' && v) o.camps = { joueur: miroir(v.adverse), adverse: miroir(v.joueur) };
    else if ((k === 'renvoi' || k === 'renvoiSieges') && v && typeof v === 'object' && !Array.isArray(v)) {
      o[k] = { joueur: miroir(v.adverse), adverse: miroir(v.joueur) };
    }
    else if (['qui', 'camp', 'actif', 'fini'].includes(k) && ECHANGE[v]) o[k] = ECHANGE[v];
    else o[k] = miroir(v);
  }
  return o;
}

// ---------------------------------------------------------------------
//  La partie vue depuis une place (camp du moteur, joueur 0 ou 1 de l'équipe)
//  - camps.joueur : mon équipe, avec MES affaires (main, énergie, actions…) même quand mon allié joue
//  - moiActif     : c'est à moi de jouer (pas seulement à mon équipe)
//  - nomActif     : le joueur qui a la main
//  - allie        : { nom, cartes, actif } ; ennemis : [{ nom, cartes, actif }, …]
//  - renvoi       : { joueur: mon renvoi est fait, adverse: celui des trois autres aussi }
// ---------------------------------------------------------------------
export function vueEquipe(etat, monCamp, monIndex) {
  const e = monCamp === 'adverse' ? miroir(etat) : JSON.parse(JSON.stringify(etat));
  const nous = e.camps.joueur;
  const eux = e.camps.adverse;
  const actifNous = nous.membreActif;
  const resume = (camp, i) => {
    const m = membreDe(camp, i);
    return { nom: m.nom, cartes: m.main?.length ?? 0, actif: e.actif === (camp === nous ? 'joueur' : 'adverse') && camp.membreActif === i };
  };
  const autreIndex = 1 - monIndex;
  e.allie = resume(nous, autreIndex);
  e.ennemis = [0, 1].map((i) => resume(eux, i));
  e.nomActif = e.actif === 'joueur' ? membreDe(nous, actifNous).nom : eux.nom;
  e.moiActif = e.actif === 'joueur' && actifNous === monIndex;
  // Mes affaires dans le camp
  Object.assign(nous, membreDe(nous, monIndex));
  // Les héros portent le nom des deux joueurs de l'équipe
  nous.nom = nous.nomEquipe ?? nous.nom;
  eux.nom = eux.nomEquipe ?? eux.nom;
  // Rien des mains des autres n'est utile à l'affichage (seulement leur nombre de cartes)
  nous.membres = nous.membres?.map(() => null);
  eux.main = eux.main.map(() => ({ cache: true }));
  eux.membres = eux.membres?.map(() => null);
  const sieges = e.renvoiSieges;
  if (sieges) {
    e.renvoi = {
      joueur: !!sieges.joueur[monIndex],
      adverse: !!sieges.joueur[autreIndex] && sieges.adverse.every(Boolean),
    };
  }
  return e;
}

// Un événement vu depuis une place ; coequipier : c'est mon allié qui a agi
export function vueEvEquipe(ev, monCamp, monIndex) {
  const e = monCamp === 'adverse' ? miroir(ev) : { ...ev };
  if (e.qui === 'joueur' && e.membre != null && e.membre !== monIndex) e.coequipier = true;
  return e;
}

// ---------------------------------------------------------------------
//  L'arbitre (chez l'hôte)
//  sieges   : [{ discord_id, nom, avatar, camp, index }] (les quatre places)
//  decks    : les Grimoires, dans l'ordre des places (construireDeck)
//  envoyer  : (message) => void : à tous les écrans, celui de l'hôte compris
// ---------------------------------------------------------------------
export function creerArbitre({ sieges, decks, envoyer }) {
  const a = { pid: crypto.randomUUID(), n: 0, historique: [], choixVus: new Set(), p: null };
  const place = (camp, index) => sieges.findIndex((s) => s.camp === camp && s.index === index);
  const siegesPublics = sieges.map(({ discord_id, nom, avatar, camp, index }) => ({ discord_id, nom, avatar, camp, index }));

  // L'état envoyé : les Grimoires masqués (seulement leur nombre de cartes)
  function etat() {
    const e = alleger(a.p);
    for (const camp of Object.values(e.camps)) {
      camp.deck = camp.deck.map(() => 0);
      camp.membres?.forEach((m) => { m.deck = m.deck.map(() => 0); });
    }
    return e;
  }
  function diffuser(ev) {
    const msg = { pid: a.pid, n: ++a.n, equipes: true, ev: alleger(ev), etat: etat() };
    a.historique.push(msg);
    if (a.historique.length > 60) a.historique.shift();
    envoyer(msg);
  }
  const commencerTour = () => {
    const ev = debutTour(a.p);
    diffuser({ ...ev, membre: a.p.camps[ev.qui].membreActif });
  };

  a.demarrer = () => {
    const premier = Math.random() < 0.5 ? 'joueur' : 'adverse';
    const equipes = { joueur: [], adverse: [] };
    sieges.forEach((s, i) => { equipes[s.camp][s.index] = { nom: s.nom, deck: decks[i] }; });
    a.p = creerPartieEquipes(equipes, premier);
    diffuser({ type: 'debut', sieges: siegesPublics });
  };

  // L'état complet (écran rechargé, messages perdus)
  a.envoyerEtat = () => {
    if (!a.p) return;
    envoyer({ pid: a.pid, n: a.n, equipes: true, etatComplet: true, sieges: siegesPublics, ev: { type: 'etat' }, etat: etat() });
  };
  a.renvoyer = (demande) => {
    if (!a.p) return;
    // Rien de manqué : rien à renvoyer ; quelques messages : on les renvoie dans l'ordre ;
    // beaucoup (ou un écran rechargé, sur un autre duel) : l'état de la partie d'un coup
    const manquants = demande?.pid === a.pid ? a.historique.filter((m) => m.n >= demande.depuis) : null;
    if (manquants && !manquants.length && demande.depuis > a.n) return;
    if (manquants?.length && manquants[0].n === demande.depuis && manquants.length <= 6) manquants.forEach(envoyer);
    else a.envoyerEtat();
  };

  // Une équipe perd sur tapis vert (abandon, joueur parti)
  a.forfait = (camp, raison) => {
    if (!a.p || a.p.fini) return;
    a.p.fini = autre(camp);
    diffuser({ type: 'abandon', qui: camp, raison });
  };

  // Une action reçue d'un écran : { pid, id, n, de: discord_id, a: { type, … } }
  a.recevoir = (c) => {
    const p = a.p;
    if (!p || p.fini || c?.pid !== a.pid || !c.id || a.choixVus.has(c.id)) return;
    const s = sieges.find((x) => x.discord_id === c.de);
    if (!s) return;
    // L'équipe « adverse » voit la partie en miroir : ses cibles sont retournées dans le sens du moteur
    const act = s.camp === 'adverse' ? miroir(c.a ?? {}) : (c.a ?? {});
    if (act.type === 'abandon') {
      a.choixVus.add(c.id);
      a.forfait(s.camp, `${s.nom} a abandonné : son équipe perd le duel.`);
      return;
    }
    if (act.type === 'renvoi') {
      a.choixVus.add(c.id);
      const ev = renvoyerMainMembre(p, s.camp, s.index, Array.isArray(act.indices) ? act.indices : []);
      if (!ev) return;
      diffuser(ev);
      if (renvoiFini(p)) commencerTour();
      return;
    }
    // Les autres actions : seulement le joueur qui a la main, sur le dernier état
    if (c.n !== a.n || p.actif !== s.camp || p.camps[s.camp].membreActif !== s.index) return;
    a.choixVus.add(c.id);
    if (act.type === 'fin') { finTour(p); commencerTour(); return; }
    const qui = s.camp;
    let ev = null;
    if (act.type === 'jouer') ev = jouer(p, qui, act.index, act.cible ?? null);
    else if (act.type === 'attaque') ev = attaquer(p, qui, act.uid, act.cible);
    else if (act.type === 'destin') ev = destin(p, qui);
    else if (act.type === 'defendre') ev = defendre(p, qui, act.uid);
    else if (act.type === 'capacite') ev = activer(p, qui, act.uid, act.cible ?? null);
    else if (act.type === 'defausser') ev = defausser(p, qui, act.index);
    else if (act.type === 'mediter') ev = mediter(p, qui);
    else if (act.type === 'placer') ev = placerSous(p, qui, act.index ?? null);
    diffuser(ev ? { ...ev, membre: s.index } : { type: 'refus', qui });
  };

  a.place = place;
  return a;
}
