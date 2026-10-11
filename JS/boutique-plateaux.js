// =====================================================================
//  Boutique — échoppe IV : les plateaux du Duel des Couronnes
//  Achat : acheter_plateau (or du jeu, une seule fois par plateau, SQL/plateaux.sql).
//  Un plateau acheté se choisit ensuite depuis le profil (Collection > Plateaux),
//  ou tout de suite avec le bouton « Jouer dessus ».
// =====================================================================
import { supabase } from './supabase.js';
import { $, esc, etat, chargerSolde, notifier, piece } from './boutique-commun.js';

const plateaux = { liste: [], possedes: new Set(), equipe: null };

async function charger() {
  const { data: liste } = await supabase.from('plateaux').select('*').eq('en_vente', true).order('ordre');
  plateaux.liste = liste ?? [];
  plateaux.possedes = new Set();
  plateaux.equipe = null;
  if (etat.moi) {
    const { data } = await supabase.from('joueur_plateaux').select('plateau_id, equipe').eq('discord_id', etat.moi.discord_id);
    for (const l of data ?? []) {
      plateaux.possedes.add(l.plateau_id);
      if (l.equipe) plateaux.equipe = l.plateau_id;
    }
  }
}

function htmlPlateau(p) {
  const possede = plateaux.possedes.has(p.id);
  let action;
  if (possede && plateaux.equipe === p.id) action = '<button type="button" class="btn-acheter" disabled>Ton plateau actuel</button>';
  else if (possede) action = `<button type="button" class="btn-acheter" data-equiper-plateau="${esc(p.id)}">Jouer dessus</button>`;
  else if (!etat.moi) action = '<button type="button" class="btn-acheter" disabled>Connecte-toi pour acheter</button>';
  else if (etat.solde < p.prix) action = '<button type="button" class="btn-acheter" disabled>Pas assez de pièces</button>';
  else action = `<button type="button" class="btn-acheter" data-acheter-plateau="${esc(p.id)}">Acheter</button>`;
  return `
    <article class="article article--plateau${possede ? ' article--possede' : ''}">
      <div class="article__niche article__niche--plateau">
        <img class="article__plateau" src="${esc(p.miniature ?? p.image)}" alt="" loading="lazy">
        ${possede ? '<span class="plateau__possede">Possédé</span>' : ''}
      </div>
      <div class="article__etiquette">
        <span class="article__type">Plateau de duel</span>
        <h3 class="article__nom">${esc(p.nom)}</h3>
        <p class="article__desc">${esc(p.description ?? '')}</p>
        <div class="article__prix">${possede ? 'Acheté' : `${p.prix} ${piece()}`}</div>
        ${action}
      </div>
    </article>`;
}

export async function afficherPlateaux() {
  const zone = $('plateaux');
  if (!zone) return;
  await charger();
  zone.innerHTML = plateaux.liste.length
    ? plateaux.liste.map(htmlPlateau).join('')
    : '<p class="vide">Aucun plateau en vente pour le moment.</p>';
}

document.addEventListener('click', async (e) => {
  const achat = e.target.closest('[data-acheter-plateau]');
  const equiper = e.target.closest('[data-equiper-plateau]');
  if (achat && !achat.disabled) {
    achat.disabled = true;
    achat.textContent = 'Achat…';
    const { data, error } = await supabase.rpc('acheter_plateau', { p_plateau_id: achat.dataset.acheterPlateau });
    if (error) notifier(error.message || 'Achat impossible.', 'erreur');
    else notifier(`${data.plateau} acheté pour ${data.prix} pièces ! Clique « Jouer dessus » pour l'utiliser en duel.`);
    await chargerSolde();
    await afficherPlateaux();
  } else if (equiper && !equiper.disabled) {
    equiper.disabled = true;
    const { error } = await supabase.rpc('equiper_plateau', { p_plateau_id: equiper.dataset.equiperPlateau });
    if (error) notifier(error.message || 'Impossible de choisir ce plateau.', 'erreur');
    else notifier('C\'est ton plateau pour tes prochains duels.');
    await afficherPlateaux();
  }
});
