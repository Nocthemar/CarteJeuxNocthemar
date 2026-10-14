// =====================================================================
//  Paramètres (parametres.html)
//  - Son : volume général, musique, effets (JS/jeu-cartes-son.js), tout couper, écouter
//  - Affichage : animations réduites, effets légers, conseils du duel (JS/preferences.js), thème clair
//  - Compte : déconnexion, suppression du compte (supprimer_mon_compte, SQL/compte.sql)
//  Tout est retenu dans le navigateur, sauf la suppression du compte.
// =====================================================================
import { supabase, getMonJoueur, connexionDiscord, deconnexion } from './supabase.js';
import { $, notifier } from './commun.js';
import { CLES, lirePref, ecrirePref } from './preferences.js';
import {
  jouerSon, lireVolumes, reglerVolume, reglerVolumeEffets, reglerVolumeMusique,
  estMuet, basculerMuet, demarrerMusique, arreterMusique,
} from './jeu-cartes-son.js';

// ---------- Son ----------
function majCurseurs() {
  const v = lireVolumes();
  for (const [id, val] of [['general', v.general], ['musique', v.musique], ['effets', v.effets]]) {
    $(`vol-${id}`).value = Math.round(val * 100);
    $(`val-${id}`).textContent = `${Math.round(val * 100)} %`;
    $(`vol-${id}`).style.setProperty('--pct', `${Math.round(val * 100)}%`);
  }
  $('muet').checked = estMuet();
}
$('vol-general').addEventListener('input', (e) => { reglerVolume(e.target.value / 100); majCurseurs(); });
$('vol-effets').addEventListener('input', (e) => { reglerVolumeEffets(e.target.value / 100); majCurseurs(); });
$('vol-effets').addEventListener('change', () => jouerSon('cloche'));
$('vol-musique').addEventListener('input', (e) => { reglerVolumeMusique(e.target.value / 100); majCurseurs(); });
$('muet').addEventListener('change', () => { if ($('muet').checked !== estMuet()) basculerMuet(); majCurseurs(); });
$('essai-effet').addEventListener('click', () => { jouerSon('cire'); jouerSon('cloche', 0.35); });
let ecoute = false;
$('essai-musique').addEventListener('click', () => {
  ecoute = !ecoute;
  if (ecoute) demarrerMusique(); else arreterMusique();
  $('essai-musique').textContent = ecoute ? 'Arrêter la musique' : 'Écouter la musique';
});
majCurseurs();

// ---------- Affichage ----------
const CASES = { 'anim-reduites': CLES.animationsReduites, 'effets-legers': CLES.effetsLegers, conseils: CLES.conseils };
for (const [id, cle] of Object.entries(CASES)) {
  $(id).checked = lirePref(cle);
  $(id).addEventListener('change', () => { ecrirePref(cle, $(id).checked); notifier('Réglage enregistré.'); });
}
const themeClair = () => { try { return localStorage.getItem('nocthemar-theme') === 'jour'; } catch { return false; } };
$('theme-clair').checked = themeClair();
$('theme-clair').addEventListener('change', () => {
  const clair = $('theme-clair').checked;
  try { localStorage.setItem('nocthemar-theme', clair ? 'jour' : 'nuit'); } catch { /* stockage indisponible */ }
  if (clair) document.documentElement.dataset.theme = 'jour';
  else delete document.documentElement.dataset.theme;
});

// ---------- Compte ----------
async function majCompte() {
  const moi = await getMonJoueur().catch(() => null);
  $('compte-deconnecte').hidden = !!moi;
  $('compte-connecte').hidden = !moi;
  if (!moi) return;
  $('compte-nom').textContent = moi.username ?? 'Aventurier';
  if (moi.avatar_url) $('compte-avatar').src = moi.avatar_url; else $('compte-avatar').hidden = true;
}
$('btn-connecter').addEventListener('click', () => connexionDiscord());
$('btn-deconnexion').addEventListener('click', async () => { await deconnexion(); location.reload(); });

const dialogue = $('dialogue-suppression');
$('btn-supprimer').addEventListener('click', () => {
  $('confirmation').value = '';
  $('suppression-ok').disabled = true;
  dialogue.showModal();
  $('confirmation').focus();
});
$('confirmation').addEventListener('input', () => { $('suppression-ok').disabled = $('confirmation').value.trim() !== 'SUPPRIMER'; });
$('suppression-annuler').addEventListener('click', () => dialogue.close());
$('suppression-ok').addEventListener('click', async () => {
  $('suppression-ok').disabled = true;
  const { error } = await supabase.rpc('supprimer_mon_compte', { p_confirmation: $('confirmation').value.trim() });
  if (error) {
    notifier(/PGRST202|schema cache/.test(`${error.code} ${error.message}`)
      ? 'La suppression de compte n’est pas encore installée (SQL/compte.sql).' : (error.message || 'Suppression impossible.'), 'erreur');
    $('suppression-ok').disabled = false;
    return;
  }
  dialogue.close();
  await deconnexion().catch(() => {});
  alert('Ton compte a été supprimé. Adieu, aventurier.');
  location.href = 'jeu-cartes.html';
});

majCompte();
