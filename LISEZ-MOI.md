# Duel des Couronnes — le jeu de cartes de Nocthémar

Ce dossier contient **tout le jeu de cartes**, séparé du site Nocthémar :
le duel (contre l'IA, contre un ami, mode Histoire), la collection de cartes,
leurs styles, leurs images et le SQL Supabase qui va avec.

Il utilise **la même base Supabase** que le site : mêmes comptes Discord,
mêmes cartes, mêmes pièces, même progression.

## Les pages

| Page | Rôle |
|---|---|
| `index.html` | Entrée du jeu : renvoie vers `jeu-cartes.html` |
| `jeu-cartes.html` | Le menu et le plateau du Duel des Couronnes |
| `histoire.html` | Le mode Histoire (carte des chapitres et des niveaux) |
| `pass.html` | Le Pass de saison : 30 paliers, piste gratuite et piste premium (payée en or du jeu) |
| `collection.html` | La collection de cartes (le grimoire) et les cartes favorites |

## Les fichiers

- `JS/jeu-cartes-moteur.js` : les règles (Grimoire, pioche, Tombeau, attaques, d20, Destin, IA)
- `JS/jeu-cartes-arene.js` : l'affichage du plateau et les animations
- `JS/jeu-cartes-effets.js`, `JS/jeu-cartes-son.js` : effets visuels et sons
- `JS/jeu-cartes-attaques.js` : l'animation de chaque attaque (par Veine, et les attaques
  signatures des personnages : pour une nouvelle carte, ajouter son attaque dans `ATTAQUES`)
- `JS/jeu-cartes-ligne.js` : le mode en ligne (salons Supabase Realtime)
- `JS/jeu-cartes.js` : le pilote de la page du jeu
- `JS/boutique-boosters.js`, `JS/booster-ouverture.js`, `CSS/booster.css` : les boosters de cartes (achat dans la Boutique, animation d'ouverture)
- `JS/pass.js`, `CSS/pass.css` : la page du Pass de saison (l'XP se gagne en fin de duel, dans `JS/jeu-cartes.js`)
- `JS/histoire-data.js` : les chapitres et niveaux du mode Histoire (à modifier à la main)
- `JS/histoire.js`, `JS/collection.js`, `JS/cartes.js` : mode Histoire, collection, affichage des cartes
- `JS/supabase.js`, `JS/auth.js`, `JS/commun.js` : connexion Supabase / Discord, outils communs
- `JS/barre-laterale.js` : la barre de navigation (Le Duel, Mode Histoire, Collection, liens vers le site)
- `JS/lien-site.js` : **l'adresse du site Nocthémar** (voir plus bas)
- `JS/embers.js` : les particules
- `CSS/` : les styles (ceux du site dont le jeu a besoin, et ceux du jeu)
- `img/` : cartes, objets de pouvoir, fonds, plateaux, carte du mode Histoire, logo
- **Plateaux** : l’arène par défaut (`plateau-defaut.webp`) et ses versions de saison (`img/Plateaux de carte/plateau-automne|hiver|printemps|ete.webp`, toutes en 1672 × 941, même disposition des cases) ;
  pour en voir un autre : `jeu-cartes.html?saison=hiver`
- `SQL/` : les tables et fonctions Supabase des cartes et du mode Histoire

## À faire pour le mettre en ligne

1. **L'adresse du site Nocthémar** : ouvre `JS/lien-site.js` et remplace
   `https://ton-site-nocthemar.example/` par la vraie adresse du site (avec le `/` final).
   Tous les liens vers le site (Accueil, Le Codex, profil, boutique, panneau MJ)
   passent par là.
2. **La connexion Discord** : dans Supabase > Authentication > URL Configuration,
   ajoute l'adresse du jeu dans les *Redirect URLs* (par exemple
   `https://ton-pseudo.github.io/duel-des-couronnes/**`).
3. **Le site Nocthémar** : son bouton « Jeu de cartes » (dans `JS/barre-laterale.js` du site)
   doit pointer vers l'adresse du jeu.
4. **La base** : les fichiers de `SQL/` sont déjà passés dans Supabase pour la plupart ;
   `mode_histoire.sql` est à lancer s'il ne l'a pas encore été.
   Pour le Pass de saison et les boosters, dans cet ordre : relancer `mode_histoire.sql` (XP 200 / 500),
   lancer `boosters.sql`, puis `pass_saison.sql`.
   Pour les plateaux en boutique : lancer `plateaux.sql` (après `boosters.sql`).
   Pour les thèmes Bleu, Violet et Orange en boutique : lancer `themes_couleurs.sql`.
   Pour les échanges de cartes entre joueurs (le marché du grimoire, signet « Échanges ») : lancer `echanges.sql`.
   Pour les doublons (plusieurs exemplaires d'une carte, recyclage contre de l'or) : lancer `doublons.sql`,
   puis relancer `boosters.sql` et `echanges.sql`.

## Bon à savoir

- **La connexion** est enregistrée par Supabase dans le navigateur, adresse par adresse.
  Si le jeu et le site ont la même adresse de base (ex. deux dossiers sur
  `ton-pseudo.github.io`), la connexion est partagée. Sinon, il faut se connecter
  une fois sur le jeu.
- **Le choix du Grimoire** (« Choisir mes cartes ») est retenu dans le navigateur
  (clé `duel-couronnes-grimoire`). Le profil du site le lit pour son encart du duel :
  sur une autre adresse, le profil ne le verra plus.
- **La recherche du Codex** n'est pas dans le jeu : elle reste sur le site.
- Le jeu se lance avec un serveur (Live Server, GitHub Pages…), pas en ouvrant le
  fichier directement (les modules JavaScript l'exigent).
