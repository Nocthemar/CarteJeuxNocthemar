// =====================================================================
//  Le marché du grimoire : le commerce entre joueurs (SQL/commerce.sql)
//  Le signet « Échanges » du grimoire ouvre le marché sous le livre :
//  - Rédiger : un CONTRAT avec un joueur. Les cartes qu'on donne se touchent DANS LES PAGES DU
//    GRIMOIRE (JS/collection.js demande basculerDonnee), celles qu'on demande dans « Son grimoire » ;
//    on ajoute de l'or et des objets / cosmétiques de chaque côté. « Rédiger et apposer mon sceau ».
//  - Contrats : les contrats ouverts, sur parchemin. Chacun appose son sceau de cire ; le second
//    sceau ratifie le contrat. Le modifier brise les sceaux (il faut revalider), le rompre l'annule.
//  - Souhaits : les cartes qu'on recherche (vues par les autres joueurs).
//  - Registre : contrats ratifiés ou rompus, ventes du Marché (marche.html) conclues.
//  Les favorites (dernier exemplaire d'une carte du deck du profil) sont protégées.
//  Tout est vérifié par le serveur ; un contrat ratifié met le grimoire à jour (surEchange).
// =====================================================================
import { supabase } from './supabase.js';
import { $, esc, notifier } from './commun.js';
import { htmlCarte, ouvrirApercu } from './cartes.js';
import { jouerSon } from './jeu-cartes-son.js';

const MAX_CARTES = 6;
const MAX_OBJETS = 4;
const STATUTS = { ratifie: 'Ratifié', rompu: 'Rompu', impossible: 'Impossible' };
// Valeur indicative d'une carte selon sa rareté (pour estimer l'équilibre d'un contrat)
const VALEUR = { commune: 50, eveillee: 100, mythique: 250, legendaire: 600, transcendante: 1500 };
const TYPES_OBJET = { title: 'Titre', banner: 'Bannière', theme: 'Thème' };

const etat = {
  moi: null,
  mesCartes: () => [],     // mes cartes (fourni par collection.js)
  protegee: () => false,   // dernier exemplaire d'une favorite ? (fourni par collection.js)
  surDonnees: () => {},    // redessine le grimoire (cartes sur la table)
  surEchange: async () => {},
  ouvert: false,
  ami: null,
  sesCartes: [],
  sesObjets: [],
  mesObjets: [],
  souhaitsAmi: new Set(),
  donnees: new Set(),
  demandees: new Set(),
  objetsDonnes: new Set(),
  objetsDemandes: new Set(),
  edition: null,           // { id, version } : un contrat en cours de modification
  cartes: new Map(),       // id -> carte (table cards)
  objets: new Map(),       // id -> objet (table items)
  joueurs: new Map(),
  souhaits: new Set(),     // mes souhaits (ids de cartes)
  catalogue: null,
  contratsVus: new Map(),  // id -> statut (pour signaler une ratification faite par l'autre)
};
const moi = () => etat.moi.discord_id;
const nomDe = (id) => etat.joueurs.get(id)?.username ?? 'Un joueur';
const valeurCarte = (c) => VALEUR[c?.rarity] ?? VALEUR.commune;
const valeurObjet = (o) => Number(o?.price ?? o?.prix ?? 100) || 100;
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const absent = (error) => /schema cache|does not exist|PGRST20[25]|42P01/.test(`${error?.code} ${error?.message}`);

// --- Ce que le grimoire doit savoir --------------------------------------
// Le mode échange est actif quand le marché est ouvert sur « Rédiger » avec un joueur choisi
export const modeEchange = () => etat.ouvert && !!etat.ami && !$('proposer-cartes').hidden
  && !document.querySelector('[data-panneau="proposer"]').hidden;
export const estSurLaTable = (id) => etat.donnees.has(id);

// Une carte du grimoire touchée en mode échange : posée sur la table, ou reprise
export function basculerDonnee(id) {
  if (!etat.ami) { notifier('Choisis d’abord avec qui échanger.', 'erreur'); return; }
  if (etat.donnees.has(id)) etat.donnees.delete(id);
  else if (etat.protegee(id)) { notifier('C’est une de tes favorites (dernier exemplaire) : retire-la d’abord des favorites.', 'erreur'); return; }
  else if (etat.donnees.size >= MAX_CARTES) { notifier(`${MAX_CARTES} cartes au plus de chaque côté.`, 'erreur'); return; }
  else etat.donnees.add(id);
  afficherTable();
  etat.surDonnees();
}

