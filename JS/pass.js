// =====================================================================
//  Page du Pass de saison (pass.html)
//  - lit la saison en cours, ses 30 paliers × 2 pistes, et la progression du joueur
//  - réclamer une récompense : pass_reclamer ; débloquer la piste premium (en or) : pass_debloquer_premium
//  Tout est vérifié côté serveur (SQL/pass_saison.sql) : palier atteint, déjà réclamé, solde.
//  L'XP se gagne dans le jeu (JS/jeu-cartes.js : fin de duel ; mode Histoire).
// =====================================================================
import { supabase, getMonJoueur, connexionDiscord, SITE_ROOT } from './supabase.js';
import { $, esc, notifier } from './commun.js';
import { jouerSon } from './jeu-cartes-son.js';   // fanfare du déblocage premium (respecte le volume et le mode muet du jeu)

const etat = {
  moi: null,
  saison: null,
  paliers: new Map(),   // "numero-piste" -> palier
  cartes: new Map(),    // nom -> { image, rarity } (récompenses « carte »)
  prog: null,           // { xp, premium, reclames_gratuite, reclames_premium }
  solde: 0,
};

const TYPES = {
  or: 'Or',
  carte: 'Carte',
  dos_carte: 'Dos de cartes',
  cadre_portrait: 'Cadre de portrait',
  titre: 'Titre',
  fond_plateau: 'Fond de plateau',
};
const ICONES = {
  dos_carte: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M12 7l3 5-3 5-3-5z"/>',
  cadre_portrait: '<path d="M12 2l8 4.5v11L12 22l-8-4.5v-11z"/><circle cx="12" cy="10" r="3"/><path d="M7.5 17a5 5 0 0 1 9 0"/>',
  titre: '<path d="M4 7h16v10H4z"/><path d="M8 11h8M8 14h5"/>',
  fond_plateau: '<path d="M3 17l5-6 4 4 3-3 6 5z"/><circle cx="16" cy="7" r="2"/><path d="M3 20h18"/>',
  cadenas: '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7"/>',
};
const svg = (nom) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom]}</svg>`;
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const urlImage = (chemin) => esc(new URL(chemin, SITE_ROOT));

// ---------------------------------------------------------------------
//  Chargement
// ---------------------------------------------------------------------
async function chargerSaison() {
  const maintenant = new Date().toISOString();
  const { data } = await supabase.from('saisons').select('*')
    .eq('active', true).lte('date_debut', maintenant).gte('date_fin', maintenant)
    .maybeSingle();
  etat.saison = data ?? null;
  if (!etat.saison) return;

  const { data: paliers } = await supabase.from('pass_paliers')
    .select('numero, piste, type_recompense, valeur')
    .eq('saison_id', etat.saison.id);
  etat.paliers = new Map((paliers ?? []).map((p) => [`${p.numero}-${p.piste}`, p]));

  const noms = [...new Set((paliers ?? []).filter((p) => p.type_recompense === 'carte').map((p) => p.valeur?.nom))].filter(Boolean);
  if (noms.length) {
    const { data: cartes } = await supabase.from('cards').select('name, image, rarity').in('name', noms);
    etat.cartes = new Map((cartes ?? []).map((c) => [c.name, c]));
  }
}

async function chargerJoueur() {
  if (!etat.moi || !etat.saison) return;
  const [{ data: prog }, { data: bourse }] = await Promise.all([
    supabase.from('pass_progression').select('xp, premium, reclames_gratuite, reclames_premium')
      .eq('discord_id', etat.moi.discord_id).eq('saison_id', etat.saison.id).maybeSingle(),
    supabase.from('wallets').select('balance').eq('discord_id', etat.moi.discord_id).maybeSingle(),
  ]);
  etat.prog = prog ?? { xp: 0, premium: false, reclames_gratuite: [], reclames_premium: [] };
  etat.solde = bourse?.balance ?? 0;
}

// ---------------------------------------------------------------------
//  Affichage
// ---------------------------------------------------------------------
const xp = () => etat.prog?.xp ?? 0;
const palierActuel = () => Math.min(etat.saison.nb_paliers, Math.floor(xp() / etat.saison.xp_par_palier));

function afficherProgression() {
  const s = etat.saison;
  const palier = palierActuel();
  const max = s.nb_paliers;
  const fini = palier >= max;
  const dansPalier = fini ? s.xp_par_palier : xp() % s.xp_par_palier;
  $('palier-actuel').textContent = palier;
  $('palier-texte').textContent = palier;
  $('palier-max').textContent = max;
  $('barre-remplie').style.width = `${(dansPalier / s.xp_par_palier) * 100}%`;
  $('barre-xp').setAttribute('aria-valuemax', s.xp_par_palier);
  $('barre-xp').setAttribute('aria-valuenow', dansPalier);
  $('xp-texte').textContent = fini
    ? `Pass terminé : ${nombre(xp())} XP`
    : `${nombre(dansPalier)} / ${nombre(s.xp_par_palier)} XP vers le palier ${palier + 1}`;
}

function afficherPremium() {
  const bloc = $('bloc-premium');
  bloc.hidden = !etat.moi;
  if (!etat.moi) return;
  const prix = etat.saison.prix_premium;
  const bouton = $('btn-premium');
  bloc.classList.toggle('est-debloque', !!etat.prog.premium);
  if (etat.prog.premium) {
    $('premium-texte').textContent = 'Débloquée : toutes les récompenses premium atteintes sont à toi.';
    bouton.hidden = true;
    $('premium-solde').textContent = '';
    return;
  }
  bouton.hidden = false;
  const manque = prix - etat.solde;
  $('premium-texte').textContent = 'Plus d\'or, les cartes légendaires et tous les cosmétiques de la saison. Payée avec l\'or du jeu.';
  bouton.innerHTML = `Débloquer la piste premium <span class="btn-premium__prix"><img src="img/Equipement/Or-icone.webp" alt=""> ${nombre(prix)}</span>`;
  bouton.disabled = manque > 0;
  $('premium-solde').textContent = manque > 0
    ? `Ta bourse : ${nombre(etat.solde)} or — il t'en manque ${nombre(manque)}.`
    : `Ta bourse : ${nombre(etat.solde)} or.`;
}

