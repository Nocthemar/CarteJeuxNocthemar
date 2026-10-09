// =====================================================================
//  Page histoire.html — Mode Histoire du Duel des Couronnes
//  - Les chapitres (un pays chacun) : les verrouillés restent visibles, grisés
//  - La carte du chapitre : niveaux reliés par un chemin, 3 états
//    (terminé / disponible / verrouillé), le boss plus grand
//  - Un clic sur un niveau ouvre sa fiche ; « Combattre » lance le duel
//    dans jeu-cartes.html?histoire=<id> (le mode contre l'IA, configuré pour ce niveau)
//  - Au retour, le résultat laissé par le jeu (sessionStorage) est affiché
//  Données : JS/histoire-data.js — Progression : table histoire_progression (SQL/mode_histoire.sql)
// =====================================================================
import { supabase, connexionDiscord, getMonJoueur, SITE_ROOT } from './supabase.js';
import { $, esc, notifier } from './commun.js';
import { CHAPITRES, DIFFICULTES, trouverNiveau, chapitreOuvert, etatNiveau } from './histoire-data.js';

const CLE_RESULTAT = 'histoire-resultat';   // écrit par JS/jeu-cartes.js à la fin d'un niveau
const LIBELLES_ETAT = { termine: 'terminé', disponible: 'disponible', verrouille: 'verrouillé' };

let faits = new Set();      // id des niveaux terminés par le joueur
let chapitreActif = null;
let niveauNouveau = null;   // niveau tout juste débloqué (mis en avant sur la carte)

const url = (chemin) => new URL(chemin, SITE_ROOT).href;


async function init() {
  const moi = await getMonJoueur().catch(() => null);
  $('chargement').hidden = true;

  // Pas connecté : message et bouton Discord
  if (!moi) {
    $('non-connecte').hidden = false;
    $('btn-connexion').addEventListener('click', connexionDiscord);
    return;
  }

  // Progression du joueur (lisible par lui seul, RLS)
  const { data, error } = await supabase.from('histoire_progression').select('niveau_id').eq('discord_id', moi.discord_id);
  if (error) notifier("Impossible de lire ta progression. Le mode Histoire est-il installé dans Supabase ?", 'erreur');
  faits = new Set((data ?? []).map((l) => l.niveau_id));

  const resultat = lireResultat();

  // Chapitre affiché : celui demandé dans l'adresse s'il est ouvert, sinon le dernier ouvert
  const demande = new URLSearchParams(location.search).get('chapitre');
  const ouverts = CHAPITRES.filter((c) => chapitreOuvert(c, faits));
  chapitreActif = ouverts.find((c) => c.id === demande) ?? ouverts.at(-1) ?? CHAPITRES[0];

  $('histoire').hidden = false;
  if (resultat) afficherResultat(resultat);
  afficherChapitres();
  afficherChapitre();
}