export async function initEchanges({ moi: joueur, mesCartes, protegee, surDonnees, surEchange }) {
  Object.assign(etat, { moi: joueur, mesCartes, surDonnees, surEchange });
  if (protegee) etat.protegee = protegee;
  etat.joueurs.set(joueur.discord_id, joueur);
  $('btn-marche').addEventListener('click', () => (etat.ouvert ? fermerMarche() : ouvrirMarche()));
  $('marche').addEventListener('click', clicMarche);
  $('marche').addEventListener('input', saisieMarche);
  $('marche').addEventListener('change', saisieMarche);
  $('recherche-ami').addEventListener('input', saisieAmi);
  $('btn-proposer').addEventListener('click', proposer);
  $('btn-annuler-edition').addEventListener('click', () => { quitterEdition(); afficherTable(); });
  // Les contrats se mettent à jour pendant que le marché est ouvert (le sceau de l'autre, une ratification)
  setInterval(() => { if (etat.ouvert && !document.hidden) afficherContrats(); }, 15000);
  await Promise.all([chargerBourse(), chargerSouhaits()]);
  await afficherContrats();
}

export async function ouvrirMarche(avec = null, onglet = null) {
  etat.ouvert = true;
  $('marche').hidden = false;
  $('btn-marche').setAttribute('aria-expanded', 'true');
  $('btn-marche').classList.add('est-ouvert');
  if (onglet) choisirOnglet(onglet);
  if (avec && avec !== moi()) {
    const { data: j } = await supabase.from('players').select('discord_id, username, avatar_url').eq('discord_id', avec).maybeSingle();
    if (j) { choisirOnglet('proposer'); await choisirAmi(j); }
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
  if (nom === 'souhaits') afficherSouhaits();
  if (nom === 'courrier' || nom === 'registre') afficherContrats();
  etat.surDonnees();
}

async function chargerBourse() {
  const { data } = await supabase.from('wallets').select('balance').eq('discord_id', moi()).maybeSingle();
  $('marche-bourse').textContent = nombre(data?.balance ?? 0);
}

// Cartes, objets et joueurs à connaître pour afficher des contrats et des annonces
async function precharger({ cartes = [], objets = [], joueurs = [] }) {
  const ids = [...new Set(cartes)].filter((id) => id != null && !etat.cartes.has(id));
  const obj = [...new Set(objets)].filter((id) => id != null && !etat.objets.has(String(id)));
  const jou = [...new Set(joueurs)].filter((id) => id && !etat.joueurs.has(id));
  const [{ data: c }, { data: o }, { data: j }] = await Promise.all([
    ids.length ? supabase.from('cards').select('*').in('id', ids) : { data: [] },
    obj.length ? supabase.from('items').select('*').in('id', obj) : { data: [] },
    jou.length ? supabase.from('players').select('discord_id, username, avatar_url').in('discord_id', jou) : { data: [] },
  ]);
  (c ?? []).forEach((x) => etat.cartes.set(x.id, x));
  (o ?? []).forEach((x) => etat.objets.set(String(x.id), x));
  (j ?? []).forEach((x) => etat.joueurs.set(x.discord_id, x));
}


// ---------------------------------------------------------------------
//  Éléments communs : cartes en éventail, objets, sceaux de cire, valeur
// ---------------------------------------------------------------------
const avatar = (j) => (j?.avatar_url ? `<img class="proposer__avatar" src="${esc(j.avatar_url)}" alt="">` : '<span class="proposer__avatar" aria-hidden="true">✦</span>');
const loupe = (id) => `<button type="button" class="echange__loupe" data-loupe-echange="${id}" title="Voir la carte en grand" aria-label="Voir la carte en grand">🔍</button>`;
const eventail = (ids, vide = 'Aucune carte') => (ids.length
  ? `<div class="eventail" style="--n:${ids.length}">${ids.map((id, i) => {
    const c = etat.cartes.get(id);
    return c ? `<span class="eventail__carte" style="--k:${(i - (ids.length - 1) / 2).toFixed(1)}">${htmlCarte(c)}${loupe(id)}</span>` : '';
  }).join('')}</div>`
  : `<div class="eventail eventail--vide"><span>${vide}</span></div>`);
const nomObjet = (id) => etat.objets.get(String(id))?.name ?? 'Objet';
const etiquetteObjet = (id, extra = '') => {
  const o = etat.objets.get(String(id));
  return `<span class="objet-puce${extra}">${o?.kind && TYPES_OBJET[o.kind] ? `<small>${TYPES_OBJET[o.kind]}</small>` : ''}${esc(nomObjet(id))}</span>`;
};

// Le sceau de cire d'un joueur : ses initiales dans la cire, son pseudo autour
function sceau(joueurId, pose) {
  const nom = nomDe(joueurId);
  const initiales = nom.split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '✦';
  if (!pose) {
    return `<span class="sceau sceau--vide" title="En attente du sceau de ${esc(nom)}">
      <span class="sceau__cercle"></span><span class="sceau__nom">${esc(nom)}</span></span>`;
  }
  return `<span class="sceau sceau--pose" title="Sceau de ${esc(nom)}">
    <span class="sceau__cire"><b>${esc(initiales)}</b></span><span class="sceau__nom">${esc(nom)}</span></span>`;
}

const valeurCote = (cartes, or, objets) => cartes.reduce((s, id) => s + valeurCarte(etat.cartes.get(id)), 0)
  + (Number(or) || 0) + objets.reduce((s, id) => s + valeurObjet(etat.objets.get(String(id))), 0);
function texteEquilibre(donne, recoit) {
  if (!donne && !recoit) return '';
  const ecart = recoit - donne;
  const rel = Math.abs(ecart) / Math.max(donne, recoit, 1);
  if (rel < 0.15) return '⚖ Échange équilibré (estimation)';
  return ecart > 0 ? `⚖ Penche en ta faveur d’environ ${nombre(ecart)} or (estimation)` : `⚖ Penche en sa faveur d’environ ${nombre(-ecart)} or (estimation)`;
}


// ---------------------------------------------------------------------
//  Contrats (ouverts) et registre
// ---------------------------------------------------------------------
async function afficherContrats() {
  const { data, error } = await supabase.from('contrats').select('*').order('maj_le', { ascending: false }).limit(80);
  if (error) {
    $('contrats').innerHTML = `<p class="echanges__vide">${absent(error) ? 'Le marché n’est pas encore installé (SQL/commerce.sql).' : 'Impossible de charger les contrats.'}</p>`;
    return;
  }
  const liste = data ?? [];
  const { data: conclues } = await supabase.from('annonces').select('*')
    .or(`auteur.eq.${moi()},conclu_par.eq.${moi()}`).eq('statut', 'conclue').order('conclu_le', { ascending: false }).limit(20);
  await precharger({
    cartes: [...liste.flatMap((c) => [...c.cartes_de, ...c.cartes_pour]), ...(conclues ?? []).map((a) => a.card_id)],
    objets: liste.flatMap((c) => [...c.objets_de, ...c.objets_pour]),
    joueurs: [...liste.flatMap((c) => [c.de, c.pour]), ...(conclues ?? []).flatMap((a) => [a.auteur, a.conclu_par])],
  });

  // Un contrat ratifié par l'autre joueur depuis le dernier passage : on le signale et on recharge le grimoire
  let ratifies = 0;
  for (const c of liste) {
    if (etat.contratsVus.get(c.id) === 'ouvert' && c.statut === 'ratifie') ratifies += 1;
    etat.contratsVus.set(c.id, c.statut);
  }
  if (ratifies) {
    notifier(ratifies > 1 ? `${ratifies} contrats ont été ratifiés !` : 'Un contrat a été ratifié : ton grimoire est à jour.');
    await Promise.all([etat.surEchange(), chargerBourse()]);
  }

  const ouverts = liste.filter((c) => c.statut === 'ouvert');
  const aSigner = ouverts.filter((c) => !(c.de === moi() ? c.sceau_de : c.sceau_pour));
  for (const id of ['badge-echanges', 'badge-hub']) {
    $(id).textContent = aSigner.length;
    $(id).hidden = !aSigner.length;
  }
  $('compte-recus').textContent = aSigner.length ? `(${aSigner.length})` : '';
  $('contrats').innerHTML = ouverts.length ? ouverts.map((c) => htmlContrat(c)).join('')
    : '<p class="echanges__vide">Aucun contrat ouvert. Rédige-en un avec un joueur.</p>';

  const clos = liste.filter((c) => c.statut !== 'ouvert').slice(0, 15);
  const registre = [
    ...clos.map((c) => ({ date: c.ratifie_le ?? c.maj_le, html: htmlContrat(c, true) })),
    ...(conclues ?? []).map((a) => ({ date: a.conclu_le, html: htmlAnnonceConclue(a) })),
  ].sort((x, y) => new Date(y.date) - new Date(x.date));
  $('historique-echanges').innerHTML = registre.length ? registre.map((x) => x.html).join('') : '<p class="echanges__vide">Le registre est encore vierge.</p>';
}

// Un contrat, comme un parchemin : ce que chacun donne, la valeur estimée, les deux sceaux
function htmlContrat(c, clos = false) {
  const jeSuisDe = c.de === moi();
  const autre = jeSuisDe ? c.pour : c.de;
  const monSceau = jeSuisDe ? c.sceau_de : c.sceau_pour;
  const sonSceau = jeSuisDe ? c.sceau_pour : c.sceau_de;
  const cote = (joueur, cartes, or, objets) => `
    <div class="contrat__cote">
      <h4>${joueur === moi() ? 'Tu donnes' : `${esc(nomDe(joueur))} donne`}</h4>
      ${eventail(cartes)}
      ${or > 0 ? `<p class="contrat__or"><span aria-hidden="true">◉</span> ${nombre(or)} or</p>` : ''}
      ${objets.length ? `<p class="contrat__objets">${objets.map((id) => etiquetteObjet(id)).join('')}</p>` : ''}
      <p class="contrat__valeur">≈ ${nombre(valeurCote(cartes, or, objets))} or</p>
    </div>`;
  const brises = !clos && !c.sceau_de && !c.sceau_pour && c.version > 1 && c.modifie_par;
  let actions = '';
  if (!clos) {
    actions = monSceau
      ? `<span class="contrat__attente">Ton sceau est apposé : en attente de celui de ${esc(nomDe(autre))}…</span>`
      : `<button type="button" class="btn-dc-or btn-sceau" data-sceau="${c.id}" data-version="${c.version}">Apposer mon sceau</button>`;
    actions += `<button type="button" class="btn-petit" data-modifier="${c.id}">Modifier</button>
      <button type="button" class="btn-petit btn-petit--retirer" data-rompre="${c.id}">Rompre</button>`;
  }
  const date = new Date(c.ratifie_le ?? c.maj_le ?? c.cree_le);
  return `
    <article class="contrat${clos ? ` contrat--clos contrat--${c.statut}` : ''}" data-contrat="${c.id}">
      <header class="contrat__tete">
        <h3 class="contrat__titre">Contrat n°${c.id}</h3>
        <p class="contrat__parties">Entre <b>${esc(nomDe(c.de))}</b> et <b>${esc(nomDe(c.pour))}</b></p>
        ${clos ? `<span class="contrat__statut">${STATUTS[c.statut] ?? c.statut}</span>` : ''}
        <time datetime="${esc(date.toISOString())}">${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</time>
      </header>
      ${c.message ? `<p class="contrat__clause">« ${esc(c.message)} »</p>` : ''}
      <div class="contrat__termes">
        ${cote(c.de, c.cartes_de, c.or_de, c.objets_de)}
        <span class="contrat__balance" aria-hidden="true">⚖</span>
        ${cote(c.pour, c.cartes_pour, c.or_pour, c.objets_pour)}
      </div>
      ${brises ? `<p class="contrat__brise">Sceaux brisés : ${c.modifie_par === moi() ? 'tu as' : `${esc(nomDe(c.modifie_par))} a`} modifié le contrat. Relisez-le et apposez à nouveau vos sceaux.</p>` : ''}
      ${c.raison ? `<p class="contrat__raison">${esc(c.raison)}</p>` : ''}
      <div class="contrat__sceaux">
        ${sceau(c.de, c.statut === 'ratifie' || c.sceau_de)}
        ${sceau(c.pour, c.statut === 'ratifie' || c.sceau_pour)}
      </div>
      ${actions ? `<footer class="contrat__actions">${actions}</footer>` : ''}
    </article>`;
}

function htmlAnnonceConclue(a) {
  const c = etat.cartes.get(a.card_id);
  const vendeur = a.type === 'vente' ? a.auteur : a.conclu_par;
  const acheteur = a.type === 'vente' ? a.conclu_par : a.auteur;
  return `
    <article class="contrat contrat--clos contrat--ratifie contrat--annonce">
      <header class="contrat__tete">
        <h3 class="contrat__titre">Marché</h3>
        <p class="contrat__parties"><b>${esc(nomDe(vendeur))}</b> a vendu « ${esc(c?.name ?? 'une carte')} » à <b>${esc(nomDe(acheteur))}</b> pour ${nombre(a.prix)} or</p>
        <time datetime="${esc(a.conclu_le)}">${new Date(a.conclu_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</time>
      </header>
    </article>`;
}


// ---------------------------------------------------------------------
//  Clics et saisies dans le marché
// ---------------------------------------------------------------------
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
    basculer(etat.demandees, id, MAX_CARTES, `${MAX_CARTES} cartes au plus de chaque côté.`);
    afficherSesCartes();
    afficherTable();
    return;
  }
  // Un objet (le mien, ou le sien)
  const objet = e.target.closest('[data-objet]');
  if (objet) {
    basculer(objet.dataset.cote === 'donne' ? etat.objetsDonnes : etat.objetsDemandes, objet.dataset.objet, MAX_OBJETS, `${MAX_OBJETS} objets au plus de chaque côté.`);
    afficherTable();
    return;
  }
  // Une carte qu'il souhaite et que j'ai : sur la table
  const souhaitee = e.target.closest('[data-donner]');
  if (souhaitee) { const id = Number(souhaitee.dataset.donner); if (!etat.donnees.has(id)) basculerDonnee(id); return; }
  // Souhaits
  const coeur = e.target.closest('[data-souhait]');
  if (coeur) { await basculerSouhait(Number(coeur.dataset.souhait)); return; }

  const bouton = e.target.closest('[data-sceau], [data-modifier], [data-rompre]');
  if (!bouton || bouton.disabled) return;
  if (bouton.dataset.modifier) { await chargerEdition(Number(bouton.dataset.modifier)); return; }
  bouton.disabled = true;
  if (bouton.dataset.sceau) await apposerSceau(Number(bouton.dataset.sceau), Number(bouton.dataset.version));
  else if (bouton.dataset.rompre) {
    if (!confirm('Rompre ce contrat ? Rien ne sera échangé.')) { bouton.disabled = false; return; }
    const { error } = await supabase.rpc('rompre_contrat', { p_id: Number(bouton.dataset.rompre) });
    notifier(error ? error.message : 'Contrat rompu.', error ? 'erreur' : 'ok');
    if (etat.edition?.id === Number(bouton.dataset.rompre)) quitterEdition();
    await afficherContrats();
  }
  bouton.disabled = false;
}

