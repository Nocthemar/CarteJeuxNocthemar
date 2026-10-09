// =====================================================================
//  Page boutique — point d'entrée
//  - Boutique du jour    : JS/boutique-jour.js   (sélection gérée par le bot Discord)
//  - Boutique du profil  : JS/boutique-profil.js (cosmétiques gérés par le site)
//  - Code partagé        : JS/boutique-commun.js
//  Les achats passent par les fonctions SQL buy_daily_item / buy_fun_item :
//  le solde et le stock sont vérifiés côté serveur, impossible de tricher.
// =====================================================================
import { getMonJoueur } from './supabase.js';
import { $, etat, chargerSolde, chargerPossedes, notifier } from './boutique-commun.js';
import { afficherBoutiqueDuJour, acheterDuJour, demarrerCompteARebours } from './boutique-jour.js';
import { afficherBoutiqueProfil, acheterProfil } from './boutique-profil.js';

const ACHATS = { jour: acheterDuJour, profil: acheterProfil };

async function init() {
  etat.moi = await getMonJoueur();

  if (etat.moi) {
    $('bourse').hidden = false;
    await Promise.all([chargerSolde(), chargerPossedes()]);
  }

  await Promise.all([afficherBoutiqueDuJour(), afficherBoutiqueProfil()]);
  demarrerCompteARebours();
}

document.addEventListener('click', async (e) => {
  const bouton = e.target.closest('.btn-acheter[data-item]');
  if (!bouton || bouton.disabled) return;

  const boutique = bouton.dataset.boutique;
  const itemId = Number(bouton.dataset.item);

  // Cosmétiques du profil : un seul exemplaire par joueur
  if (boutique === 'profil' && etat.possedes.has(itemId)) {
    notifier('Tu possèdes déjà cet objet.', 'erreur');
    return;
  }

  // Désactivé dès le premier clic pour qu'un double-clic ne lance pas deux achats
  bouton.disabled = true;
  const texteInitial = bouton.textContent;
  bouton.textContent = 'Achat…';

  const { data, error } = await ACHATS[boutique](itemId);

  if (error) {
    notifier(error.message, 'erreur');
    bouton.disabled = false;
    bouton.textContent = texteInitial;
  } else {
    notifier(`${data.item} acheté pour ${data.price} pièces !`);
  }

  // Le solde est commun aux deux boutiques : on les recharge toutes les deux
  await Promise.all([chargerSolde(), chargerPossedes()]);
  await Promise.all([afficherBoutiqueDuJour(), afficherBoutiqueProfil()]);
});

init();
