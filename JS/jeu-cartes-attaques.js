// =====================================================================
//  Duel des Couronnes — animations des attaques
//  Chaque attaque a sa chorégraphie :
//   1. d'abord celle de l'attaque elle-même, par son nom (ATTAQUES : les attaques
//      signatures des personnages, ex. « Cœur Immuable » de Kaéliss) ;
//   2. sinon celle de sa Veine (VEINES_FX : Sang, Rêve, Bête, Marée…) ;
//   3. sinon (troupes du Codex) un coup d'épée.
//  Une chorégraphie : couleur + icône (l'annonce au-dessus de l'attaquant),
//  charge (pendant que le dé roule), puis coup (trajet + impact), qui renvoie
//  éventuellement une fonction pour ramener l'attaquant à sa place.
//  Pour ajouter l'animation d'une nouvelle attaque : une entrée dans ATTAQUES.
// =====================================================================
import { particules, onde, flash, voile, secousseEcran, projectile, griffes, rayon, symbole, pointes } from './jeu-cartes-effets.js';
import { jouerSon } from './jeu-cartes-son.js';
import { VEINES } from './cartes.js';

const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause = (ms) => new Promise((r) => setTimeout(r, reduit || document.hidden ? 0 : ms));

// L'attaquant s'élance vers sa cible (corps à corps) ; renvoie la fonction qui le ramène
async function elan(att, cib, part = 0.7) {
  if (!att || !cib || reduit) return () => {};
  const ra = att.getBoundingClientRect();
  const rc = cib.getBoundingClientRect();
  att.style.setProperty('--dx', `${(rc.left + rc.width / 2 - (ra.left + ra.width / 2)) * part}px`);
  att.style.setProperty('--dy', `${(rc.top + rc.height / 2 - (ra.top + ra.height / 2)) * part}px`);
  att.classList.add('fx-elan');
  jouerSon('elan');
  await pause(230);
  return () => att.classList.remove('fx-elan');
}

// Plusieurs projectiles à la suite ; attend le dernier
async function salve(att, cib, n, options, ecart = 90) {
  const vols = [];
  for (let i = 0; i < n; i++) {
    vols.push(projectile(att, cib, { ...options, arc: (options.arc ?? 40) * (i % 2 ? -1 : 1) * (1 + i * 0.3) }));
    if (i < n - 1) await pause(ecart);
  }
  await Promise.all(vols);
}

// Aura qui monte autour de l'attaquant pendant que le dé roule
const aura = (couleurs, rond = true) => (att) =>
  particules(att, { n: 14, couleurs, vitesse: 30, monte: 70, gravite: -40, rond, depuis: 'surface', duree: 1000 });

// ---------------------------------------------------------------------
//  Les Veines
// ---------------------------------------------------------------------
const SANG = ['#ff3b4a', '#a3121f', '#ff8a8f'];
const OR = ['#f6d995', '#f0c873', '#ffffff', '#d9a441'];
const VIOLET = ['#c9b2fb', '#9a6cf0', '#ffffff'];
const LUNE = ['#d9d2ff', '#a99cf0', '#fff6d6'];
const SPECTRE = ['#b9e3c6', '#7fae94', '#e8fff0'];
const FAUVE = ['#e6dccb', '#a5876a', '#ff6b5b'];
const BRAISES = ['#ffd27a', '#ff9a3d', '#e8553a', '#ffb347'];
const EAU = ['#bfe3f0', '#7fbcd6', '#ffffff', '#3f8fc0'];
const SEVE = ['#9fd98a', '#5d9b48', '#d5f5c0'];
const CIERGE = ['#fff3c4', '#ffe08a', '#ffffff'];
const OMBRE = ['#3a2a4a', '#1a1222', '#6e4a8a'];
const ACIER = ['#c5cad3', '#8a919c', '#ffffff'];
const GLU = ['#8ee07a', '#4fae3c', '#c8f5b0'];
const GIVRE = ['#ffffff', '#dff4ff', '#9fd2f0'];