function basculer(ensemble, cle, max, message) {
  if (ensemble.has(cle)) ensemble.delete(cle);
  else if (ensemble.size >= max) { notifier(message, 'erreur'); return; }
  else ensemble.add(cle);
}

function saisieMarche(e) {
  if (e.target.matches('#or-donne, #or-demande')) afficherTable(false);
  else if (e.target.matches('#souhait-recherche')) afficherSouhaits();
}

async function apposerSceau(id, version) {
  const { data, error } = await supabase.rpc('apposer_sceau', { p_id: id, p_version: version });
  if (!error) jouerSon('cire');   // le sceau de cire se pose
  if (error) notifier(error.message || 'Impossible d’apposer ton sceau.', 'erreur');
  else if (data?.ratifie) {
    notifier('Les deux sceaux sont apposés : le contrat est ratifié ! Ton grimoire est à jour.');
    etat.contratsVus.set(id, 'ratifie');
    await Promise.all([etat.surEchange(), chargerBourse()]);
  } else if (data?.raison) notifier(`Ratification impossible : ${data.raison} Les sceaux sont brisés.`, 'erreur');
  else notifier('Ton sceau est apposé. Le contrat sera ratifié quand l’autre joueur aura apposé le sien.');
  await afficherContrats();
}


// ---------------------------------------------------------------------
//  Rédiger : le joueur
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
    .ilike('username', motif).neq('discord_id', moi()).order('username').limit(8);
  const liste = data ?? [];
  liste.forEach((j) => etat.joueurs.set(j.discord_id, j));
  $('resultats-ami').innerHTML = liste.length
    ? liste.map((j) => `<li><button type="button" data-ami="${esc(j.discord_id)}">${avatar(j)}<span>${esc(j.username ?? 'Aventurier')}</span></button></li>`).join('')
    : '<li class="vide">Aucun joueur trouvé.</li>';
  $('resultats-ami').hidden = false;
}

