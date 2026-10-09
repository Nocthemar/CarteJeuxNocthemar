// =====================================================================
//  Boutique — code partagé entre la boutique du marchand et celle du profil
//  (état du joueur connecté, rendu d'une carte d'article, bouton d'achat).
// =====================================================================
import { supabase, SITE_ROOT } from './supabase.js';
import { $, esc, couleur, LIBELLES as LIBELLES_ARTICLE } from './commun.js';

// Les images des articles (bannières, potions…) restent sur le site Nocthémar (JS/lien-site.js)
const RACINE_IMAGES = window.NOCTHEMAR_SITE ? new URL(window.NOCTHEMAR_SITE) : SITE_ROOT;

export { $, esc, LIBELLES, notifier } from './commun.js';

// État du joueur, lu par les deux boutiques
export const etat = {
  moi: null,             // ligne "players" du joueur connecté (ou null)
  solde: 0,
  possedes: new Set(),   // ids des objets déjà possédés
};


export async function chargerSolde() {
  const { data } = await supabase.from('wallets').select('balance').eq('discord_id', etat.moi.discord_id).maybeSingle();
  etat.solde = data?.balance ?? 0;
  $('solde').textContent = etat.solde.toLocaleString('fr-FR');
}

export async function chargerPossedes() {
  const { data } = await supabase.from('inventory').select('item_id').eq('discord_id', etat.moi.discord_id);
  etat.possedes = new Set((data ?? []).map((l) => l.item_id));
}


// Petit aperçu visuel selon le type d'objet
export function apercu(item) {
  const p = item.payload ?? {};
  if (item.kind === 'banner' && p.image) {
    return `<div class="apercu"><img src="${esc(new URL(p.image, RACINE_IMAGES))}" alt=""></div>`;
  }
  // Thème : son nom dans la case (comme un titre) ; ses couleurs sont en pastilles sous le nom (pastilles())
  if (item.kind === 'theme') {
    const nom = item.name.match(/«\s*(.+?)\s*»/)?.[1] ?? item.name;
    return `<div class="apercu apercu--titre">« ${esc(nom)} »</div>`;
  }
  if (item.kind === 'title' && p.text) {
    return `<div class="apercu apercu--titre">« ${esc(p.text)} »</div>`;
  }
  // Tous les autres objets (potions, jetons…) peuvent avoir une image
  if (item.kind !== 'banner' && p.image) {
    return `<img class="article__icone" src="${esc(new URL(p.image, RACINE_IMAGES))}" alt="">`;
  }
  // Pas d'image : une petite étoile au centre de la niche
  return `<span class="article__sans-image" aria-hidden="true">✦</span>`;
}

// Couleurs d'un thème en petites pastilles rondes (vide pour les autres objets)
export function pastilles(item) {
  if (item.kind !== 'theme') return '';
  const couleurs = [item.payload?.accent, item.payload?.accent2].map(couleur).filter(Boolean);
  if (!couleurs.length) return '';
  return `<div class="pastilles" aria-label="Couleurs du thème">${
    couleurs.map((c) => `<span class="pastille" style="--c:${c}" title="${c}"></span>`).join('')
  }</div>`;
}

// Image d'aperçu ou icône introuvable -> on la retire au lieu d'afficher une image cassée
export function masquerImagesCassees(zone) {
  zone.querySelectorAll('.apercu img').forEach((img) => {
    img.addEventListener('error', () => img.parentElement.remove(), { once: true });
  });
  zone.querySelectorAll('.article__icone').forEach((img) => {
    img.addEventListener('error', () => img.outerHTML = '<span class="article__sans-image" aria-hidden="true">✦</span>', { once: true });
  });
}


// Petite pièce d'or à côté des prix
export const piece = () =>
  `<img class="piece" src="${esc(new URL('img/Equipement/Or-icone.webp', SITE_ROOT))}" alt="pièces">`;

// Un article de l'étal : l'objet posé dans sa niche sur l'étagère,
// et son étiquette suspendue en dessous (type, nom, description, prix, achat)
export function htmlArticle({ item, prix, bouton, stock = '', epuise = false, extra = '' }) {
  return `
    <article class="article${epuise ? ' article--epuise' : ''}">
      <div class="article__niche">${apercu(item)}</div>
      <div class="article__etiquette">
        <span class="article__type">${esc(LIBELLES_ARTICLE[item.kind] ?? item.kind)}</span>
        <h3 class="article__nom">${esc(item.name)}</h3>
        ${extra}
        ${item.description ? `<p class="article__desc">${esc(item.description)}</p>` : '<p class="article__desc"></p>'}
        <div class="article__prix">${prix} ${piece()}</div>
        ${stock}
        ${bouton}
      </div>
    </article>`;
}

// Bouton d'achat (même logique pour les deux boutiques)
export function boutonAchat(boutique, itemId, prix, bloque) {
  if (bloque) {
    return `<button type="button" class="btn-acheter" disabled>${bloque}</button>`;
  }
  if (!etat.moi) {
    return `<button type="button" class="btn-acheter" disabled>Connecte-toi pour acheter</button>`;
  }
  if (etat.solde < prix) {
    return `<button type="button" class="btn-acheter" disabled>Pas assez de pièces</button>`;
  }
  return `<button type="button" class="btn-acheter" data-boutique="${boutique}" data-item="${itemId}">Acheter</button>`;
}