const VEINES_FX = {
  sang: {
    couleur: '#ff4b5c', charge: aura(SANG),
    async coup(att, cib) {
      await salve(att, cib, 3, { couleur: '#ff3b4a', taille: 18, duree: 360 }, 80);
      jouerSon('griffe');
      griffes(cib, { n: 2, couleur: '#ff3b4a', angle: -30 });
      flash(cib, 'rgba(255,60,80,.8)', 2);
      particules(cib, { n: 20, couleurs: SANG, vitesse: 120, gravite: 120, rond: true, taille: [3, 7] });
    },
  },
  trone: {
    couleur: '#f0c873', charge: aura(OR, false),
    async coup(att, cib) {
      await projectile(att, cib, { forme: '♛', couleur: '#f0c873', taille: 30, duree: 420 });
      jouerSon('couronne');
      symbole(cib, '♛', { couleur: '#f6d995', taille: 70 });
      onde(cib, '#f0c873', 2.4, 650);
      setTimeout(() => onde(cib, '#ffffff', 1.8, 500), 120);
      particules(cib, { n: 22, couleurs: OR, vitesse: 160, gravite: 70 });
    },
  },
  regard: {
    couleur: '#c9b2fb', charge: (att) => symbole(att, '◉', { couleur: '#c9b2fb', taille: 46, duree: 900, monte: 10 }),
    async coup(att, cib) {
      jouerSon('magie');
      rayon(att, cib, { couleur: '#c9b2fb', epaisseur: 12, duree: 480 });
      await pause(150);
      symbole(cib, '◉', { couleur: '#e0d4ff', taille: 60 });
      flash(cib, 'rgba(201,178,251,.9)', 2.2);
      particules(cib, { n: 16, couleurs: VIOLET, vitesse: 110, gravite: 20, rond: true });
    },
  },
  reve: {
    couleur: '#b9adf5', charge: aura(LUNE),
    async coup(att, cib) {
      jouerSon('reve');
      await salve(att, cib, 2, { forme: '☾', couleur: '#d9d2ff', taille: 30, duree: 520, rotation: 360, arc: 60 }, 120);
      symbole(cib, '☾', { couleur: '#d9d2ff', taille: 64, duree: 1000 });
      onde(cib, '#b9adf5', 2.2, 800);
      particules(cib, { n: 18, couleurs: LUNE, vitesse: 40, monte: 60, gravite: -30, rond: true, depuis: 'surface', duree: 1200 });
    },
  },
  tombeau: {
    couleur: '#9fd3b0', charge: aura(SPECTRE),
    async coup(att, cib) {
      jouerSon('sombre');
      await projectile(att, cib, { forme: '☠', couleur: '#b9e3c6', taille: 30, duree: 520, arc: 70 });
      symbole(cib, '☠', { couleur: '#b9e3c6', taille: 60 });
      voile('rgba(70,120,90,.35)', 600);
      particules(cib, { n: 20, couleurs: SPECTRE, vitesse: 40, monte: 90, gravite: -50, rond: true, depuis: 'surface', duree: 1200, taille: [5, 11] });
    },
  },
  bete: {
    couleur: '#e6a35a', charge: aura(FAUVE, false),
    async coup(att, cib) {
      const retour = await elan(att, cib, 0.85);
      jouerSon('griffe');
      griffes(cib, { n: 4, couleur: '#fff1e0', angle: 35, ecart: 12, epaisseur: 4 });
      particules(cib, { n: 18, couleurs: FAUVE, vitesse: 150, gravite: 90 });
      secousseEcran(6);
      return retour;
    },
  },
  forge: {
    couleur: '#ff9a3d', charge: aura(BRAISES, false),
    async coup(att, cib) {
      const retour = await elan(att, cib, 0.8);
      jouerSon('forge');
      flash(cib, 'rgba(255,170,90,.95)', 2.6);
      onde(cib, '#ff9a3d', 2.6, 600);
      particules(cib, { n: 30, couleurs: BRAISES, vitesse: 240, gravite: 120, taille: [2, 5], duree: 800 });
      secousseEcran(10);
      return retour;
    },
  },
  maree: {
    couleur: '#7fbcd6', charge: aura(EAU),
    async coup(att, cib) {
      jouerSon('eau');
      await projectile(att, cib, { couleur: '#7fbcd6', taille: 40, duree: 480, arc: 90 });
      onde(cib, '#bfe3f0', 2.4, 700);
      setTimeout(() => onde(cib, '#7fbcd6', 1.9, 600), 140);
      particules(cib, { n: 26, couleurs: EAU, vitesse: 150, monte: 80, gravite: 160, rond: true, taille: [3, 8], duree: 900 });
    },
  },
  racine: {
    couleur: '#8fcf72', charge: aura(SEVE, false),
    async coup(att, cib) {
      jouerSon('choc');
      pointes(cib, { n: 5, couleur: '#5d9b48' });
      await pause(160);
      particules(cib, { n: 16, couleurs: SEVE, vitesse: 90, monte: 40, gravite: 60, depuis: 'surface' });
    },
  },
  esprit: {
    couleur: '#ffe08a', charge: aura(CIERGE),
    async coup(att, cib) {
      jouerSon('magie');
      await salve(att, cib, 3, { couleur: '#fff3c4', taille: 16, duree: 460, arc: 70 }, 70);
      flash(cib, 'rgba(255,243,196,.95)', 2.4);
      particules(cib, { n: 18, couleurs: CIERGE, vitesse: 50, monte: 80, gravite: -40, rond: true, depuis: 'surface', duree: 1100 });
    },
  },
  ombre: {
    couleur: '#9a7ab8', charge: aura(OMBRE),
    async coup(att, cib) {
      jouerSon('sombre');
      await projectile(att, cib, { couleur: '#2a1d36', taille: 44, duree: 520, arc: 30 });
      voile('rgba(20,10,30,.6)', 700);
      particules(cib, { n: 24, couleurs: OMBRE, vitesse: 50, monte: 40, gravite: -20, rond: true, depuis: 'surface', duree: 1200, taille: [8, 16] });
      flash(cib, 'rgba(110,74,138,.8)', 2);
    },
  },
  chaine: {
    couleur: '#c5cad3', charge: aura(ACIER, false),
    async coup(att, cib) {
      jouerSon('chaine');
      await projectile(att, cib, { forme: '⛓', couleur: '#c5cad3', taille: 30, duree: 380, arc: 0, rotation: 180 });
      griffes(cib, { n: 2, couleur: '#c5cad3', angle: 0, ecart: 22, epaisseur: 6 });
      griffes(cib, { n: 2, couleur: '#8a919c', angle: 90, ecart: 22, epaisseur: 6 });
      particules(cib, { n: 14, couleurs: ACIER, vitesse: 130, gravite: 80, taille: [2, 5] });
    },
  },
  destin: {
    couleur: '#c9b2fb', charge: aura([...OR, '#c9b2fb']),
    async coup(att, cib) {
      jouerSon('de');
      await projectile(att, cib, { forme: '🎲', taille: 34, duree: 520, rotation: 720, arc: 80 });
      jouerSon('magie');
      symbole(cib, '✦', { couleur: '#f6d995', taille: 70 });
      onde(cib, '#c9b2fb', 2.6, 700);
      particules(cib, { n: 24, couleurs: [...OR, '#c9b2fb'], vitesse: 170, gravite: 50 });
    },
  },
};