// ---------------------------------------------------------------------
//  Résultat du dernier duel (laissé par le jeu, lu une seule fois)
// ---------------------------------------------------------------------
function lireResultat() {
  try {
    const brut = sessionStorage.getItem(CLE_RESULTAT);
    sessionStorage.removeItem(CLE_RESULTAT);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

function afficherResultat({ niveau: idNiveau, gagne, recompenses: r, erreur }) {
  const trouve = trouverNiveau(idNiveau);
  if (!trouve) return;
  const { chapitre, niveau, index } = trouve;

  // Le niveau suivant vient d'être débloqué : on le met en avant
  if (gagne && r && !r.deja) niveauNouveau = chapitre.niveaux[index + 1]?.id ?? null;

  // Dans une phrase : « Tu as vaincu la garde du pont » (minuscule au début du nom)
  const adv = esc(niveau.adversaire.charAt(0).toLowerCase() + niveau.adversaire.slice(1));
  let texte;
  let gains = '';
  if (!gagne) {
    texte = `${esc(niveau.adversaire)} t'a vaincu. Le niveau t'attend : retente ta chance quand tu veux.`;
  } else if (erreur) {
    texte = `Victoire, mais elle n'a pas pu être enregistrée : ${esc(erreur)}`;
  } else if (!r || r.deja) {
    texte = 'Victoire ! Ce niveau était déjà terminé : pas de nouvelle récompense.';
  } else {
    texte = r.chapitre_termine
      ? `Tu as vaincu ${adv} : le chapitre ${esc(chapitre.nom)} est terminé !`
      : `Tu as vaincu ${adv}. La route continue.`;
    gains = [
      r.or ? `<li><img src="${url('img/Equipement/Or-icone.webp')}" alt=""> +${r.or} pièces</li>` : '',
      r.xp ? `<li><span class="resultat__xp">XP</span> +${r.xp} XP de pass</li>` : '',
      r.carte ? `<li class="resultat__carte">${r.carte_image ? `<img src="${esc(url(r.carte_image))}" alt="">` : ''} Nouvelle carte : <strong>${esc(r.carte)}</strong></li>` : '',
    ].join('');
  }

  const zone = $('resultat');
  zone.className = `resultat ${gagne ? 'resultat--victoire' : 'resultat--defaite'}`;
  zone.innerHTML = `
    <div class="resultat__corps">
      <p class="resultat__sur">${esc(niveau.nom)}</p>
      <h2 class="resultat__titre">${gagne ? 'Victoire' : 'Défaite'}</h2>
      <p class="resultat__texte">${texte}</p>
      ${gains ? `<ul class="resultat__gains">${gains}</ul>` : ''}
    </div>
    <button type="button" class="resultat__fermer" aria-label="Fermer le message">×</button>`;
  zone.hidden = false;
  zone.querySelector('.resultat__fermer').addEventListener('click', () => { zone.hidden = true; });
}


// ---------------------------------------------------------------------
//  Les chapitres
// ---------------------------------------------------------------------
function afficherChapitres() {
  $('chapitres').innerHTML = CHAPITRES.map((c) => {
    const ouvert = chapitreOuvert(c, faits);
    const nbFaits = c.niveaux.filter((n) => faits.has(n.id)).length;
    const etat = !c.niveaux.length ? 'Bientôt' : !ouvert ? 'Verrouillé' : `${nbFaits} / ${c.niveaux.length}`;
    const titre = !c.niveaux.length ? 'Ce chapitre n’est pas encore écrit'
      : !ouvert ? 'Bats le boss du chapitre précédent pour l’ouvrir' : `Ouvrir ${c.nom}`;
    return `
      <button type="button" class="chapitre-onglet${c === chapitreActif ? ' est-actif' : ''}${ouvert ? '' : ' est-verrouille'}"
              data-chapitre="${esc(c.id)}" ${ouvert ? '' : 'aria-disabled="true"'} title="${esc(titre)}"
              style="${c.image ? `--vignette:url('${esc(url(c.image))}')` : ''}">
        <span class="chapitre-onglet__nom">${esc(c.nom)}</span>
        <span class="chapitre-onglet__sous">${esc(c.sousTitre ?? '')}</span>
        <span class="chapitre-onglet__etat">${!ouvert ? cadenas() : ''}${etat}</span>
      </button>`;
  }).join('');
}

$('chapitres').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chapitre]');
  if (!b) return;
  const c = CHAPITRES.find((x) => x.id === b.dataset.chapitre);
  if (!c || c === chapitreActif) return;
  if (!chapitreOuvert(c, faits)) {
    notifier(c.niveaux.length ? 'Bats le boss du chapitre précédent pour ouvrir ce pays.' : 'Ce chapitre arrive bientôt.', 'erreur');
    return;
  }
  chapitreActif = c;
  history.replaceState(null, '', `?chapitre=${encodeURIComponent(c.id)}`);
  afficherChapitres();
  afficherChapitre();
});


// ---------------------------------------------------------------------
//  La carte du chapitre
// ---------------------------------------------------------------------
const cadenas = () => '<svg class="ico-cadenas" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const coche = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const couronne = () => '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 18l1.6-10 4.4 4.6L12 5l3 7.6L19.4 8 21 18z"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg>';

