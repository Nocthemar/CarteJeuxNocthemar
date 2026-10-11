// =====================================================================
//  Boutique — échoppe III : les boosters de cartes
//  Achat : acheter_booster (or du jeu) ; ouverture : ouvrir_booster (tirage côté serveur,
//  SQL/boosters.sql), puis l'animation de JS/booster-ouverture.js.
//  Les boosters gagnés dans le Pass de saison s'ouvrent ici aussi.
// =====================================================================
import { supabase } from './supabase.js';
import { $, esc, etat, chargerSolde, notifier, piece } from './boutique-commun.js';
import { ouvrirBoosterAnime, COULEURS_RARETE } from './booster-ouverture.js';
import { ouvrirApercu } from './cartes.js';

const NOMS_RARETE = { commune: 'Commune', eveillee: 'Éveillée', mythique: 'Mythique', legendaire: 'Légendaire', transcendante: 'Transcendante' };
const boosters = { liste: [], cartes: new Map(), possedes: new Map() };

async function charger() {
  const [{ data: liste }, { data: cartes }] = await Promise.all([
    supabase.from('boosters').select('*').eq('en_vente', true).order('prix'),
    supabase.from('booster_cartes').select('booster_id, card:cards(*)'),
  ]);
  boosters.liste = liste ?? [];
  boosters.cartes = new Map();
  for (const l of cartes ?? []) {
    if (!boosters.cartes.has(l.booster_id)) boosters.cartes.set(l.booster_id, []);
    if (l.card) boosters.cartes.get(l.booster_id).push(l.card);
  }
  boosters.possedes = new Map();
  if (etat.moi) {
    const { data } = await supabase.from('player_boosters').select('booster_id, quantite').eq('discord_id', etat.moi.discord_id);
    for (const l of data ?? []) boosters.possedes.set(l.booster_id, l.quantite);
  }
}

// L'image du booster : la porte, et derrière elle autant de dos de cartes en éventail
// que le booster en contient (1, 3, 5…) : on voit d'un coup d'œil ce qu'on achète
function htmlPile(b) {
  const n = Math.min(b.nb_cartes, 7);
  const dos = Array.from({ length: n }, (_, i) => {
    const k = i - (n - 1) / 2;   // place par rapport au centre de l'éventail
    return `<img class="booster__dos" src="img/Cartes/Verso-gris.webp" alt="" style="--k:${k}" loading="lazy">`;
  }).join('');
  return `
    <div class="booster__pile booster__pile--${n}" style="--n:${n}" role="img" aria-label="${esc(b.nom)} : ${b.nb_cartes} carte${b.nb_cartes > 1 ? 's' : ''}">
      ${dos}
      ${b.image ? `<img class="article__booster" src="${esc(b.image)}" alt="">` : ''}
    </div>`;
}

function htmlBooster(b) {
  const n = boosters.possedes.get(b.id) ?? 0;
  const chances = Object.entries(b.chances ?? {}).filter(([, v]) => v > 0)
    .map(([r, v]) => `<li style="--c:${COULEURS_RARETE[r]}">${esc(NOMS_RARETE[r] ?? r)} ${v} %</li>`).join('');
  // Aperçu : autant de cartes que le booster en contient (les plus rares d'abord)
  const RANG = ['commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
  const possibles = [...(boosters.cartes.get(b.id) ?? [])].sort((x, y) => RANG.indexOf(y.rarity) - RANG.indexOf(x.rarity));
  const montrees = possibles.slice(0, b.nb_cartes);
  const cartes = montrees
    .map((c) => `<button type="button" class="booster__vignette" data-apercu-carte="${esc(c.name)}" title="${esc(c.name)} : voir la carte" aria-label="Voir la carte ${esc(c.name)}"><img src="${esc(c.image)}" alt="" loading="lazy"></button>`).join('');
  let achat;
  if (!etat.moi) achat = '<button type="button" class="btn-acheter" disabled>Connecte-toi pour acheter</button>';
  else if (etat.solde < b.prix) achat = '<button type="button" class="btn-acheter" disabled>Pas assez de pièces</button>';
  else achat = `<button type="button" class="btn-acheter" data-acheter-booster="${esc(b.id)}">Acheter</button>`;
  return `
    <article class="article article--booster">
      <div class="article__niche article__niche--booster">
        ${htmlPile(b)}
        <span class="booster__ruban">${b.nb_cartes} carte${b.nb_cartes > 1 ? 's' : ''}</span>
        ${n ? `<span class="booster__possedes" title="Boosters à ouvrir">×${n}</span>` : ''}
      </div>
      <div class="article__etiquette">
        <span class="article__type">Booster · ${b.nb_cartes} carte${b.nb_cartes > 1 ? 's' : ''}</span>
        <h3 class="article__nom">${esc(b.nom)}</h3>
        <ul class="booster__chances" aria-label="Chances par carte">${chances}</ul>
        ${cartes ? `<div class="booster__cartes" aria-label="Cartes possibles">${cartes}</div>` : ''}
        <p class="article__desc">Doublon : converti en or, et +10 XP de pass.</p>
        <div class="article__prix">${b.prix} ${piece()}</div>
        ${achat}
        ${n ? `<button type="button" class="btn-ouvrir" data-ouvrir-booster="${esc(b.id)}">Ouvrir (${n})</button>` : ''}
      </div>
    </article>`;
}

export async function afficherBoosters() {
  const zone = $('boosters');
  if (!zone) return;
  await charger();
  zone.innerHTML = boosters.liste.length
    ? boosters.liste.map(htmlBooster).join('')
    : '<p class="vide">Aucun booster en vente pour le moment.</p>';
}

async function ouvrir(id) {
  const b = boosters.liste.find((x) => x.id === id);
  const { data, error } = await supabase.rpc('ouvrir_booster', { p_booster_id: id });
  if (error) { notifier(error.message || 'Impossible d\'ouvrir ce booster.', 'erreur'); return; }
  const { rouvrir } = await ouvrirBoosterAnime(data, b?.image ?? 'img/Booster/Booster.webp', {
    restants: data.restants, surRouvrir: true,
    details: new Map([...boosters.cartes.values()].flat().map((c) => [c.name, c])),
  });
  await chargerSolde();
  await afficherBoosters();
  if (rouvrir) ouvrir(id);
}

document.addEventListener('click', async (e) => {
  // Miniature d'une carte possible : la carte en grand, avec toutes ses informations
  const vignette = e.target.closest('[data-apercu-carte]');
  if (vignette) {
    const nom = vignette.dataset.apercuCarte;
    ouvrirApercu([...boosters.cartes.values()].flat().find((c) => c.name === nom));
    return;
  }
  const achat = e.target.closest('[data-acheter-booster]');
  const ouverture = e.target.closest('[data-ouvrir-booster]');
  if (achat && !achat.disabled) {
    achat.disabled = true;
    achat.textContent = 'Achat…';
    const { data, error } = await supabase.rpc('acheter_booster', { p_booster_id: achat.dataset.acheterBooster, p_quantite: 1 });
    if (error) notifier(error.message || 'Achat impossible.', 'erreur');
    else notifier(`${data.booster} acheté pour ${data.prix} pièces ! Ouvre-le quand tu veux.`);
    await chargerSolde();
    await afficherBoosters();
  } else if (ouverture && !ouverture.disabled) {
    ouverture.disabled = true;
    await ouvrir(ouverture.dataset.ouvrirBooster);
  }
});
