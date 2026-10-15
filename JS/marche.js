// =====================================================================
//  Le Marché (marche.html), deux onglets :
//  - Ventes : les cartes mises en vente par les joueurs (SQL/commerce.sql, table annonces)
//  - Échanges : les contrats à sceaux entre deux joueurs, les souhaits, le registre (JS/marche-echanges.js) ;
//    marche.html#echanges les ouvre, marche.html?avec=<discord_id>#echanges ouvre un contrat avec ce joueur
//  Les ventes :
//  - la liste des ventes ouvertes (14 jours), avec filtres : nom, rareté, Veine, prix, mes ventes
//  - Acheter : conclure_annonce (le serveur vérifie la carte du vendeur et l'or de l'acheteur)
//  - Mettre en vente : publier_annonce('vente', carte, prix) ; Retirer : retirer_annonce
//  Le dernier exemplaire d'une favorite (deck du profil) ne peut pas être vendu.
// =====================================================================
import { supabase, getMonJoueur } from './supabase.js';
import { $, esc, notifier } from './commun.js';
import { htmlCarte, ouvrirApercu, RARETES, VEINES } from './cartes.js';
import { initEchanges, ouvrirEchanges } from './marche-echanges.js';

const JOURS = 14;
// Prix conseillé d'une carte selon sa rareté (repère pour le vendeur)
const PRIX_CONSEILLE = { commune: 50, eveillee: 100, mythique: 250, legendaire: 600, transcendante: 1500 };

const etat = { moi: null, solde: 0, ventes: [], cartes: new Map(), joueurs: new Map(), mesCartes: [], favorites: new Set() };
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const veineDe = (c) => [c?.attack_1, c?.attack_2].find((a) => a?.veine)?.veine ?? null;

async function init() {
  // La Veine sert de « type » de carte
  $('filtre-veine').innerHTML = `<option value="">Toutes les Veines</option>${Object.entries(VEINES)
    .map(([k, [nom, ico]]) => `<option value="${k}">${ico} ${esc(nom)}</option>`).join('')}`;
  const avec = new URLSearchParams(location.search).get('avec');
  montrerSection(avec || location.hash === '#echanges' ? 'echanges' : 'ventes', false);
  etat.moi = await getMonJoueur().catch(() => null);
  $('marche-connexion').hidden = !!etat.moi;
  $('marche-vendre').hidden = !etat.moi;
  $('echanges-connexion').hidden = !!etat.moi;
  $('marche').hidden = !etat.moi;
  if (etat.moi) {
    await Promise.all([chargerBourse(), chargerMesCartes()]);
    initEchanges({
      moi: etat.moi,
      mesCartes: () => etat.mesCartes.map((x) => ({ ...x.carte, quantite: x.quantite })),
      // Favorites protégées : le dernier exemplaire d'une carte du deck du profil ne s'échange pas
      protegee: (id) => { const x = etat.mesCartes.find((y) => y.carte.id === id); return !!x && x.quantite <= 1 && etat.favorites.has(id); },
      surBourse: chargerBourse,
      surEchange: async () => { await Promise.all([chargerBourse(), chargerMesCartes()]); await chargerVentes(); },
    }).then(() => { if (avec) ouvrirEchanges(avec, 'proposer'); }).catch(console.error);
  }
  await chargerVentes();
}