// Contenu d'une récompense (image ou icône, nom)
function contenuRecompense(p) {
  const v = p.valeur ?? {};
  if (p.type_recompense === 'or') {
    return `<span class="recompense__visuel recompense__visuel--or"><img src="img/Equipement/Or-icone.webp" alt=""></span>
      <span class="recompense__nom">${nombre(v.montant)} or</span>`;
  }
  if (p.type_recompense === 'carte') {
    const c = etat.cartes.get(v.nom);
    return `<span class="recompense__visuel recompense__visuel--carte">${c?.image ? `<img src="${urlImage(c.image)}" alt="" loading="lazy">` : svg('dos_carte')}</span>
      <span class="recompense__nom">${esc(v.nom ?? 'Carte')}</span>`;
  }
  return `<span class="recompense__visuel recompense__visuel--cosmetique">${svg(p.type_recompense)}</span>
    <span class="recompense__nom">${esc(v.nom ?? TYPES[p.type_recompense])}</span>`;
}

function etatRecompense(numero, piste) {
  if (!etat.moi) return 'verrouillee';
  const reclames = piste === 'premium' ? etat.prog.reclames_premium : etat.prog.reclames_gratuite;
  if ((reclames ?? []).includes(numero)) return 'reclamee';
  const atteint = xp() >= numero * etat.saison.xp_par_palier;
  if (!atteint || (piste === 'premium' && !etat.prog.premium)) return 'verrouillee';
  return 'disponible';
}

function htmlRecompense(numero, piste) {
  const p = etat.paliers.get(`${numero}-${piste}`);
  if (!p) return `<div class="recompense recompense--absente"></div>`;
  const e = etatRecompense(numero, piste);
  const action = e === 'disponible'
    ? `<button type="button" class="btn-reclamer" data-numero="${numero}" data-piste="${piste}">Réclamer</button>`
    : e === 'reclamee'
      ? `<span class="recompense__etat recompense__etat--ok">${svg('coche')} Réclamée</span>`
      : `<span class="recompense__etat">${svg('cadenas')} ${piste === 'premium' && etat.moi && !etat.prog?.premium ? 'Premium' : 'Verrouillée'}</span>`;
  return `
    <div class="recompense recompense--${e} recompense--${piste} recompense--${p.type_recompense}"
         title="${esc(TYPES[p.type_recompense])}${['dos_carte', 'cadre_portrait', 'fond_plateau'].includes(p.type_recompense) ? ' (bientôt visible en jeu)' : ''}">
      <span class="recompense__type">${esc(TYPES[p.type_recompense])}</span>
      ${contenuRecompense(p)}
      ${action}
    </div>`;
}

