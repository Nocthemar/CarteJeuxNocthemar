// =====================================================================
//  Mode Histoire — les chapitres et leurs niveaux (à modifier à la main)
//
//  Un chapitre = un pays de Nocthémar, avec sa carte vue de haut.
//  Un niveau = un cercle sur la carte, placé en POURCENTAGE de l'image
//  (x : de gauche à droite, y : de haut en bas), donc au même endroit
//  quelle que soit la taille de l'écran. Les niveaux se jouent dans l'ordre
//  de la liste ; le dernier est le boss du chapitre.
//
//  deck : 5 cartes au plus, par leur NOM exact :
//    - une carte du catalogue (table cards), ex. « Mange-cœur » ;
//    - une troupe du Codex, ex. « Garde du Pont » (TROUPES dans JS/jeu-cartes-moteur.js) ;
//    - un objet de pouvoir, ex. « Potion de soin » (OBJETS, 2 au plus).
//    Un nom inconnu est ignoré.
//  difficulte : 'facile' | 'normal' | 'difficile' (comportement de l'IA)
//  pv / energieBonus : facultatifs, pour les boss (20 PV et 0 bonus par défaut).
//    Repère d'équilibre (simulations, pioche en boucle) : 26 PV = nettement plus dur ; +1 énergie par tour
//    rend le boss presque imbattable, à réserver aux chapitres avancés.
//
//  IMPORTANT : les récompenses affichées ici ne sont qu'un aperçu. Celles qui
//  sont réellement données sont dans la table histoire_niveaux (SQL/mode_histoire.sql) :
//  si tu changes un montant, une id ou l'ordre des niveaux, change-le aussi là-bas.
// =====================================================================

export const CHAPITRES = [
  {
    id: 'pravorn',
    nom: 'Pravorn',
    sousTitre: 'Le royaume du Grand Tournoi',
    description: "Le plus vaste royaume du continent. De la route du Nord jusqu'aux lices de la capitale, prouve ta valeur pour défier le Champion du Grand Tournoi.",
    image: 'img/Histoire/pravorn.svg',
    ratio: '16 / 9',   // proportions de l'image (largeur / hauteur)
    niveaux: [
      {
        id: 'pravorn-1', nom: 'La route du Nord', x: 9, y: 80,
        adversaire: 'Un écuyer égaré',
        deck: ['Écuyer de la Couronne', 'Archer des Remparts', 'Garde du Pont', 'Potion de soin'],
        difficulte: 'facile', est_boss: false,
        recompenses: { or: 15, xp: 50 },
      },
      {
        id: 'pravorn-2', nom: 'Le pont gardé', x: 23, y: 60,
        adversaire: 'La garde du pont',
        deck: ['Garde du Pont', 'Archer des Remparts', 'Écuyer de la Couronne', 'Chevalier errant', 'Potion de soin'],
        difficulte: 'facile', est_boss: false,
        recompenses: { or: 18, xp: 50 },
      },
      {
        id: 'pravorn-3', nom: 'Le camp des mercenaires', x: 37, y: 76,
        adversaire: 'Une bande de mercenaires',
        deck: ['Loup des Cendres', 'Cavalier de la Marche', 'Chevalier errant', 'Archer des Remparts', 'Tonique de rage'],
        difficulte: 'normal', est_boss: false,
        recompenses: { or: 20, xp: 50 },
      },
      {
        id: 'pravorn-4', nom: 'Les marais du Sud', x: 50, y: 54,
        adversaire: 'Les bêtes des marais',
        deck: ['Slime', 'Loup des Cendres', 'Cavalier de la Marche', 'Garde du Pont', "Tonique d'endurance"],
        difficulte: 'normal', est_boss: false,
        recompenses: { or: 24, xp: 50 },
      },
      {
        id: 'pravorn-5', nom: 'Les remparts de la capitale', x: 63, y: 70,
        adversaire: 'Le capitaine des remparts',
        deck: ['Sentinelle de pierre', 'Archer des Remparts', 'Lancier des Ruines', 'Garde du Pont', 'Talisman du Dé'],
        difficulte: 'normal', est_boss: false,
        recompenses: { or: 27, xp: 50 },
      },
      {
        id: 'pravorn-6', nom: 'Les lices du tournoi', x: 74, y: 44,
        adversaire: 'Un chevalier de tournoi',
        deck: ['Chevalier errant', 'Cavalier de la Marche', 'Lancier des Ruines', 'Sentinelle de pierre', 'Jeton du marchand'],
        difficulte: 'normal', est_boss: false,
        recompenses: { or: 30, xp: 50 },
      },
      {
        id: 'pravorn-boss', nom: 'Le Grand Tournoi', x: 88, y: 22,
        adversaire: 'Le Champion du Grand Tournoi',
        deck: ['Lancier des Ruines', 'Sentinelle de pierre', 'Chevalier errant', 'Cavalier de la Marche', 'Trousse de soins'],
        difficulte: 'difficile', est_boss: true, pv: 26,
        recompenses: { or: 100, xp: 200, carte: true },
      },
    ],
  },
  {
    // Chapitre suivant : visible mais pas encore écrit (aucun niveau)
    id: 'vharos',
    nom: 'Vharos',
    sousTitre: 'Les terres du Pacte de l’Ombre',
    description: 'Bientôt : vampires, loups-garous et factions rivales.',
    image: '',
    ratio: '16 / 9',
    niveaux: [],
  },
];

export const DIFFICULTES = { facile: 'Facile', normal: 'Normal', difficile: 'Redoutable' };

// Retrouve un niveau par son id : { chapitre, niveau, index } ou null
export function trouverNiveau(id) {
  for (const chapitre of CHAPITRES) {
    const index = chapitre.niveaux.findIndex((n) => n.id === id);
    if (index >= 0) return { chapitre, niveau: chapitre.niveaux[index], index };
  }
  return null;
}

// Un chapitre est ouvert si c'est le premier, ou si le boss du chapitre précédent est battu
// (même règle que valider_niveau_histoire côté serveur). faits : Set des id de niveaux terminés.
export function chapitreOuvert(chapitre, faits) {
  const i = CHAPITRES.indexOf(chapitre);
  if (!chapitre.niveaux.length) return false;
  if (i <= 0) return true;
  const boss = CHAPITRES[i - 1].niveaux.find((n) => n.est_boss);
  return !!boss && faits.has(boss.id);
}

// État d'un niveau : 'termine' | 'disponible' | 'verrouille'
export function etatNiveau(chapitre, index, faits) {
  const niveau = chapitre.niveaux[index];
  if (faits.has(niveau.id)) return 'termine';
  if (!chapitreOuvert(chapitre, faits)) return 'verrouille';
  return index === 0 || faits.has(chapitre.niveaux[index - 1].id) ? 'disponible' : 'verrouille';
}