async function choisirAmi(j, garder = false) {
  if (!j) return;
  const change = etat.ami?.discord_id !== j.discord_id;
  if (change && etat.edition && !garder) quitterEdition();
  etat.ami = j;
  etat.joueurs.set(j.discord_id, j);
  $('resultats-ami').hidden = true;
  $('recherche-ami').value = '';
  $('ami-choisi').hidden = false;
  $('ami-choisi').innerHTML = `${avatar(j)}<b>${esc(j.username ?? 'Aventurier')}</b><button type="button" class="btn-petit" id="changer-ami">Changer</button>`;
  $('titre-ses-cartes').textContent = `Le grimoire de ${j.username ?? 'ce joueur'}`;
  const [cartes, sesObjets, mesObjets, souhaits] = await Promise.all([
    supabase.rpc('cartes_du_joueur', { p_discord_id: j.discord_id }),
    supabase.rpc('objets_du_joueur', { p_discord_id: j.discord_id }),
    supabase.rpc('objets_du_joueur', { p_discord_id: moi() }),
    supabase.from('souhaits').select('card_id').eq('discord_id', j.discord_id),
  ]);
  if (cartes.error) { notifier(cartes.error.message || 'Impossible de voir ses cartes.', 'erreur'); return; }
  etat.sesCartes = cartes.data ?? [];
  etat.sesCartes.forEach((c) => etat.cartes.set(c.id, c));
  etat.sesObjets = sesObjets.data ?? [];
  etat.mesObjets = mesObjets.data ?? [];
  [...etat.sesObjets, ...etat.mesObjets].forEach((o) => etat.objets.set(String(o.id), o));
  etat.souhaitsAmi = new Set((souhaits.data ?? []).map((s) => s.card_id));
  if (change && !garder) {
    etat.donnees.clear(); etat.demandees.clear(); etat.objetsDonnes.clear(); etat.objetsDemandes.clear();
    $('or-donne').value = 0; $('or-demande').value = 0;
  }
  $('proposer-cartes').hidden = false;
  $('marche-aide').textContent = 'Touche dans ton grimoire les cartes que tu donnes (elles se posent sur la table), et dans le sien celles que tu demandes. Ajoute de l’or ou des objets de chaque côté.';
  afficherSesCartes();
  afficherTable();
  etat.surDonnees();
}