function afficherPiste() {
  const n = etat.saison.nb_paliers;
  const atteint = etat.moi ? palierActuel() : 0;
  const colonnes = [];
  for (let i = 1; i <= n; i++) {
    colonnes.push(`
      <div class="palier${i <= atteint ? ' palier--atteint' : ''}${i === atteint + 1 ? ' palier--suivant' : ''}" data-palier="${i}">
        <span class="palier__numero">${i}</span>
        ${htmlRecompense(i, 'gratuite')}
        ${htmlRecompense(i, 'premium')}
      </div>`);
  }
  $('piste').innerHTML = colonnes.join('');
}

function toutAfficher() {
  afficherProgression();
  afficherPremium();
  afficherPiste();
}

// La piste s'ouvre sur le palier en cours
function defilerVersPalierActuel() {
  const cible = $('piste').querySelector(`[data-palier="${Math.max(1, palierActuel())}"]`);
  if (cible) $('piste').scrollLeft = Math.max(0, cible.offsetLeft - $('piste').clientWidth / 2 + cible.clientWidth / 2);
}

// Compte à rebours jusqu'à la fin de la saison
function demarrerRebours() {
  const fin = new Date(etat.saison.date_fin).getTime();
  const maj = () => {
    const reste = Math.max(0, fin - Date.now());
    if (reste === 0) { $('rebours').textContent = 'La saison est terminée.'; return; }
    const s = Math.floor(reste / 1000);
    const j = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    $('rebours').innerHTML = `Fin de la saison dans <strong>${j} j ${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min ${String(sec).padStart(2, '0')} s</strong>`;
  };
  maj();
  setInterval(maj, 1000);
}

// ---------------------------------------------------------------------
//  Actions
// ---------------------------------------------------------------------
$('piste').addEventListener('click', async (e) => {
  const bouton = e.target.closest('.btn-reclamer');
  if (!bouton || bouton.disabled) return;
  bouton.disabled = true;
  bouton.textContent = '…';
  const numero = Number(bouton.dataset.numero);
  const { data, error } = await supabase.rpc('pass_reclamer', { p_numero: numero, p_piste: bouton.dataset.piste });
  if (error) {
    notifier(error.message || 'Impossible de réclamer cette récompense.', 'erreur');
  } else if (data.type === 'or') {
    notifier(`+${nombre(data.or)} or ajoutés à ta bourse.`);
  } else if (data.type === 'carte') {
    notifier(data.deja_possedee
      ? `Tu avais déjà « ${data.nom} » : +${nombre(data.or)} or à la place.`
      : `« ${data.nom} » rejoint ta collection !`);
  } else {
    notifier(`${TYPES[data.type]} « ${data.nom} » obtenu.`);
  }
  await chargerJoueur();
  const defilement = $('piste').scrollLeft;
  toutAfficher();
  $('piste').scrollLeft = defilement;
});

// Pas de fenêtre du navigateur : le premier clic transforme le bouton en « Confirmer »
// (pendant 4 s), le second clic achète. Évite de dépenser 1 500 or par un clic de travers.
let confirmationPremium = null;
$('btn-premium').addEventListener('click', async () => {
  const bouton = $('btn-premium');
  if (!confirmationPremium) {
    bouton.classList.add('btn-premium--confirmer');
    bouton.innerHTML = `Confirmer l'achat <span class="btn-premium__prix"><img src="img/Equipement/Or-icone.webp" alt=""> ${nombre(etat.saison.prix_premium)}</span>`;
    confirmationPremium = setTimeout(() => { confirmationPremium = null; bouton.classList.remove('btn-premium--confirmer'); afficherPremium(); }, 4000);
    return;
  }
  clearTimeout(confirmationPremium);
  confirmationPremium = null;
  bouton.classList.remove('btn-premium--confirmer');
  bouton.disabled = true;
  const { error } = await supabase.rpc('pass_debloquer_premium');
  if (error) notifier(error.message || 'Impossible de débloquer la piste premium.', 'erreur');
  await chargerJoueur();
  toutAfficher();
  if (!error) {
    await celebrerPremium();
    revelerPistePremium();
  }
});

// ---------------------------------------------------------------------
//  Animation : piste premium débloquée
//  1. écran de fête : rayons, blason qui s'abat, pluie de pièces et d'étincelles, fanfare
//  2. à la fermeture, la ligne premium s'illumine case par case, jusqu'au palier atteint
// ---------------------------------------------------------------------
const mouvementReduit = matchMedia('(prefers-reduced-motion: reduce)').matches;

