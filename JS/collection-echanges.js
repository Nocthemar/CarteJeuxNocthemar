// =====================================================================
//  Le marché du grimoire : échanger des cartes avec un ami (SQL/echanges.sql)
//  Le signet « Échanges » du grimoire ouvre le marché sous le livre :
//  - Proposer : choisir un ami ; les cartes qu'on donne se touchent DANS LES PAGES DU GRIMOIRE
//    (JS/collection.js demande basculerDonnee), celles qu'on demande dans « Son grimoire » ;
//    elles se posent en éventail sur la table ; un petit mot, puis « Proposer l'échange »
//  - Courrier : les lettres reçues (sceller l'accord / refuser) et envoyées (annuler)
//  - Registre : les derniers échanges
//  Tout est vérifié par le serveur ; un échange accepté met le grimoire à jour (surEchange).
// =====================================================================
import { supabase } from './supabase.js';
import { $, esc, notifier } from './commun.js';
import { htmlCarte, ouvrirApercu } from './cartes.js';

const MAX = 5;
const STATUTS = { accepte: 'Accepté', refuse: 'Refusé', annule: 'Annulé', impossible: 'Impossible' };

const etat = {
  moi: null,
  mesCartes: () => [],     // mes cartes (fourni par collection.js)
  surDonnees: () => {},    // redessine le grimoire (cartes sur la table, cartes bloquées)
  surEchange: async () => {},
  ouvert: false,
  ami: null,
  sesCartes: [],
  donnees: new Set(),
  demandees: new Set(),
  cartes: new Map(),
  joueurs: new Map(),
};

// --- Ce que le grimoire doit savoir --------------------------------------
// Le mode échange est actif quand le marché est ouvert sur « Proposer » avec un ami choisi
export const modeEchange = () => etat.ouvert && !!etat.ami && !$('proposer-cartes').hidden
  && !document.querySelector('[data-panneau="proposer"]').hidden;
export const estSurLaTable = (id) => etat.donnees.has(id);

// Une carte du grimoire touchée en mode échange : posée sur la table, ou reprise
export function basculerDonnee(id) {
  if (!etat.ami) { notifier('Choisis d’abord avec qui échanger.', 'erreur'); return; }
  if (etat.donnees.has(id)) etat.donnees.delete(id);
  else if (etat.donnees.size >= MAX) { notifier(`${MAX} cartes au plus de chaque côté.`, 'erreur'); return; }
  else etat.donnees.add(id);
  afficherTable();
  etat.surDonnees();
}

export async function initEchanges({ moi, mesCartes, surDonnees, surEchange }) {
  Object.assign(etat, { moi, mesCartes, surDonnees, surEchange });
  $('btn-marche').addEventListener('click', () => (etat.ouvert ? fermerMarche() : ouvrirMarche()));
  $('marche').addEventListener('click', clicMarche);
  $('recherche-ami').addEventListener('input', saisieAmi);
  $('btn-proposer').addEventListener('click', proposer);
  await afficherCourrier();
}

export async function ouvrirMarche(avec = null, onglet = null) {
  etat.ouvert = true;
  $('marche').hidden = false;
  $('btn-marche').setAttribute('aria-expanded', 'true');
  $('btn-marche').classList.add('est-ouvert');
  if (onglet) choisirOnglet(onglet);
  if (avec && avec !== etat.moi.discord_id) {
    const { data: j } = await supabase.from('players').select('discord_id, username, avatar_url').eq('discord_id', avec).maybeSingle();
    if (j) await choisirAmi(j);
  }
  etat.surDonnees();
  $('marche').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function fermerMarche() {
  etat.ouvert = false;
  $('marche').hidden = true;
  $('btn-marche').setAttribute('aria-expanded', 'false');
  $('btn-marche').classList.remove('est-ouvert');
  etat.surDonnees();
}

function choisirOnglet(nom) {
  document.querySelectorAll('.marche__onglet').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.onglet === nom)));
  document.querySelectorAll('.marche__panneau').forEach((p) => { p.hidden = p.dataset.panneau !== nom; });
  etat.surDonnees();
}