function oublierAmi() {
  etat.ami = null;
  etat.sesCartes = [];
  quitterEdition();
  etat.donnees.clear(); etat.demandees.clear(); etat.objetsDonnes.clear(); etat.objetsDemandes.clear();
  $('ami-choisi').hidden = true;
  $('proposer-cartes').hidden = true;
  $('marche-aide').textContent = 'Choisis un joueur, puis touche dans ton grimoire les cartes que tu lui donnes.';
  $('recherche-ami').focus();
  etat.surDonnees();
}

// Modifier un contrat ouvert : il se recharge sur la table (les sceaux se briseront)
async function chargerEdition(id) {
  const { data: c, error } = await supabase.from('contrats').select('*').eq('id', id).maybeSingle();
  if (error || !c || c.statut !== 'ouvert') { notifier('Ce contrat n’est plus ouvert.', 'erreur'); await afficherContrats(); return; }
  const jeSuisDe = c.de === moi();
  const autre = jeSuisDe ? c.pour : c.de;
  await precharger({ joueurs: [autre] });
  etat.edition = { id: c.id, version: c.version };
  etat.donnees = new Set(jeSuisDe ? c.cartes_de : c.cartes_pour);
  etat.demandees = new Set(jeSuisDe ? c.cartes_pour : c.cartes_de);
  etat.objetsDonnes = new Set(jeSuisDe ? c.objets_de : c.objets_pour);
  etat.objetsDemandes = new Set(jeSuisDe ? c.objets_pour : c.objets_de);
  $('or-donne').value = jeSuisDe ? c.or_de : c.or_pour;
  $('or-demande').value = jeSuisDe ? c.or_pour : c.or_de;
  $('message-echange').value = c.message ?? '';
  choisirOnglet('proposer');
  await choisirAmi(etat.joueurs.get(autre) ?? { discord_id: autre, username: nomDe(autre) }, true);
  $('marche').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function quitterEdition() {
  etat.edition = null;
  $('contrat-edition').hidden = true;
  $('btn-annuler-edition').hidden = true;
}


// ---------------------------------------------------------------------
//  Rédiger : son grimoire, la table, les objets, la valeur
// ---------------------------------------------------------------------
function afficherSesCartes() {
  const miennes = new Set(etat.mesCartes().map((c) => c.id));
  $('ses-cartes').innerHTML = etat.sesCartes.length
    ? etat.sesCartes.map((c) => {
      const choisie = etat.demandees.has(c.id);
      const dejaAMoi = miennes.has(c.id);   // permis : ce sera un exemplaire de plus
      const souhait = etat.souhaits.has(c.id);
      return `<span class="proposer__tuile${choisie ? ' est-choisie' : ''}${souhait ? ' est-souhaitee' : ''}">
        <button type="button" class="proposer__carte" data-cote="demande" data-id="${c.id}" aria-pressed="${choisie}"
          ${dejaAMoi ? 'title="Tu l’as déjà : ce sera un exemplaire de plus"' : ''}>${htmlCarte(c)}</button>
        ${souhait ? '<span class="proposer__souhait" title="Sur ta liste de souhaits">♥</span>' : ''}
        ${dejaAMoi ? '<span class="proposer__deja">déjà à toi</span>' : ''}
        ${loupe(c.id)}
      </span>`;
    }).join('')
    : '<p class="echanges__vide">Son grimoire est vide.</p>';
  // Ses souhaits que j'ai dans mon grimoire
  const jePeux = etat.mesCartes().filter((c) => etat.souhaitsAmi.has(c.id));
  $('souhaits-ami').hidden = !jePeux.length;
  $('souhaits-ami').innerHTML = jePeux.length
    ? `<span>♥ ${esc(etat.ami?.username ?? 'Ce joueur')} recherche des cartes que tu as :</span> ${jePeux.map((c) =>
      `<button type="button" class="btn-petit" data-donner="${c.id}">${esc(c.name)}</button>`).join('')}` : '';
}

function afficherTable(objetsAussi = true) {
  etat.mesCartes().forEach((c) => etat.cartes.set(c.id, c));
  const surTable = (ids, cote, vide) => (ids.length
    ? `<div class="eventail eventail--table" style="--n:${ids.length}">${ids.map((id, i) => `
      <button type="button" class="eventail__carte proposer__carte" data-cote="${cote}" data-id="${id}"
        style="--k:${(i - (ids.length - 1) / 2).toFixed(1)}" title="Reprendre cette carte">${htmlCarte(etat.cartes.get(id))}</button>`).join('')}</div>`
    : `<div class="eventail eventail--vide"><span>${vide}</span></div>`);
  $('table-donnees').innerHTML = surTable([...etat.donnees], 'donne', 'Touche une carte de ton grimoire');
  $('table-demandees').innerHTML = surTable([...etat.demandees], 'demande', 'Choisis une carte du sien');
  $('compte-donnees').textContent = `${etat.donnees.size} / ${MAX_CARTES}`;
  $('compte-demandees').textContent = `${etat.demandees.size} / ${MAX_CARTES}`;
  if (objetsAussi) {
    const puces = (liste, choisis, cote, vide) => (liste.length
      ? liste.map((o) => `<button type="button" class="objet-puce objet-puce--choix${choisis.has(String(o.id)) ? ' est-choisi' : ''}" data-objet="${esc(String(o.id))}" data-cote="${cote}" aria-pressed="${choisis.has(String(o.id))}">
          ${o.kind && TYPES_OBJET[o.kind] ? `<small>${TYPES_OBJET[o.kind]}</small>` : ''}${esc(o.name)}</button>`).join('')
      : `<span class="objet-vide">${vide}</span>`);
    $('objets-donnes').innerHTML = `<span class="objets__titre">Objets et cosmétiques</span>${puces(etat.mesObjets, etat.objetsDonnes, 'donne', 'Tu n’as pas d’objet.')}`;
    $('objets-demandes').innerHTML = `<span class="objets__titre">Ses objets et cosmétiques</span>${puces(etat.sesObjets, etat.objetsDemandes, 'demande', 'Aucun objet.')}`;
  }
  const orDonne = Math.max(0, Number($('or-donne').value) || 0);
  const orDemande = Math.max(0, Number($('or-demande').value) || 0);
  const vDonne = valeurCote([...etat.donnees], orDonne, [...etat.objetsDonnes]);
  const vRecoit = valeurCote([...etat.demandees], orDemande, [...etat.objetsDemandes]);
  $('valeur-donne').textContent = vDonne ? `Valeur indicative ≈ ${nombre(vDonne)} or` : '';
  $('valeur-demande').textContent = vRecoit ? `Valeur indicative ≈ ${nombre(vRecoit)} or` : '';
  $('equilibre').textContent = texteEquilibre(vDonne, vRecoit);
  const vide = etat.donnees.size + etat.demandees.size + etat.objetsDonnes.size + etat.objetsDemandes.size === 0;
  $('btn-proposer').disabled = vide;
  $('btn-proposer').textContent = etat.edition ? 'Modifier le contrat et apposer mon sceau' : 'Rédiger et apposer mon sceau';
  $('contrat-edition').hidden = !etat.edition;
  $('btn-annuler-edition').hidden = !etat.edition;
  if (etat.edition) $('contrat-edition').textContent = `Modification du contrat n°${etat.edition.id} : les deux sceaux seront brisés, chacun devra revalider.`;
}

async function proposer() {
  if (!etat.ami) return;
  $('btn-proposer').disabled = true;
  const enEdition = !!etat.edition;
  const mien = { cartes: [...etat.donnees], or: Math.max(0, Math.floor(Number($('or-donne').value) || 0)), objets: [...etat.objetsDonnes] };
  const sien = { cartes: [...etat.demandees], or: Math.max(0, Math.floor(Number($('or-demande').value) || 0)), objets: [...etat.objetsDemandes] };
  const message = $('message-echange').value.trim() || null;
  let id;
  let version;
  if (etat.edition) {
    // Côtés du contrat : « de » est celui qui l'a rédigé à l'origine
    const { data: c } = await supabase.from('contrats').select('de').eq('id', etat.edition.id).maybeSingle();
    const jeSuisDe = c?.de === moi();
    const [de, pour] = jeSuisDe ? [mien, sien] : [sien, mien];
    const { data, error } = await supabase.rpc('modifier_contrat', {
      p_id: etat.edition.id, p_cartes_de: de.cartes, p_cartes_pour: pour.cartes, p_or_de: de.or, p_or_pour: pour.or,
      p_objets_de: de.objets, p_objets_pour: pour.objets, p_message: message,
    });
    if (error) { notifier(error.message || 'Modification impossible.', 'erreur'); $('btn-proposer').disabled = false; return; }
    id = etat.edition.id;
    version = data;
  } else {
    const { data, error } = await supabase.rpc('ouvrir_contrat', {
      p_pour: etat.ami.discord_id, p_cartes_de: mien.cartes, p_cartes_pour: sien.cartes, p_or_de: mien.or, p_or_pour: sien.or,
      p_objets_de: mien.objets, p_objets_pour: sien.objets, p_message: message,
    });
    if (error) { notifier(error.message || 'Contrat impossible.', 'erreur'); $('btn-proposer').disabled = false; return; }
    id = data;
    version = 1;
  }
  // Le rédacteur appose aussitôt son sceau
  const { error: errSceau } = await supabase.rpc('apposer_sceau', { p_id: id, p_version: version });
  if (!errSceau) jouerSon('cire');
  notifier(errSceau
    ? `Contrat enregistré, mais ton sceau n'a pas pu être apposé : ${errSceau.message}`
    : `Contrat ${enEdition ? 'modifié' : 'rédigé'} et scellé de ton côté. ${etat.ami.username ?? 'L’autre joueur'} doit maintenant apposer le sien.`, errSceau ? 'erreur' : 'ok');
  quitterEdition();
  etat.donnees.clear(); etat.demandees.clear(); etat.objetsDonnes.clear(); etat.objetsDemandes.clear();
  $('or-donne').value = 0; $('or-demande').value = 0;
  $('message-echange').value = '';
  afficherSesCartes();
  afficherTable();
  etat.surDonnees();
  await afficherContrats();
  choisirOnglet('courrier');
}


// ---------------------------------------------------------------------
//  Liste de souhaits
// ---------------------------------------------------------------------
async function chargerSouhaits() {
  const { data } = await supabase.from('souhaits').select('card_id').eq('discord_id', moi());
  etat.souhaits = new Set((data ?? []).map((s) => s.card_id));
}

async function chargerCatalogue() {
  if (etat.catalogue) return;
  const { data } = await supabase.from('cards').select('*').eq('is_available', true).order('name');
  etat.catalogue = (data ?? []).filter((c) => c.image && c.description !== "Carte d'exemple");
  etat.catalogue.forEach((c) => etat.cartes.set(c.id, c));
}

async function afficherSouhaits() {
  await chargerCatalogue();
  const tuile = (c) => `
    <span class="souhait${etat.souhaits.has(c.id) ? ' est-souhaitee' : ''}">
      ${htmlCarte(c)}
      <button type="button" class="souhait__coeur" data-souhait="${c.id}" aria-pressed="${etat.souhaits.has(c.id)}"
        title="${etat.souhaits.has(c.id) ? 'Retirer de ma liste' : 'Ajouter à ma liste'}">${etat.souhaits.has(c.id) ? '♥' : '♡'}</button>
      ${loupe(c.id)}
    </span>`;
  const mes = etat.catalogue.filter((c) => etat.souhaits.has(c.id));
  $('mes-souhaits').innerHTML = mes.length ? mes.map(tuile).join('') : '<p class="echanges__vide">Ta liste est vide : touche ♡ sur une carte ci-dessous.</p>';
  const texte = $('souhait-recherche').value.trim().toLowerCase();
  const liste = etat.catalogue.filter((c) => !texte || c.name.toLowerCase().includes(texte)).slice(0, 60);
  $('catalogue-souhaits').innerHTML = liste.map(tuile).join('') || '<p class="echanges__vide">Aucune carte trouvée.</p>';
}

async function basculerSouhait(id) {
  const { data, error } = await supabase.rpc('basculer_souhait', { p_card_id: id });
  if (error) { notifier(error.message || 'Impossible de modifier ta liste.', 'erreur'); return; }
  if (data) etat.souhaits.add(id); else etat.souhaits.delete(id);
  notifier(data ? 'Ajoutée à ta liste de souhaits.' : 'Retirée de ta liste de souhaits.');
  if (!document.querySelector('[data-panneau="souhaits"]').hidden) await afficherSouhaits();
  if (etat.ami) afficherSesCartes();
}
