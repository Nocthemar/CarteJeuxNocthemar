// =====================================================================
//  Page succes.html : les succès du joueur connecté (SQL/succes.sql)
//  - progression calculée par le serveur (mes_succes) ; chaque succès a une rareté (commun, rare,
//    épique, légendaire) et le pourcentage de joueurs qui l'ont obtenu, comme sur Steam
//  - « Réclamer » donne l'or (reclamer_succes, qui revérifie l'objectif) et joue l'animation
//    de la rareté (JS/succes-badge.js) ; « Tout réclamer » les enchaîne
//  - la vitrine : jusqu'à 3 succès obtenus épinglés comme badges sur le profil (choisir_vitrine_succes)
// =====================================================================
import { supabase, connexionDiscord, getMonJoueur } from './supabase.js';
import { $, esc, notifier } from './commun.js';
import { htmlBadge, celebrerSucces, pourcentageTexte, RARETES_SUCCES } from './succes-badge.js';

const ORDRE_CATEGORIES = ['Duels', 'Classé', 'Collection', 'Boosters', 'Histoire', 'Marché'];
const VITRINE_MAX = 3;
let succes = [];

const pret = (s) => s.atteint && !s.reclame;
const nombre = (n) => Number(n).toLocaleString('fr-FR');
const vitrine = () => succes.filter((s) => s.vitrine).sort((a, b) => a.vitrine - b.vitrine);

async function charger() {
  const { data, error } = await supabase.rpc('mes_succes');
  if (error) {
    $('liste').innerHTML = '<p class="vide">Les succès ne sont pas encore disponibles.</p>';   // SQL/succes.sql pas lancé
    return false;
  }
  succes = data ?? [];
  return true;
}

function htmlSucces(s) {
  const pct = s.objectif ? Math.round((s.progression / s.objectif) * 100) : 0;
  const etat = s.reclame ? 'est-reclame' : s.atteint ? 'est-pret' : 'est-verrouille';
  let action;
  if (s.reclame) {
    const epingle = !!s.vitrine;
    const plein = !epingle && vitrine().length >= VITRINE_MAX;
    action = `<button type="button" class="succ__epingle${epingle ? ' est-epingle' : ''}" data-epingler="${esc(s.id)}"
      ${plein ? 'disabled title="Ta vitrine est pleine : retire un badge d\'abord"' : ''}
      aria-pressed="${epingle}">${epingle ? '★ Sur mon profil' : '☆ Épingler'}</button>`;
  } else if (s.atteint) {
    action = `<button type="button" class="succ__btn" data-reclamer="${esc(s.id)}">Réclamer</button>`;
  } else {
    action = `<span class="succ__compte">${nombre(s.progression)} / ${nombre(s.objectif)}</span>`;
  }
  return `
    <article class="succ succ--${esc(s.rarete)} ${etat}">
      ${htmlBadge(s)}
      <div class="succ__corps">
        <h3 class="succ__nom">${esc(s.nom)}</h3>
        <p class="succ__desc">${esc(s.description)}</p>
        <p class="succ__meta">
          <span class="rarete-succes rarete-succes--${esc(s.rarete)}">${RARETES_SUCCES[s.rarete]?.nom ?? 'Commun'}</span>
          <span class="succ__pct">${pourcentageTexte(s.pourcentage)} des joueurs</span>
        </p>
        ${s.reclame ? '' : `<div class="succ__jauge" aria-hidden="true"><span style="width:${pct}%"></span></div>`}
      </div>
      <div class="succ__droite">
        ${s.recompense ? `<span class="succ__or"><img src="img/Equipement/Or-icone.webp" alt=""> ${nombre(s.recompense)}</span>` : ''}
        ${action}
      </div>
    </article>`;
}

// La vitrine : trois emplacements, les badges épinglés (comme sur le profil)
function htmlVitrine() {
  const v = vitrine();
  const places = Array.from({ length: VITRINE_MAX }, (_, i) => {
    const s = v[i];
    return s
      ? `<button type="button" class="vitrine-succes__place est-pleine" data-epingler="${esc(s.id)}" title="${esc(s.nom)} : retirer de mon profil">
          ${htmlBadge(s, { taille: 'grand' })}<span class="vitrine-succes__nom">${esc(s.nom)}</span></button>`
      : '<span class="vitrine-succes__place"><span class="vitrine-succes__vide">+</span><span class="vitrine-succes__nom">Emplacement libre</span></span>';
  }).join('');
  return `
    <span class="vitrine-succes__titre">Badges de ton profil</span>
    <div class="vitrine-succes__places">${places}</div>
    <p class="vitrine-succes__aide">Épingle jusqu'à ${VITRINE_MAX} succès obtenus : ils s'affichent sur ton <a href="profil.html">profil</a>.</p>`;
}