// Troupes du Codex (pas de Veine) : un coup d'épée
const EPEE = {
  couleur: '#e6eaf1', charge: null,
  async coup(att, cib) {
    const retour = await elan(att, cib);
    jouerSon('choc');
    griffes(cib, { n: 1, couleur: '#ffffff', angle: -40, epaisseur: 5 });
    return retour;
  },
};

// ---------------------------------------------------------------------
//  Attaques signatures des personnages (par nom d'attaque)
// ---------------------------------------------------------------------
const ATTAQUES = {
  // Kaéliss
  'Maître du Flot': {
    async coup(att, cib) {
      jouerSon('eau');
      rayon(att, cib, { couleur: '#ff3b4a', epaisseur: 14, duree: 600 });
      await pause(200);
      symbole(cib, '🩸', { taille: 54 });
      particules(cib, { n: 26, couleurs: SANG, vitesse: 130, monte: 60, gravite: 150, rond: true });
      voile('rgba(163,18,31,.4)', 600);
    },
  },
  'Cœur Immuable': {
    charge: (att) => { aura(SANG)(att); symbole(att, '♥', { couleur: '#ff3b4a', taille: 40, duree: 1000, monte: 10 }); },
    async coup(att, cib) {
      jouerSon('coeur');
      symbole(cib, '♥', { couleur: '#ff3b4a', taille: 90, duree: 900, monte: 0 });
      await pause(380);
      jouerSon('coeur');
      flash(cib, 'rgba(255,40,60,.95)', 3);
      onde(cib, '#ff3b4a', 3, 700);
      particules(cib, { n: 34, couleurs: SANG, vitesse: 220, gravite: 120, rond: true, taille: [3, 9] });
      voile('rgba(163,18,31,.55)', 800);
      secousseEcran(12);
    },
  },
  // Dalek
  'Marcheur d\'Esprit': {
    async coup(att, cib) {
      jouerSon('reve');
      await projectile(att, cib, { forme: '☾', couleur: '#d9d2ff', taille: 34, duree: 560, rotation: 360, arc: 70 });
      symbole(cib, 'z Z', { couleur: '#d9d2ff', taille: 40, duree: 1100, monte: 50 });
      onde(cib, '#b9adf5', 2, 800);
      voile('rgba(120,100,200,.3)', 700);
    },
  },
  'Seigneur des Rêves': {
    async coup(att, cib) {
      jouerSon('reve');
      // une pluie d'étoiles et de lunes tombe du haut de l'écran
      const ciel = document.createElement('span');
      const r = cib.getBoundingClientRect();
      Object.assign(ciel.style, { position: 'fixed', left: `${r.left + r.width / 2}px`, top: '0px', width: '1px', height: '1px' });
      document.body.appendChild(ciel);
      const chutes = [];
      for (let i = 0; i < 5; i++) {
        ciel.style.left = `${r.left + r.width / 2 + (i - 2) * 60}px`;
        chutes.push(projectile(ciel, cib, { forme: i % 2 ? '✦' : '☾', couleur: '#d9d2ff', taille: 26, duree: 560, arc: 20, rotation: 360 }));
        await pause(70);
      }
      await Promise.all(chutes);
      ciel.remove();
      symbole(cib, '☾', { couleur: '#fff6d6', taille: 80, duree: 1000 });
      onde(cib, '#b9adf5', 3, 800);
      voile('rgba(90,70,180,.45)', 800);
      secousseEcran(8);
    },
  },
  // Mange-cœur
  'Éventrement': {
    async coup(att, cib) {
      const retour = await elan(att, cib, 0.9);
      jouerSon('griffe');
      griffes(cib, { n: 4, couleur: '#ff3b4a', angle: 40, ecart: 12, epaisseur: 5 });
      particules(cib, { n: 24, couleurs: SANG, vitesse: 170, gravite: 140, rond: true });
      secousseEcran(9);
      // le cœur arraché revient vers le Mange-cœur
      setTimeout(() => { jouerSon('coeur'); projectile(cib, att, { forme: '♥', couleur: '#ff3b4a', taille: 28, duree: 450, arc: 50 }); }, 200);
      return retour;
    },
  },
  'Voix du Défunt': {
    async coup(att, cib) {
      jouerSon('sombre');
      onde(att, '#9fd3b0', 2, 600);
      setTimeout(() => onde(att, '#9fd3b0', 2.6, 700), 150);
      await projectile(att, cib, { forme: '☠', couleur: '#b9e3c6', taille: 30, duree: 500, arc: 0 });
      voile('rgba(70,120,90,.4)', 650);
      particules(cib, { n: 18, couleurs: SPECTRE, vitesse: 40, monte: 90, gravite: -50, rond: true, depuis: 'surface', duree: 1200 });
    },
  },
  // Slime
  'Masse gélatineuse': {
    charge: aura(GLU),
    async coup(att, cib) {
      jouerSon('gluant');
      await projectile(att, cib, { couleur: '#6fd25a', taille: 46, duree: 560, arc: 130 });
      jouerSon('gluant');
      particules(cib, { n: 22, couleurs: GLU, vitesse: 140, gravite: 180, rond: true, taille: [6, 14] });
      pointes(cib, { n: 4, couleur: '#4fae3c', hauteur: 0.35 });
    },
  },
  'Englobement': {
    charge: aura(GLU),
    async coup(att, cib) {
      const retour = await elan(att, cib, 0.95);
      jouerSon('gluant');
      flash(cib, 'rgba(110,210,90,.8)', 2.4);
      onde(cib, '#8ee07a', 2.2, 700);
      setTimeout(() => jouerSon('eau'), 150);
      particules(cib, { n: 20, couleurs: GLU, vitesse: 30, monte: 80, gravite: -40, rond: true, depuis: 'surface', duree: 1300, taille: [4, 10] });
      return retour;
    },
  },
  // Maître du Jeu
  'Coup du Sort': {
    async coup(att, cib) {
      jouerSon('de');
      await salve(att, cib, 3, { forme: '🎲', taille: 28, duree: 520, rotation: 720, arc: 70 }, 90);
      symbole(cib, '✦', { couleur: '#f6d995', taille: 72 });
      particules(cib, { n: 26, couleurs: [...OR, '#c9b2fb'], vitesse: 180, gravite: 60 });
      secousseEcran(8);
    },
  },
  'Plume du Codex': {
    async coup(att, cib) {
      jouerSon('magie');
      await projectile(att, cib, { forme: '✒', couleur: '#f6d995', taille: 36, duree: 560, arc: 60, rotation: 30 });
      symbole(cib, '∞', { couleur: '#f6d995', taille: 80, duree: 1000 });
      onde(cib, '#f0c873', 3, 800);
      particules(cib, { n: 30, couleurs: OR, vitesse: 200, gravite: 30 });
      voile('rgba(240,200,115,.35)', 700);
    },
  },
  // Seigneur des Marais
  'Étreinte de la Vase': {
    charge: aura(['#6b7a4a', '#3e4a2a', '#a3b07a'], true),
    async coup(att, cib) {
      jouerSon('gluant');
      // la vase monte sous la cible, puis la retient (pointes boueuses, bulles qui éclatent)
      pointes(cib, { n: 6, couleur: '#4a5a2e', hauteur: 0.85, duree: 900 });
      await pause(220);
      jouerSon('eau');
      particules(cib, { n: 22, couleurs: ['#6b7a4a', '#3e4a2a', '#8a9a5a'], vitesse: 60, monte: 20, gravite: 120, rond: true, depuis: 'surface', taille: [5, 12], duree: 1100 });
      onde(cib, '#6b7a4a', 2, 700);
      secousseEcran(6);
    },
  },
  'Brume Stagnante': {
    charge: aura(['#9fb3a0', '#5f7a6a', '#d0dccf']),
    async coup(att, cib) {
      jouerSon('sombre');
      // une brume verdâtre roule jusqu'à la cible et l'enveloppe
      await salve(att, cib, 3, { couleur: '#8fa596', taille: 38, duree: 620, arc: 25, trainee: true }, 110);
      voile('rgba(70,95,80,.45)', 900);
      particules(cib, { n: 26, couleurs: ['#9fb3a0', '#5f7a6a', '#c3d1c4'], vitesse: 35, monte: 40, gravite: -15, rond: true, depuis: 'surface', taille: [10, 20], duree: 1500 });
      jouerSon('eau', 0.2);
    },
  },
  // Fée des Neiges (version bleue)
  'Souffle de Givre': {
    charge: aura(GIVRE),
    async coup(att, cib) {
      jouerSon('eau');
      await salve(att, cib, 4, { forme: '❄', couleur: '#dff4ff', taille: 22, duree: 420, arc: 35, rotation: 180 }, 60);
      flash(cib, 'rgba(200,235,255,.95)', 2.2);
      onde(cib, '#bfe6ff', 2, 600);
      particules(cib, { n: 20, couleurs: GIVRE, vitesse: 110, gravite: 30, taille: [3, 7] });
    },
  },
  'Berceuse des Neiges': {
    charge: aura(GIVRE),
    async coup(att, cib) {
      jouerSon('reve');
      await projectile(att, cib, { forme: '❄', couleur: '#e8f6ff', taille: 32, duree: 620, arc: 70, rotation: 360 });
      symbole(cib, 'z Z', { couleur: '#dff4ff', taille: 38, duree: 1100, monte: 50 });
      // la neige tombe doucement sur la cible
      particules(cib, { n: 24, couleurs: ['#ffffff', '#dff4ff', '#bfe6ff'], vitesse: 25, monte: -40, gravite: 90, rond: true, depuis: 'surface', duree: 1500, taille: [3, 6] });
      voile('rgba(190,225,255,.3)', 800);
    },
  },
  // Fée des Neiges dorée
  'Larmes de Cristal': {
    charge: (att) => { aura([...GIVRE, '#f6d995'])(att); symbole(att, '💧', { taille: 30, duree: 900, monte: 20 }); },
    async coup(att, cib) {
      jouerSon('magie');
      await salve(att, cib, 5, { forme: '◆', couleur: '#e8f6ff', taille: 18, duree: 400, arc: 45, rotation: 90 }, 55);
      jouerSon('acier');
      flash(cib, 'rgba(230,245,255,.95)', 2.6);
      particules(cib, { n: 30, couleurs: ['#ffffff', '#dff4ff', '#f6d995'], vitesse: 200, gravite: 70, taille: [3, 8] });
      griffes(cib, { n: 3, couleur: '#dff4ff', angle: -60, ecart: 14, epaisseur: 4 });
    },
  },
  'Blizzard d\'Erynedhal': {
    charge: aura([...GIVRE, '#f6d995']),
    async coup(att, cib) {
      jouerSon('tonnerre');
      jouerSon('eau', 0.1);
      voile('rgba(220,240,255,.55)', 1200);
      secousseEcran(10, 700);
      // une tempête de flocons balaie tout l'écran vers la cible
      const r = cib.getBoundingClientRect();
      const vent = document.createElement('span');
      Object.assign(vent.style, { position: 'fixed', left: '0px', top: `${r.top + r.height / 2}px`, width: '1px', height: '1px' });
      document.body.appendChild(vent);
      const rafales = [];
      for (let i = 0; i < 7; i++) {
        vent.style.top = `${r.top + r.height / 2 + (i - 3) * 40}px`;
        rafales.push(projectile(vent, cib, { forme: '❄', couleur: '#ffffff', taille: 20 + (i % 3) * 8, duree: 520, arc: 15, rotation: 540 }));
        await pause(45);
      }
      await Promise.all(rafales);
      vent.remove();
      symbole(cib, '❄', { couleur: '#f6d995', taille: 84, duree: 1000 });
      onde(cib, '#ffffff', 3, 800);
      particules(cib, { n: 34, couleurs: ['#ffffff', '#dff4ff', '#f6d995'], vitesse: 230, gravite: 40, taille: [3, 9] });
    },
  },
  // Veilleuse Écarlate
  'Saignée Pourpre': {
    async coup(att, cib) {
      jouerSon('griffe');
      await projectile(att, cib, { couleur: '#ff3b4a', taille: 20, duree: 340 });
      griffes(cib, { n: 2, couleur: '#ff3b4a', angle: -25 });
      // la vie drainée remonte vers la Veilleuse
      jouerSon('soin', 0.15);
      salve(cib, att, 3, { couleur: '#ff8a8f', taille: 14, duree: 420, arc: 50 }, 60);
    },
  },
  'Voile de Cendres': {
    async coup(att, cib) {
      jouerSon('sombre');
      particules(att, { n: 20, couleurs: ['#5d5560', '#2a2430', '#8a8090'], vitesse: 40, monte: 50, gravite: -20, rond: true, depuis: 'surface', duree: 1000, taille: [8, 14] });
      att?.animate([{ opacity: 1 }, { opacity: 0.1, offset: 0.4 }, { opacity: 0.1, offset: 0.7 }, { opacity: 1 }], { duration: 800 });
      await pause(300);
      particules(cib, { n: 22, couleurs: ['#5d5560', '#2a2430', '#ff9a3d'], vitesse: 70, monte: 40, gravite: 10, rond: true, depuis: 'surface', duree: 1000, taille: [6, 12] });
      griffes(cib, { n: 1, couleur: '#ffb38a', angle: -50, epaisseur: 4 });
    },
  },
};

// Chorégraphie d'une attaque (ev.attaque : { nom, veine } ou null)
export function styleAttaque(attaque) {
  const veine = VEINES_FX[attaque?.veine] ?? EPEE;
  const perso = ATTAQUES[attaque?.nom] ?? {};
  return {
    couleur: perso.couleur ?? veine.couleur,
    icone: VEINES[attaque?.veine]?.[1] ?? '⚔',
    charge: perso.charge ?? veine.charge,
    coup: perso.coup ?? veine.coup,
  };
}

// Couleurs d'une Veine (arrivée d'une carte sur le terrain)
export const couleursVeine = (veine) => ({
  sang: SANG, trone: OR, regard: VIOLET, reve: LUNE, tombeau: SPECTRE, bete: FAUVE, forge: BRAISES,
  maree: EAU, racine: SEVE, esprit: CIERGE, ombre: OMBRE, chaine: ACIER, destin: [...OR, '#c9b2fb'],
}[veine] ?? null);