// Les deux onglets de la page : Ventes / Échanges (retenu dans l'adresse : marche.html#echanges)
function montrerSection(nom, retenir = true) {
  document.querySelectorAll('[data-section]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.section === nom)));
  $('section-ventes').hidden = nom !== 'ventes';
  $('section-echanges').hidden = nom !== 'echanges';
  if (retenir) history.replaceState(null, '', `${location.pathname}${location.search}${nom === 'echanges' ? '#echanges' : ''}`);
}
document.querySelector('.marche-sections').addEventListener('click', (e) => {
  const b = e.target.closest('[data-section]');
  if (b) montrerSection(b.dataset.section);
});
addEventListener('hashchange', () => montrerSection(location.hash === '#echanges' ? 'echanges' : 'ventes', false));

async function chargerBourse() {
  const { data } = await supabase.from('wallets').select('balance').eq('discord_id', etat.moi.discord_id).maybeSingle();
  etat.solde = data?.balance ?? 0;
  $('solde').textContent = nombre(etat.solde);
  $('bourse').hidden = false;
}

// Mes cartes (pour vendre) et mes favorites (protégées si dernier exemplaire)
async function chargerMesCartes() {
  const [{ data: lignes }, { data: deck }] = await Promise.all([
    supabase.from('player_cards').select('quantite, card:cards(*)').eq('discord_id', etat.moi.discord_id),
    supabase.from('player_deck_cards').select('card_id').eq('discord_id', etat.moi.discord_id),
  ]);
  etat.favorites = new Set((deck ?? []).map((d) => d.card_id));
  etat.mesCartes = (lignes ?? []).filter((l) => l.card).map((l) => ({ carte: l.card, quantite: l.quantite ?? 1 }))
    .sort((a, b) => a.carte.name.localeCompare(b.carte.name, 'fr'));
  etat.mesCartes.forEach(({ carte }) => etat.cartes.set(carte.id, carte));
  const protegee = (x) => x.quantite <= 1 && etat.favorites.has(x.carte.id);
  $('vente-carte').innerHTML = etat.mesCartes.length
    ? etat.mesCartes.map((x) => `<option value="${x.carte.id}" ${protegee(x) ? 'disabled' : ''}>${esc(x.carte.name)} · ${esc(RARETES[x.carte.rarity] ?? '')}${x.quantite > 1 ? ` · ×${x.quantite}` : ''}${protegee(x) ? ' (favorite)' : ''}</option>`).join('')
    : '<option value="">Ton grimoire est vide</option>';
  majAideVente();
}

function majAideVente() {
  const c = etat.cartes.get(Number($('vente-carte').value));
  $('vente-aide').textContent = c ? `Prix conseillé pour une carte ${(RARETES[c.rarity] ?? '').toLowerCase()} : environ ${nombre(PRIX_CONSEILLE[c.rarity] ?? 50)} or. Ta vente reste ${JOURS} jours sur le marché.` : '';
}

async function chargerVentes() {
  const depuis = new Date(Date.now() - JOURS * 864e5).toISOString();
  // Toutes les ventes ouvertes, par pages de 500 (2 000 au plus)
  const PAGE = 500;
  let data = [];
  let error = null;
  for (let debut = 0; debut < 2000; debut += PAGE) {
    const r = await supabase.from('annonces').select('*')
      .eq('type', 'vente').eq('statut', 'ouverte').gte('cree_le', depuis)
      .order('cree_le', { ascending: false }).order('id', { ascending: false }).range(debut, debut + PAGE - 1);
    if (r.error) { error = r.error; break; }
    data = data.concat(r.data ?? []);
    if ((r.data ?? []).length < PAGE) break;
  }
  if (error) {
    $('marche-liste').innerHTML = `<p class="marche-vide">${/schema cache|does not exist|PGRST20|42P01/.test(`${error.code} ${error.message}`)
      ? 'Le marché n’est pas encore installé (SQL/commerce.sql).' : etat.moi ? 'Impossible de charger le marché.' : 'Connecte-toi pour voir le marché.'}</p>`;
    return;
  }
  etat.ventes = data ?? [];
  const ids = [...new Set(etat.ventes.map((v) => v.card_id))].filter((id) => !etat.cartes.has(id));
  const joueurs = [...new Set(etat.ventes.map((v) => v.auteur))].filter((id) => !etat.joueurs.has(id));
  // Par paquets de 100 : une longue liste ne tient pas dans l'adresse d'une seule requête
  const paquets = (liste) => Array.from({ length: Math.ceil(liste.length / 100) }, (_, i) => liste.slice(i * 100, i * 100 + 100));
  const [cartes, profils] = await Promise.all([
    Promise.all(paquets(ids).map((p) => supabase.from('cards').select('*').in('id', p))),
    Promise.all(paquets(joueurs).map((p) => supabase.from('players').select('discord_id, username').in('discord_id', p))),
  ]);
  cartes.flatMap((r) => r.data ?? []).forEach((c) => etat.cartes.set(c.id, c));
  profils.flatMap((r) => r.data ?? []).forEach((j) => etat.joueurs.set(j.discord_id, j));
  afficher();
}

function afficher() {
  const texte = $('filtre-nom').value.trim().toLowerCase();
  const rarete = $('filtre-rarete').value;
  const veine = $('filtre-veine').value;
  const miennes = $('filtre-miennes').checked;
  const tri = $('filtre-tri').value;
  const liste = etat.ventes.filter((v) => {
    const c = etat.cartes.get(v.card_id);
    if (!c) return false;
    if (texte && !c.name.toLowerCase().includes(texte)) return false;
    if (rarete && c.rarity !== rarete) return false;
    if (veine && veineDe(c) !== veine) return false;
    if (miennes && v.auteur !== etat.moi?.discord_id) return false;
    return true;
  });
  if (tri === 'prix') liste.sort((a, b) => a.prix - b.prix);
  else if (tri === 'prix-desc') liste.sort((a, b) => b.prix - a.prix);
  $('marche-liste').innerHTML = liste.length ? liste.map(htmlVente).join('')
    : `<p class="marche-vide">${etat.ventes.length ? 'Aucune carte ne correspond à ces filtres.' : 'Aucune carte en vente pour l’instant. Sois le premier à en proposer une !'}</p>`;
}

function htmlVente(v) {
  const c = etat.cartes.get(v.card_id);
  const mienne = v.auteur === etat.moi?.discord_id;
  const pasAssez = etat.moi && !mienne && etat.solde < v.prix;
  const action = !etat.moi ? '<button type="button" class="btn-or" disabled>Connecte-toi</button>'
    : mienne ? `<button type="button" class="btn-sobre" data-retirer="${v.id}">Retirer de la vente</button>`
      : `<button type="button" class="btn-or" data-acheter="${v.id}" ${pasAssez ? 'disabled title="Pas assez d’or"' : ''}>Acheter · ${nombre(v.prix)} or</button>`;
  return `
    <article class="vente rar-${esc(c.rarity ?? 'commune')}${mienne ? ' est-mienne' : ''}">
      <button type="button" class="vente__carte" data-apercu="${c.id}" aria-label="Voir ${esc(c.name)} en grand">${htmlCarte(c)}</button>
      <div class="vente__infos">
        <h2 class="vente__nom">${esc(c.name)}</h2>
        <p class="vente__rarete">${esc(RARETES[c.rarity] ?? '')}</p>
        <p class="vente__prix">${nombre(v.prix)} <span>or</span></p>
        <p class="vente__vendeur">${mienne ? 'Ta vente' : `Vendue par ${esc(etat.joueurs.get(v.auteur)?.username ?? 'un joueur')}`}</p>
        ${action}
      </div>
    </article>`;
}

$('marche-liste').addEventListener('click', async (e) => {
  const apercu = e.target.closest('[data-apercu]');
  if (apercu) { ouvrirApercu(etat.cartes.get(Number(apercu.dataset.apercu))); return; }
  const bouton = e.target.closest('[data-acheter], [data-retirer]');
  if (!bouton || bouton.disabled) return;
  if (bouton.dataset.acheter) {
    const v = etat.ventes.find((x) => x.id === Number(bouton.dataset.acheter));
    const c = v && etat.cartes.get(v.card_id);
    if (!v || !confirm(`Acheter « ${c?.name ?? 'cette carte'} » pour ${nombre(v.prix)} or ?`)) return;
    bouton.disabled = true;
    const { data, error } = await supabase.rpc('conclure_annonce', { p_id: v.id });
    if (error) notifier(error.message || 'Achat impossible.', 'erreur');
    else if (!data?.ok) notifier(`Achat impossible : ${data?.raison ?? ''}`, 'erreur');
    else notifier(`« ${data.carte} » rejoint ton grimoire !`);
  } else {
    bouton.disabled = true;
    const { error } = await supabase.rpc('retirer_annonce', { p_id: Number(bouton.dataset.retirer) });
    notifier(error ? error.message : 'Ta carte est retirée du marché.', error ? 'erreur' : 'ok');
  }
  if (etat.moi) await Promise.all([chargerBourse(), chargerMesCartes()]);
  await chargerVentes();
});

$('form-vente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const carte = Number($('vente-carte').value);
  const prix = Math.floor(Number($('vente-prix').value) || 0);
  if (!carte || prix < 1) return;
  const bouton = $('form-vente').querySelector('[type="submit"]');
  bouton.disabled = true;
  const { error } = await supabase.rpc('publier_annonce', { p_type: 'vente', p_card_id: carte, p_prix: prix, p_message: null });
  bouton.disabled = false;
  if (error) { notifier(error.message || 'Mise en vente impossible.', 'erreur'); return; }
  notifier('Ta carte est en vente sur le marché.');
  $('marche-vendre').open = false;
  await chargerVentes();
});
$('vente-carte').addEventListener('change', majAideVente);
['filtre-nom', 'filtre-rarete', 'filtre-veine', 'filtre-tri', 'filtre-miennes'].forEach((id) => $(id).addEventListener('input', afficher));

init();