// ---------------------------------------------------------------------
//  Courrier et registre
// ---------------------------------------------------------------------
async function afficherCourrier() {
  const { data, error } = await supabase.from('echanges').select('*').order('cree_le', { ascending: false }).limit(60);
  if (error) {
    const absent = /schema cache|does not exist|PGRST20[25]/.test(`${error.code} ${error.message}`);
    $('recus').innerHTML = `<p class="echanges__vide">${absent ? 'Les échanges ne sont pas encore installés (SQL/echanges.sql).' : 'Impossible de charger le courrier.'}</p>`;
    return;
  }
  const liste = data ?? [];
  const ids = [...new Set(liste.flatMap((e) => [...e.cartes_donnees, ...e.cartes_demandees]))].filter((id) => !etat.cartes.has(id));
  const joueurs = [...new Set(liste.flatMap((e) => [e.de, e.pour]))].filter((id) => !etat.joueurs.has(id));
  const [{ data: cartes }, { data: profils }] = await Promise.all([
    ids.length ? supabase.from('cards').select('*').in('id', ids) : { data: [] },
    joueurs.length ? supabase.from('players').select('discord_id, username, avatar_url').in('discord_id', joueurs) : { data: [] },
  ]);
  (cartes ?? []).forEach((c) => etat.cartes.set(c.id, c));
  (profils ?? []).forEach((j) => etat.joueurs.set(j.discord_id, j));

  const moi = etat.moi.discord_id;
  const recus = liste.filter((e) => e.statut === 'en_attente' && e.pour === moi);
  const envoyes = liste.filter((e) => e.statut === 'en_attente' && e.de === moi);
  const faits = liste.filter((e) => e.statut !== 'en_attente').slice(0, 12);
  // Le nombre de lettres qui attendent une réponse : sur le signet, l'onglet et l'accueil de la collection
  for (const id of ['badge-echanges', 'badge-hub']) {
    $(id).textContent = recus.length;
    $(id).hidden = !recus.length;
  }
  $('compte-recus').textContent = recus.length ? `(${recus.length})` : '';
  $('compte-envoyes').textContent = envoyes.length ? `(${envoyes.length})` : '';
  $('recus').innerHTML = recus.length ? recus.map((e) => htmlLettre(e, 'recu')).join('') : '<p class="echanges__vide">Aucune lettre ne t’attend pour l’instant.</p>';
  $('envoyes').innerHTML = envoyes.length ? envoyes.map((e) => htmlLettre(e, 'envoye')).join('') : '<p class="echanges__vide">Aucune lettre en route.</p>';
  $('historique-echanges').innerHTML = faits.length ? faits.map((e) => htmlLettre(e, 'fait')).join('') : '<p class="echanges__vide">Le registre est encore vierge.</p>';
}

const nomDe = (id) => etat.joueurs.get(id)?.username ?? 'Un joueur';
const avatar = (j) => (j?.avatar_url ? `<img class="proposer__avatar" src="${esc(j.avatar_url)}" alt="">` : '<span class="proposer__avatar" aria-hidden="true">✦</span>');
const loupe = (id) => `<button type="button" class="echange__loupe" data-loupe-echange="${id}" title="Voir la carte en grand" aria-label="Voir la carte en grand">🔍</button>`;
const eventail = (ids, vide = 'Rien') => (ids.length
  ? `<div class="eventail" style="--n:${ids.length}">${ids.map((id, i) => {
    const c = etat.cartes.get(id);
    return c ? `<span class="eventail__carte" style="--k:${(i - (ids.length - 1) / 2).toFixed(1)}">${htmlCarte(c)}${loupe(id)}</span>` : '';
  }).join('')}</div>`
  : `<div class="eventail eventail--vide"><span>${vide}</span></div>`);

// Un échange, comme une lettre scellée : ce que je donne et ce que je reçois
function htmlLettre(e, type) {
  const jeDonne = e.de === etat.moi.discord_id ? e.cartes_donnees : e.cartes_demandees;
  const jeRecois = e.de === etat.moi.discord_id ? e.cartes_demandees : e.cartes_donnees;
  const autre = e.de === etat.moi.discord_id ? e.pour : e.de;
  const titre = type === 'recu' ? `<b>${esc(nomDe(autre))}</b> te propose un marché`
    : type === 'envoye' ? `Pour <b>${esc(nomDe(autre))}</b>` : `Avec <b>${esc(nomDe(autre))}</b>`;
  let actions = '';
  if (type === 'recu') actions = `<button type="button" class="btn-petit btn-petit--retirer" data-refuser="${e.id}">Refuser</button><button type="button" class="btn-dc-or" data-accepter="${e.id}">Sceller l'accord</button>`;
  if (type === 'envoye') actions = `<span class="lettre__attente">En attente de réponse…</span><button type="button" class="btn-petit btn-petit--retirer" data-annuler="${e.id}">Annuler</button>`;
  return `
    <article class="lettre lettre--${type}${type === 'fait' ? ` lettre--${e.statut}` : ''}">
      <span class="lettre__cachet" aria-hidden="true">⇄</span>
      <header class="lettre__tete">
        ${avatar(etat.joueurs.get(autre))}
        <span class="lettre__de">${titre}</span>
        ${type === 'fait' ? `<span class="lettre__statut">${STATUTS[e.statut] ?? e.statut}</span>` : ''}
        <time datetime="${esc(e.traite_le ?? e.cree_le)}">${new Date(e.traite_le ?? e.cree_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</time>
      </header>
      ${e.message ? `<p class="lettre__mot">« ${esc(e.message)} »</p>` : ''}
      ${e.raison ? `<p class="lettre__raison">${esc(e.raison)}</p>` : ''}
      <div class="lettre__marche">
        <div class="lettre__cote"><h4>Tu donnes</h4>${eventail(jeDonne)}</div>
        <span class="lettre__balance" aria-hidden="true">⚖</span>
        <div class="lettre__cote"><h4>Tu reçois</h4>${eventail(jeRecois)}</div>
      </div>
      ${actions ? `<footer class="lettre__actions">${actions}</footer>` : ''}
    </article>`;
}

