// =====================================================================
//  Duel des Couronnes — salon en ligne (Supabase Realtime)
//  Un salon = un canal « duel-CODE ». Rien n'est écrit dans la base :
//    - la présence dit qui est là (pseudo, avatar, rôle, prêt, cartes du deck)
//    - les messages « jeu » portent les événements du duel et l'état de la partie, envoyés par l'hôte
//    - les messages « choix » portent les actions de l'invité (jouer, attaquer, Destin, fin du tour), reçues par l'hôte
//    - les messages « renvoi » redemandent à l'hôte les événements perdus
//      (connexion coupée un instant, onglet en arrière-plan…)
//  L'hôte (celui qui crée le salon) fait tourner les règles et lance les dés.
// =====================================================================
import { supabase } from './supabase.js';

export const TAILLE_SALON = 2;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sans 0/O ni 1/I/L, faciles à confondre

export function nouveauCode() {
  return Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
}

export const codeValide = (code) => new RegExp(`^[${ALPHABET}]{5}$`).test(code);

// Ouvre le salon. surPresence(liste) à chaque arrivée / départ / changement,
// surMessage(evenement, contenu) pour les messages des autres, surErreur(texte).
export function ouvrirSalon(code, profil, { surPresence, surMessage, surErreur }) {
  const cle = crypto.randomUUID();   // une clé par onglet
  let presence = { ...profil, cle, rejoint: Date.now(), pret: false, cartes: [] };

  const canal = supabase.channel(`duel-${code}`, {
    config: { broadcast: { self: false }, presence: { key: cle } },
  });

  const liste = () => Object.values(canal.presenceState()).flat()
    .map(({ presence_ref, ...p }) => p)
    .sort((a, b) => a.rejoint - b.rejoint);

  canal
    .on('presence', { event: 'sync' }, () => surPresence(liste()))
    .on('broadcast', { event: 'jeu' }, ({ payload }) => surMessage('jeu', payload))
    .on('broadcast', { event: 'choix' }, ({ payload }) => surMessage('choix', payload))
    .on('broadcast', { event: 'renvoi' }, ({ payload }) => surMessage('renvoi', payload))
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