function afficher() {
  const categories = [...new Set(succes.map((s) => s.categorie))]
    .sort((a, b) => (ORDRE_CATEGORIES.indexOf(a) + 1 || 99) - (ORDRE_CATEGORIES.indexOf(b) + 1 || 99));
  $('liste').innerHTML = categories.map((c) => {
    const liste = succes.filter((s) => s.categorie === c);
    const faits = liste.filter((s) => s.atteint).length;
    return `
      <section class="succes-cat">
        <h2 class="succes-cat__titre">${esc(c)} <small>${faits} / ${liste.length}</small></h2>
        <div class="succes-cat__liste">${liste.map(htmlSucces).join('')}</div>
      </section>`;
  }).join('') || '<p class="vide">Aucun succès pour le moment.</p>';

  $('vitrine').hidden = false;
  $('vitrine').innerHTML = htmlVitrine();

  const atteints = succes.filter((s) => s.atteint).length;
  $('progression').hidden = false;
  $('nb-atteints').textContent = atteints;
  $('nb-total').textContent = succes.length;
  $('jauge').style.width = `${succes.length ? (atteints / succes.length) * 100 : 0}%`;
  const prets = succes.filter(pret);
  const or = prets.reduce((t, s) => t + s.recompense, 0);
  $('btn-tout').hidden = prets.length < 2;
  $('btn-tout').textContent = `Tout réclamer (${prets.length} succès · ${nombre(or)} or)`;
}

// Réclame un succès, puis joue son animation. Renvoie l'or gagné.
async function reclamer(id) {
  const { data, error } = await supabase.rpc('reclamer_succes', { p_succes_id: id });
  if (error) { notifier(error.message || 'Impossible de réclamer ce succès.', 'erreur'); return 0; }
  const s = succes.find((x) => x.id === id);
  if (s) {
    s.reclame = true;
    s.reclame_le = new Date().toISOString();
    s.pourcentage = data?.pourcentage ?? s.pourcentage;
  }
  afficher();
  await celebrerSucces({ ...s, ...data });
  return data?.recompense ?? 0;
}

// Épingle ou retire un badge de la vitrine du profil
async function basculerVitrine(id) {
  const ids = vitrine().map((s) => s.id);
  const nouveaux = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  if (nouveaux.length > VITRINE_MAX) { notifier(`Trois badges au plus : retire-en un d'abord.`, 'erreur'); return; }
  const { error } = await supabase.rpc('choisir_vitrine_succes', { p_ids: nouveaux });
  if (error) { notifier(error.message || 'Impossible de modifier ta vitrine.', 'erreur'); return; }
  succes.forEach((s) => { s.vitrine = nouveaux.includes(s.id) ? nouveaux.indexOf(s.id) + 1 : null; });
  notifier(nouveaux.includes(id) ? 'Badge épinglé sur ton profil.' : 'Badge retiré de ton profil.');
  afficher();
}

document.addEventListener('click', async (e) => {
  const reclame = e.target.closest('[data-reclamer]');
  const epingle = e.target.closest('[data-epingler]');
  if (reclame && !reclame.disabled) {
    reclame.disabled = true;
    await reclamer(reclame.dataset.reclamer);
  } else if (epingle && !epingle.disabled) {
    epingle.disabled = true;
    await basculerVitrine(epingle.dataset.epingler);
  } else if (e.target.closest('#btn-tout')) {
    $('btn-tout').disabled = true;
    let total = 0;
    for (const s of succes.filter(pret)) total += await reclamer(s.id);
    $('btn-tout').disabled = false;
    if (total) notifier(`Succès réclamés : +${nombre(total)} or !`);
    afficher();
  }
});
$('btn-connexion').addEventListener('click', connexionDiscord);

if (!(await getMonJoueur())) {
  $('liste').innerHTML = '';
  $('non-connecte').hidden = false;
} else if (await charger()) {
  afficher();
}