async function clicMarche(e) {
  const onglet = e.target.closest('.marche__onglet');
  if (onglet) { choisirOnglet(onglet.dataset.onglet); return; }
  const loupeBtn = e.target.closest('[data-loupe-echange]');
  if (loupeBtn) { ouvrirApercu(etat.cartes.get(Number(loupeBtn.dataset.loupeEchange))); return; }
  const ami = e.target.closest('[data-ami]');
  if (ami) { choisirAmi(etat.joueurs.get(ami.dataset.ami)); return; }
  if (e.target.closest('#changer-ami')) { oublierAmi(); return; }
  // Une carte de son grimoire, ou une carte posée sur la table
  const carte = e.target.closest('.proposer__carte');
  if (carte && !carte.disabled) {
    const id = Number(carte.dataset.id);
    if (carte.dataset.cote === 'donne') { basculerDonnee(id); return; }
    if (etat.demandees.has(id)) etat.demandees.delete(id);
    else if (etat.demandees.size >= MAX) { notifier(`${MAX} cartes au plus de chaque côté.`, 'erreur'); return; }
    else etat.demandees.add(id);
    afficherSesCartes();
    afficherTable();
    return;
  }
  const bouton = e.target.closest('[data-accepter], [data-refuser], [data-annuler]');
  if (!bouton || bouton.disabled) return;
  bouton.disabled = true;
  if (bouton.dataset.accepter) {
    const { data, error } = await supabase.rpc('accepter_echange', { p_id: Number(bouton.dataset.accepter) });
    if (error) notifier(error.message || 'Échange impossible.', 'erreur');
    else if (!data?.ok) notifier(`Échange impossible : ${data?.raison ?? ''}`, 'erreur');
    else {
      notifier('Accord scellé ! Tes nouvelles cartes sont rangées dans ton grimoire.');
      await etat.surEchange();
      if (etat.ami) await choisirAmi(etat.ami);
    }
  } else if (bouton.dataset.refuser) {
    const { error } = await supabase.rpc('refuser_echange', { p_id: Number(bouton.dataset.refuser) });
    notifier(error ? error.message : 'Proposition refusée.', error ? 'erreur' : 'ok');
  } else {
    const { error } = await supabase.rpc('annuler_echange', { p_id: Number(bouton.dataset.annuler) });
    notifier(error ? error.message : 'Proposition annulée.', error ? 'erreur' : 'ok');
  }
  await afficherCourrier();
}


// ---------------------------------------------------------------------
//  Proposer : l'ami
// ---------------------------------------------------------------------
let minuteurRecherche;
function saisieAmi(e) {
  clearTimeout(minuteurRecherche);
  const texte = e.target.value.trim();
  if (texte.length < 2) { $('resultats-ami').hidden = true; return; }
  minuteurRecherche = setTimeout(() => chercherAmi(texte), 250);
}

