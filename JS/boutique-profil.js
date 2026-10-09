// =====================================================================
//  Boutique du profil
//  Cosmétiques de profil (items.shop = 'fun'), gérés par le site :
//  un exemplaire par joueur, achat via buy_fun_item.
// =====================================================================
import { supabase } from './supabase.js';
import { $, etat, htmlArticle, pastilles, masquerImagesCassees, boutonAchat } from './boutique-commun.js';

export async function afficherBoutiqueProfil() {
  const { data: items, error } = await supabase
    .from('items')
    .select('*')
    .eq('shop', 'fun')
    .eq('is_available', true)
    .order('price');

  const zone = $('profil');

  if (error) {
    zone.innerHTML = `<p class="vide">Impossible de charger la boutique.</p>`;
    return;
  }
  if (!items?.length) {
    zone.innerHTML = `<p class="vide">Rien à vendre pour l'instant.</p>`;
    return;
  }

  zone.innerHTML = items.map((item) => {
    const deja = etat.possedes.has(item.id);
    return htmlArticle({
      item,
      prix: item.price,
      extra: pastilles(item),
      bouton: boutonAchat('profil', item.id, item.price, deja ? 'Possédé' : null),
    });
  }).join('');

  masquerImagesCassees(zone);
}

export function acheterProfil(itemId) {
  return supabase.rpc('buy_fun_item', { p_item_id: itemId });
}