function pluie(zone, n) {
  const l = innerWidth; const h = innerHeight;
  for (let i = 0; i < n; i++) {
    const piece = i % 3 === 0;
    const el = document.createElement(piece ? 'img' : 'span');
    if (piece) { el.src = 'img/Equipement/Or-icone.webp'; el.alt = ''; }
    el.className = piece ? 'fete__piece' : 'fete__etincelle';
    zone.appendChild(el);
    // jaillit du centre, retombe en tournant
    const angle = Math.random() * Math.PI * 2;
    const force = (0.25 + Math.random() * 0.45) * Math.min(l, h);
    const dx = Math.cos(angle) * force;
    const dy = Math.sin(angle) * force * 0.7 - h * 0.12;
    const a = el.animate([
      { transform: 'translate(-50%, -50%) scale(.2) rotate(0deg)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) scale(1) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + h * 0.45}px)) scale(.7) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 900, delay: Math.random() * 350, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'both' });
    a.onfinish = () => el.remove();
  }
}

// Ouvre l'écran de fête ; se résout quand le joueur le ferme (ou tout seul après 6 s)
function celebrerPremium() {
  const fete = $('fete');
  $('fete-saison').textContent = etat.saison.nom;
  const dispo = document.querySelectorAll('.recompense--premium.recompense--disponible').length;
  $('fete-texte').textContent = dispo
    ? `${dispo} récompense${dispo > 1 ? 's' : ''} premium t'attend${dispo > 1 ? 'ent' : ''} déjà !`
    : 'Chaque palier atteint te donnera aussi sa récompense premium.';
  fete.hidden = false;
  document.body.classList.add('fete-ouverte');
  jouerSon('fanfare');
  if (!mouvementReduit) {
    pluie($('fete-particules'), 46);
    setTimeout(() => pluie($('fete-particules'), 24), 650);
  }
  $('fete-ok').focus();

  return new Promise((resolve) => {
    let fini = false;
    const fermer = () => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      fete.classList.add('fete--sortie');
      setTimeout(() => {
        fete.hidden = true;
        fete.classList.remove('fete--sortie');
        $('fete-particules').innerHTML = '';
        document.body.classList.remove('fete-ouverte');
        resolve();
      }, mouvementReduit ? 0 : 380);
    };
    const minuteur = setTimeout(fermer, 6000);
    $('fete-ok').onclick = fermer;
    fete.onclick = (e) => { if (e.target === fete) fermer(); };
    fete.onkeydown = (e) => { if (e.key === 'Escape') fermer(); };
  });
}

// La ligne premium s'éclaire de gauche à droite ; la piste défile jusqu'à la première récompense à réclamer
function revelerPistePremium() {
  const premiere = document.querySelector('.recompense--premium.recompense--disponible');
  if (premiere) {
    const colonne = premiere.closest('.palier');
    $('piste').scrollTo({ left: Math.max(0, colonne.offsetLeft - 40), behavior: mouvementReduit ? 'auto' : 'smooth' });
  }
  if (mouvementReduit) return;
  document.querySelectorAll('.recompense--premium').forEach((el, i) => {
    el.animate([
      { transform: 'translateY(10px) scale(.92)', filter: 'brightness(.5) saturate(.5)' },
      { transform: 'translateY(-6px) scale(1.05)', filter: 'brightness(1.9) saturate(1.4)', offset: 0.45 },
      { transform: 'none', filter: 'none' },
    ], { duration: 650, delay: 250 + i * 55, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
  });
}

$('btn-connexion').addEventListener('click', () => connexionDiscord());

// ---------------------------------------------------------------------
//  Démarrage
// ---------------------------------------------------------------------
async function init() {
  [etat.moi] = await Promise.all([getMonJoueur(), chargerSaison()]);
  $('bloc-connexion').hidden = !!etat.moi;

  if (!etat.saison) {
    $('saison-nom').textContent = 'Pass de saison';
    $('bloc-vide').hidden = false;
    return;
  }
  $('saison-nom').textContent = etat.saison.nom;
  document.title = `${etat.saison.nom} — Pass de saison — Nocthémar`;
  demarrerRebours();
  await chargerJoueur();
  $('bloc-saison').hidden = false;
  toutAfficher();
  defilerVersPalierActuel();
}

init().catch((e) => {
  console.error(e);
  $('saison-nom').textContent = 'Pass de saison';
  notifier('Le pass n\'a pas pu être chargé. Réessaie dans un instant.', 'erreur');
});
