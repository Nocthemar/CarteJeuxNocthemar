// =====================================================================
//  Duel des Couronnes — salon en ligne (Supabase Realtime)
//  Un salon = un canal « duel-CODE ». Rien n'est écrit dans la base :
//    - la présence dit qui est là (pseudo, avatar, rôle, prêt, cartes du deck)
//    - les messages « jeu » portent les événements du duel et l'état de la partie, envoyés par l'hôte
//    - les messages « choix » portent les actions de l'invité (jouer, attaquer, Destin, fin du tour), reçues par l'hôte
//    - les messages « renvoi » redemandent à l'hôte les événements perdus
//      (connexion coupée un instant, onglet en arrière-plan…)
//  L'hôte (celui qui crée le salon) fait tourner les règles et lance les dés.
//
//  Sécurité : le canal est PRIVÉ (seuls les joueurs connectés y entrent, SQL/salons_prives.sql), et tout
//  ce qui vient des autres joueurs passe par nettoyer() avant d'être lu : un joueur malveillant ne peut
//  pas glisser de code dans la page de son adversaire (noms, coûts, états de partie…).
// =====================================================================
import { supabase } from './supabase.js';

export const TAILLE_SALON = 2;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sans 0/O ni 1/I/L, faciles à confondre

export function nouveauCode() {
  const tirage = crypto.getRandomValues(new Uint32Array(5));
  return Array.from(tirage, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

// ---------------------------------------------------------------------
//  Nettoyage des messages reçus : ni balise ni guillemet droit dans les textes (ils s'affichent sans
//  danger, même insérés dans du HTML), images limitées aux fichiers du jeu, avatars à Discord,
//  nombres finis, taille et profondeur bornées
// ---------------------------------------------------------------------
const CLES_INTERDITES = new Set(['__proto__', 'constructor', 'prototype']);
const IMAGE_DU_JEU = /^img\/[^:?#\\<>"'`]+$/;
const AVATAR_DISCORD = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/[^\s"'<>`\\]+$/;
const texteSur = (s) => s.slice(0, 2000).replace(/[<>`]/g, '').replace(/"/g, '”').replace(/'/g, '’');

export function nettoyer(x, cle = '', profondeur = 0) {
  if (profondeur > 40) return null;
  if (typeof x === 'string') {
    if (cle === 'image') return IMAGE_DU_JEU.test(x) && !x.includes('..') ? x : null;
    if (cle === 'avatar' || cle === 'avatar_url') return AVATAR_DISCORD.test(x) ? x : null;
    return texteSur(x);
  }
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'boolean' || x == null) return x ?? null;
  if (Array.isArray(x)) return x.slice(0, 500).map((v) => nettoyer(v, cle, profondeur + 1));
  if (typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if (CLES_INTERDITES.has(k) || !/^[\w-]{1,40}$/.test(k)) continue;
      o[k] = nettoyer(v, k, profondeur + 1);
    }
    return o;
  }
  return null;
}

export const codeValide = (code) => new RegExp(`^[${ALPHABET}]{5}$`).test(code);

// Ouvre le salon. surPresence(liste) à chaque arrivée / départ / changement,
// surMessage(evenement, contenu) pour les messages des autres, surErreur(texte).
export function ouvrirSalon(code, profil, { surPresence, surMessage, surErreur }) {
  const cle = crypto.randomUUID();   // une clé par onglet
  let presence = { ...profil, cle, rejoint: Date.now(), pret: false, cartes: [] };

  const canal = supabase.channel(`duel-${code}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: cle } },
  });

  // Ma propre présence reste telle quelle (comparaisons de clé) ; celle des autres est nettoyée
  const liste = () => Object.values(canal.presenceState()).flat()
    .map(({ presence_ref, ...p }) => (p.cle === cle ? p : nettoyer(p)))
    .sort((a, b) => a.rejoint - b.rejoint);

  canal
    .on('presence', { event: 'sync' }, () => surPresence(liste()))
    .on('broadcast', { event: 'jeu' }, ({ payload }) => surMessage('jeu', nettoyer(payload)))
    .on('broadcast', { event: 'choix' }, ({ payload }) => surMessage('choix', nettoyer(payload)))
    .on('broadcast', { event: 'renvoi' }, ({ payload }) => surMessage('renvoi', nettoyer(payload)))
    .subscribe(async (statut) => {
      if (statut === 'SUBSCRIBED') await canal.track(presence);
      else if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') surErreur('La connexion au salon a échoué. Réessaie dans un instant.');
    });

  return {
    code,
    cle,
    get presence() { return presence; },
    liste,
    // Met à jour ce que les autres voient de moi (prêt, cartes…)
    async annoncer(changements) {
      presence = { ...presence, ...changements };
      await canal.track(presence);
    },
    envoyer(evenement, contenu) {
      return canal.send({ type: 'broadcast', event: evenement, payload: contenu });
    },
    async fermer() {
      await canal.untrack().catch(() => {});
      await supabase.removeChannel(canal);
    },
  };
}