async function chercherAmi(texte) {
  const motif = `%${texte.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data } = await supabase.from('players').select('discord_id, username, avatar_url')
    .ilike('username', motif).neq('discord_id', etat.moi.discord_id).order('username').limit(8);
  const liste = data ?? [];
  liste.forEach((j) => etat.joueurs.set(j.discord_id, j));
  $('resultats-ami').innerHTML = liste.length
    ? liste.map((j) => `<li><button type="button" data-ami="${esc(j.discord_id)}">${avatar(j)}<span>${esc(j.username ?? 'Aventurier')}</span></button></li>`).join('')
    : '<li class="vide">Aucun joueur trouvé.</li>';
  $('resultats-ami').hidden = false;
}

async function choisirAmi(j) {
  if (!j) return;
  etat.ami = j;
  etat.joueurs.set(j.discord_id, j);
  $('resultats-ami').hidden = true;
  $('recherche-ami').value = '';
  $('ami-choisi').hidden = false;
  $('ami-choisi').innerHTML = `${avatar(j)}<b>${esc(j.username ?? 'Aventurier')}</b><button type="button" class="btn-petit" id="changer-ami">Changer</button>`;
  $('titre-ses-cartes').textContent = `Le grimoire de ${j.username ?? 'ton ami'}`;
  const { data, error } = await supabase.rpc('cartes_du_joueur', { p_discord_id: j.discord_id });
  if (error) { notifier(error.message || 'Impossible de voir ses cartes.', 'erreur'); return; }
  etat.sesCartes = data ?? [];
  etat.sesCartes.forEach((c) => etat.cartes.set(c.id, c));
  // On garde ce qui est encore possible (une carte déjà possédée ajoute simplement un exemplaire)
  const siennes = new Set(etat.sesCartes.map((c) => c.id));
  etat.donnees = new Set([...etat.donnees].filter((id) => etat.mesCartes().some((c) => c.id === id)));
  etat.demandees = new Set([...etat.demandees].filter((id) => siennes.has(id)));
  $('proposer-cartes').hidden = false;
  $('marche-aide').textContent = 'Touche dans ton grimoire les cartes que tu donnes (elles se posent sur la table), et dans le sien celles que tu demandes.';
  afficherSesCartes();
  afficherTable();
  etat.surDonnees();
}

function oublierAmi() {
  etat.ami = null;
  etat.sesCartes = [];
  etat.donnees.clear();
  etat.demandees.clear();
  $('ami-choisi').hidden = true;
  $('proposer-cartes').hidden = true;
  $('marche-aide').textContent = 'Choisis un ami, puis touche dans ton grimoire les cartes que tu lui donnes.';
  $('recherche-ami').focus();
  etat.surDonnees();
}


// ---------------------------------------------------------------------
//  Proposer : son grimoire et la table
// ---------------------------------------------------------------------
function afficherSesCartes() {
  const miennes = new Set(etat.mesCartes().map((c) => c.id));
  $('ses-cartes').innerHTML = etat.sesCartes.length
    ? etat.sesCartes.map((c) => {
      const choisie = etat.demandees.has(c.id);
      const dejaAMoi = miennes.has(c.id);   // permis : ce sera un exemplaire de plus
      return `<span class="proposer__tuile${choisie ? ' est-choisie' : ''}">
        <button type="button" class="proposer__carte" data-cote="demande" data-id="${c.id}" aria-pressed="${choisie}"
          ${dejaAMoi ? 'title="Tu l’as déjà : ce sera un exemplaire de plus"' : ''}>${htmlCarte(c)}</button>
        ${dejaAMoi ? '<span class="proposer__deja">déjà à toi</span>' : ''}
        ${loupe(c.id)}
      </span>`;
    }).join('')
    : '<p class="echanges__vide">Son grimoire est vide.</p>';
}

function afficherTable() {
  etat.mesCartes().forEach((c) => etat.cartes.set(c.id, c));
  const surTable = (ids, cote, vide) => (ids.length
    ? `<div class="eventail eventail--table" style="--n:${ids.length}">${ids.map((id, i) => `
      <button type="button" class="eventail__carte proposer__carte" data-cote="${cote}" data-id="${id}"
        style="--k:${(i - (ids.length - 1) / 2).toFixed(1)}" title="Reprendre cette carte">${htmlCarte(etat.cartes.get(id))}</button>`).join('')}</div>`
    : `<div class="eventail eventail--vide"><span>${vide}</span></div>`);
  $('table-donnees').innerHTML = surTable([...etat.donnees], 'donne', 'Touche une carte de ton grimoire');
  $('table-demandees').innerHTML = surTable([...etat.demandees], 'demande', 'Choisis une carte du sien');
  $('compte-donnees').textContent = `${etat.donnees.size} / ${MAX}`;
  $('compte-demandees').textContent = `${etat.demandees.size} / ${MAX}`;
  $('btn-proposer').disabled = etat.donnees.size + etat.demandees.size === 0;
}

async function proposer() {
  if (!etat.ami) return;
  $('btn-proposer').disabled = true;
  const { error } = await supabase.rpc('proposer_echange', {
    p_pour: etat.ami.discord_id,
    p_donnees: [...etat.donnees],
    p_demandees: [...etat.demandees],
    p_message: $('message-echange').value.trim() || null,
  });
  if (error) {
    notifier(error.message || 'Proposition impossible.', 'erreur');
    $('btn-proposer').disabled = false;
    return;
  }
  notifier(`Lettre envoyée à ${etat.ami.username ?? 'ton ami'} !`);
  etat.donnees.clear();
  etat.demandees.clear();
  $('message-echange').value = '';
  afficherSesCartes();
  afficherTable();
  etat.surDonnees();
  await afficherCourrier();
}
