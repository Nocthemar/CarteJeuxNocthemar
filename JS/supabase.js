// =====================================================================
//  Connexion à Supabase — la même base que le site Nocthémar (comptes, cartes, pièces)
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ⚠️ À remplir : Project Settings > API Keys (et Data API pour l'URL)
// La clé "anon" / "publishable" peut être publique. JAMAIS la service_role ici.
const SUPABASE_URL = 'https://euurgbwgygtsqduyadmh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_crhtcVpnj4aXIx3FpG4eeA_u3RgV7TB';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Racine du site (ce fichier est dans /js/, donc la racine est le dossier au-dessus).
// Marche aussi bien en local (Live Server) que sur GitHub Pages.
export const SITE_ROOT = new URL('../', import.meta.url);

// Bouton "Connecter Discord" : on revient sur la page d'où on vient
export async function connexionDiscord() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) alert('Connexion impossible : ' + error.message);
}

export async function deconnexion() {
  await supabase.auth.signOut();
  location.reload();
}

// Renvoie la ligne "players" du joueur connecté, ou null
export async function getMonJoueur() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('players')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return data;
}
