// Thème de jour du site (choisi sur le site Nocthémar, retenu dans le navigateur) : appliqué avant
// l'affichage de la page. Fichier à part, et non script dans la page : la politique de sécurité
// (Content-Security-Policy des pages) interdit les scripts écrits dans le HTML.
try { if (localStorage.getItem('nocthemar-theme') === 'jour') document.documentElement.dataset.theme = 'jour'; } catch (e) { /* stockage indisponible */ }