function afficherChapitre() {
  const c = chapitreActif;
  const niveaux = c.niveaux;
  const etats = niveaux.map((_, i) => etatNiveau(c, i, faits));
  const nbFaits = etats.filter((e) => e === 'termine').length;

  // Chemin : un segment par paire de niveaux qui se suivent
  const segments = niveaux.slice(1).map((n, i) => {
    const a = niveaux[i];
    const etat = etats[i] === 'termine' && etats[i + 1] === 'termine' ? 'fait'
      : etats[i] === 'termine' ? 'ouvert' : 'ferme';
    return `<line class="chemin chemin--${etat}" x1="${a.x}" y1="${a.y}" x2="${n.x}" y2="${n.y}" vector-effect="non-scaling-stroke"/>`;
  }).join('');

  const etapes = niveaux.map((n, i) => {
    const etat = etats[i];
    const contenu = n.est_boss ? couronne() : etat === 'termine' ? coche() : etat === 'verrouille' ? cadenas() : `<span>${i + 1}</span>`;
    const classes = ['etape', `etape--${etat}`, n.est_boss ? 'etape--boss' : '', n.id === niveauNouveau ? 'etape--nouveau' : ''].filter(Boolean).join(' ');
    return `
      <button type="button" class="${classes}" style="left:${n.x}%;top:${n.y}%" data-niveau="${esc(n.id)}"
              aria-label="${esc(`${n.est_boss ? 'Boss' : `Niveau ${i + 1}`} : ${n.nom} (${LIBELLES_ETAT[etat]})`)}">
        <span class="etape__cercle">${contenu}</span>
        <span class="etape__nom">${esc(n.nom)}</span>
      </button>`;
  }).join('');

  $('chapitre').innerHTML = `
    <header class="chapitre__tete">
      <div>
        <h2 class="chapitre__nom">${esc(c.nom)}</h2>
        <p class="chapitre__sous">${esc(c.sousTitre ?? '')}</p>
      </div>
      <p class="chapitre__progression"><strong>${nbFaits}</strong> / ${niveaux.length} niveaux</p>
    </header>
    ${c.description ? `<p class="chapitre__desc">${esc(c.description)}</p>` : ''}
    <div class="carte-defile">
      <div class="carte-histoire" style="aspect-ratio:${esc(c.ratio ?? '16 / 9')};${c.image ? `background-image:url('${esc(url(c.image))}')` : ''}">
        <svg class="carte-histoire__chemins" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${segments}</svg>
        ${etapes}
      </div>
    </div>`;

  // Téléphone : la carte défile ; on la centre sur le niveau à jouer
  const cible = $('chapitre').querySelector('.etape--nouveau, .etape--disponible');
  const defile = $('chapitre').querySelector('.carte-defile');
  if (cible && defile.scrollWidth > defile.clientWidth) {
    requestAnimationFrame(() => { defile.scrollLeft = cible.offsetLeft - defile.clientWidth / 2; });
  }
}

$('chapitre').addEventListener('click', (e) => {
  const b = e.target.closest('[data-niveau]');
  if (!b) return;
  const trouve = trouverNiveau(b.dataset.niveau);
  if (!trouve) return;
  const etat = etatNiveau(trouve.chapitre, trouve.index, faits);
  if (etat === 'verrouille') {
    notifier(trouve.niveau.est_boss ? 'Termine tous les niveaux du chapitre pour affronter le boss.' : 'Termine d’abord le niveau précédent.', 'erreur');
    return;
  }
  ouvrirFiche(trouve, etat);
});


// ---------------------------------------------------------------------
//  Fiche d'un niveau (fenêtre) : nom, adversaire, récompenses, Combattre
// ---------------------------------------------------------------------
function ouvrirFiche({ chapitre, niveau, index }, etat) {
  $('niveau-sur').textContent = `${niveau.est_boss ? 'Boss' : `Niveau ${index + 1}`} · ${chapitre.nom}`;
  $('niveau-titre').textContent = niveau.nom;
  $('niveau-infos').innerHTML = [
    ['Adversaire', niveau.adversaire],
    ['Difficulté', DIFFICULTES[niveau.difficulte] ?? niveau.difficulte],
    niveau.pv ? ['Héros adverse', `${niveau.pv} PV`] : null,
    niveau.energieBonus ? ['Énergie adverse', `+${niveau.energieBonus} par tour`] : null,
  ].filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');

  const r = niveau.recompenses ?? {};
  $('niveau-recompenses').innerHTML = etat === 'termine'
    ? '<p class="niveau-fiche__deja">Déjà remporté : tu peux rejouer ce duel, sans nouvelle récompense.</p>'
    : `<p class="niveau-fiche__label">Récompenses de la première victoire</p>
       <ul>
         ${r.or ? `<li><img src="${url('img/Equipement/Or-icone.webp')}" alt=""> ${r.or} pièces</li>` : ''}
         ${r.xp ? `<li><span class="resultat__xp">XP</span> ${r.xp} XP de pass</li>` : ''}
         ${r.carte ? '<li><span class="niveau-fiche__carte" aria-hidden="true"></span> Une carte au hasard pour ta collection</li>' : ''}
       </ul>`;

  const lien = $('niveau-combattre');
  lien.href = `jeu-cartes.html?histoire=${encodeURIComponent(niveau.id)}`;
  lien.textContent = etat === 'termine' ? 'Rejouer le duel' : niveau.est_boss ? 'Affronter le boss' : 'Combattre';
  $('niveau-fiche').classList.toggle('niveau-fiche--boss', !!niveau.est_boss);
  $('niveau-fiche').showModal();
}

// Clic sur le fond de la fenêtre : on la ferme
$('niveau-fiche').addEventListener('click', (e) => {
  if (e.target === $('niveau-fiche')) $('niveau-fiche').close();
});

init();
