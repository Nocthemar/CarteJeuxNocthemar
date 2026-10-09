// =====================================================================
//  Cartes à collectionner — code partagé entre le profil et le grimoire
//  (rendu d'une carte, deck de 5 cartes, glisser-déposer souris + tactile).
//  Toutes les écritures passent par des fonctions SQL (SQL/cartes_collection.sql) :
//  impossible de s'ajouter une carte depuis le navigateur.
// =====================================================================
import { supabase, SITE_ROOT } from './supabase.js';
import { esc, notifier } from './commun.js';

export const DECK_MAX = 5;
export const NOM_DECK_DEFAUT = 'Deck de cartes';
// Dos de carte selon la rareté (vert pour les éveillées, doré pour les transcendantes, rouge sinon)
const VERSO_DEFAUT = 'img/Cartes/Verso-Carte.webp';
const VERSOS = {
  eveillee: 'img/Cartes/Verso-Eveillee.webp',
  transcendante: 'img/Cartes/Verso-Or-Carte.webp',
};

export const RARETES = {
  commune: 'Commune', eveillee: 'Éveillée', mythique: 'Mythique', legendaire: 'Légendaire', transcendante: 'Transcendante',
};


// Les 12 Veines (mêmes icônes que categories/Les_Veines.html)
export const VEINES = {
  sang:    ['Veine du Sang', '🩸'],       trone:  ['Veine du Trône', '👑'],
  regard:  ['Veine du Regard', '👁️'],     reve:   ['Veine du Rêve', '🌙'],
  tombeau: ['Veine du Tombeau', '⚰️'],    bete:   ['Veine de la Bête', '🐺'],
  forge:   ['Veine de la Forge', '⚒️'],   maree:  ['Veine de la Marée', '🌊'],
  racine:  ['Veine de la Racine', '🌿'],  esprit: ['Veine de l’Esprit', '🕯️'],
  ombre:   ['Veine de l’Ombre', '🌑'],    chaine: ['Veine de la Chaîne', '⛓️'],
  // Hors Veines : pouvoirs du Maître du Jeu
  destin:  ['Pouvoir du Destin', '🎲'],
};
const RANGS = ['', 'I', 'II', 'III', 'IV', 'V'];   // Rang I = le plus puissant

const attaquesDe = (carte) => [carte.attack_1, carte.attack_2].filter((a) => a?.nom);

// Informations écrites dans le cadre noir du bas de la carte (nom, rang, attaques, rareté),
// à la manière d'une carte Pokémon. Seulement pour les cartes qui ont un rang ou des attaques,
// et pour les Transcendantes (illustration pleine carte, sans cadre noir : fond léger à la place).
export function htmlInfos(carte, rarete = RARETES[carte.rarity] ? carte.rarity : 'commune') {
  const attaques = attaquesDe(carte);
  if (!carte.rank && !attaques.length && rarete !== 'transcendante') return '';

  const lignes = attaques.map((a) => {
    const [veine, icone] = VEINES[a.veine] ?? ['Veine inconnue', '✦'];
    return `
      <div class="carte-attaque">
        <span class="carte-attaque__veine" title="${esc(veine)}">${icone}</span>
        <span class="carte-attaque__texte">
          <span class="carte-attaque__nom">${esc(a.nom)}</span>
          ${a.effet ? `<span class="carte-attaque__effet">${esc(a.effet)}</span>` : ''}
        </span>
        ${a.puissance != null ? `<span class="carte-attaque__puissance">${esc(a.puissance)}</span>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="carte-infos carte-infos--${rarete}">
      <div class="carte-infos__tete">
        <span class="carte-infos__nom">${esc(carte.name)}</span>
        ${RANGS[carte.rank] ? `<span class="carte-infos__rang">Rang ${RANGS[carte.rank]}</span>` : ''}
      </div>
      ${lignes ? `<div class="carte-infos__attaques">${lignes}</div>` : ''}
      <div class="carte-infos__rarete"><span class="carte-infos__gemme"></span>${RARETES[rarete]}</div>
    </div>`;
}

// Infobulle : tout le texte de la carte, lisible même quand la carte est petite
function infobulleDe(carte, rarete) {
  const lignes = [`${carte.name}${RANGS[carte.rank] ? ` — Rang ${RANGS[carte.rank]}` : ''} — ${RARETES[rarete]}`];
  for (const a of attaquesDe(carte)) {
    const puissance = a.puissance != null ? ` (${a.puissance})` : '';
    lignes.push(`${VEINES[a.veine]?.[1] ?? '✦'} ${a.nom}${puissance}${a.effet ? ` : ${a.effet}` : ''}`);
  }
  if (carte.description) lignes.push(carte.description);
  return lignes.join('\n');
}

// Une carte (image + nom de secours si l'image manque)
export function htmlCarte(carte) {
  const rarete = RARETES[carte.rarity] ? carte.rarity : 'commune';
  const image = carte.image
    ? `<img src="${esc(new URL(carte.image, SITE_ROOT))}" alt="" draggable="false" loading="lazy">`
    : '';
  return `
    <div class="carte-jeu carte-jeu--${rarete}${image ? '' : ' carte-jeu--sans-image'}" data-carte="${carte.id}" title="${esc(infobulleDe(carte, rarete))}">
      ${image}
      ${image ? htmlInfos(carte, rarete) : ''}
      <span class="carte-jeu__nom">${esc(carte.name)}</span>
    </div>`;
}

// Loupe : affiche la carte en grand, avec toutes ses informations lisibles
export function boutonLoupe(id) {
  return `<button type="button" class="carte-loupe" data-action="loupe" data-loupe="${id}" title="Voir la carte en grand" aria-label="Voir la carte en grand">🔍</button>`;
}

export function ouvrirApercu(carte) {
  if (!carte) return;
  const retour = document.activeElement;
  const fond = document.createElement('div');
  fond.className = 'apercu-carte';
  fond.setAttribute('role', 'dialog');
  fond.setAttribute('aria-modal', 'true');
  fond.setAttribute('aria-label', carte.name);
  fond.innerHTML = `
    <div class="apercu-carte__carte">${htmlCarte(carte)}</div>
    <button type="button" class="apercu-carte__fermer" aria-label="Fermer">×</button>`;

  const clavier = (e) => { if (e.key === 'Escape') fermer(); };
  const fermer = () => {
    fond.remove();
    document.removeEventListener('keydown', clavier);
    retour?.focus?.();
  };
  // Clic à côté de la carte ou sur × : fermeture
  fond.addEventListener('click', (e) => { if (!e.target.closest('.carte-jeu')) fermer(); });
  document.addEventListener('keydown', clavier);

  document.body.append(fond);
  fond.querySelector('.apercu-carte__fermer').focus();
}

// Image introuvable -> on garde le cadre de la carte avec son nom
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.parentElement?.classList.contains('carte-jeu')) return;
  img.parentElement.classList.add('carte-jeu--sans-image');
  img.remove();
}, true);


// Deck d'un joueur (lisible par tous) : { nom, ids: [5 ids ou null], cartes: Map id -> carte }
export async function chargerDeck(discordId) {
  const [{ data: deck }, { data: lignes }] = await Promise.all([
    supabase.from('player_decks').select('name').eq('discord_id', discordId).maybeSingle(),
    supabase.from('player_deck_cards').select('position, card:cards(*)').eq('discord_id', discordId),
  ]);

  const ids = Array(DECK_MAX).fill(null);
  const cartes = new Map();
  for (const { position, card } of lignes ?? []) {
    ids[position - 1] = card.id;
    cartes.set(card.id, card);
  }
  return { nom: deck?.name ?? NOM_DECK_DEFAUT, ids, cartes };
}


// ---------------------------------------------------------------------
//  Section deck : 5 emplacements, renommable et modifiable par son propriétaire
// ---------------------------------------------------------------------
export class Deck {
  constructor(zone, { nom, ids, cartes, editable = false, lienAjout = null, surChangement = () => {} }) {
    Object.assign(this, { zone, nom, ids, cartes, editable, lienAjout, surChangement });
    zone.addEventListener('click', (e) => this.#clic(e));
    // Clavier : Entrée / Espace retournent la carte qui a le focus
    zone.addEventListener('keydown', (e) => {
      const flip = e.target.closest('.deck-flip');
      if (!flip || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      this.#retourner(flip);
    });
    this.afficher();
  }

  contient(id) { return this.ids.includes(id); }

  afficher() {
    const emplacements = this.ids.map((id, i) => {
      const carte = id != null ? this.cartes.get(id) : null;
      if (carte) {
        return `
          <div class="deck-emplacement deck-emplacement--plein" data-position="${i}"
            data-nom="${esc(carte.name)}" data-rarete="${RARETES[carte.rarity] ? carte.rarity : 'commune'}">
            <div class="deck-flip" role="button" tabindex="0" aria-pressed="false"
              title="Cliquer pour retourner la carte" aria-label="Retourner ${esc(carte.name)}">
              ${htmlCarte(carte)}
              <div class="carte-verso carte-verso--${RARETES[carte.rarity] ? carte.rarity : 'commune'}" aria-hidden="true">
                <img src="${esc(new URL(VERSOS[carte.rarity] ?? VERSO_DEFAUT, SITE_ROOT))}" alt="" draggable="false" loading="lazy">
              </div>
            </div>
            ${boutonLoupe(carte.id)}
            ${this.editable ? `<button type="button" class="deck-retirer" data-action="retirer" data-position="${i}" title="Retirer du deck" aria-label="Retirer ${esc(carte.name)} du deck">×</button>` : ''}
          </div>`;
      }
      const contenu = this.editable && this.lienAjout
        ? `<a class="deck-emplacement__ajout" href="${esc(this.lienAjout)}" title="Choisir une carte dans ma collection">+</a>`
        : `<span class="deck-emplacement__num">${i + 1}</span>`;
      return `<div class="deck-emplacement" data-position="${i}">${contenu}</div>`;
    }).join('');

    this.zone.innerHTML = `
      <div class="deck-tete">
        <h2 class="deck-nom"></h2>
        ${this.editable ? '<button type="button" class="btn-petit btn-petit--lien" data-action="renommer">Renommer</button>' : ''}
      </div>
      <div class="deck-emplacements">${emplacements}</div>`;
    // textContent : un nom de deck ne peut pas injecter de code
    this.zone.querySelector('.deck-nom').textContent = this.nom;
  }

  // Met une carte à la position donnée. Si elle était déjà dans le deck, les deux échangent leur place ;
  // sinon elle remplace la carte présente.
  placer(id, position, carte) {
    if (carte) this.cartes.set(id, carte);
    const ancienne = this.ids.indexOf(id);
    if (ancienne === position) return;
    const avant = [...this.ids];
    if (ancienne >= 0) this.ids[ancienne] = this.ids[position];
    this.ids[position] = id;
    return this.#enregistrer(avant);
  }

  // Ajoute la carte au premier emplacement libre, ou l'enlève si elle y est déjà
  basculer(id, carte) {
    const i = this.ids.indexOf(id);
    if (i >= 0) return this.retirer(i);
    const libre = this.ids.indexOf(null);
    if (libre < 0) {
      notifier(`Ton deck est complet (${DECK_MAX} cartes). Retires-en une d'abord.`, 'erreur');
      return;
    }
    return this.placer(id, libre, carte);
  }

  retirer(position) {
    const avant = [...this.ids];
    this.ids[position] = null;
    return this.#enregistrer(avant);
  }

  async #enregistrer(avant) {
    this.afficher();
    this.surChangement();
    const { error } = await supabase.rpc('set_deck', { p_card_ids: this.ids });
    if (error) {
      this.ids = avant;
      this.afficher();
      this.surChangement();
      notifier(error.message, 'erreur');
    }
  }

  // Un clic sur une carte du deck la retourne (recto <-> verso) ; un second clic la remet à l'endroit
  #retourner(flip) {
    const retournee = flip.classList.toggle('deck-flip--retournee');
    flip.setAttribute('aria-pressed', retournee);
  }

  #clic(e) {
    const bouton = e.target.closest('[data-action]');
    if (!bouton) {
      const flip = e.target.closest('.deck-flip');
      if (flip) this.#retourner(flip);
      return;
    }
    if (bouton.dataset.action === 'loupe') return ouvrirApercu(this.cartes.get(Number(bouton.dataset.loupe)));
    if (!this.editable) return;
    if (bouton.dataset.action === 'retirer') this.retirer(Number(bouton.dataset.position));
    if (bouton.dataset.action === 'renommer') this.#formulaireNom();
  }

  #formulaireNom() {
    const titre = this.zone.querySelector('.deck-tete');
    titre.innerHTML = `
      <form class="deck-renommer">
        <input type="text" name="nom" maxlength="40" required aria-label="Nom du deck">
        <button type="submit" class="btn-petit">Enregistrer</button>
        <button type="button" class="btn-petit btn-petit--retirer" data-annuler>Annuler</button>
      </form>`;
    const form = titre.querySelector('form');
    const champ = form.elements.nom;
    champ.value = this.nom;
    champ.focus();
    champ.select();

    form.querySelector('[data-annuler]').addEventListener('click', () => this.afficher());
    champ.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.afficher(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nom = champ.value.trim();
      if (!nom || nom === this.nom) return this.afficher();
      form.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
      const { data, error } = await supabase.rpc('rename_deck', { p_name: nom });
      if (error) {
        notifier(error.message, 'erreur');
        form.querySelectorAll('button, input').forEach((el) => { el.disabled = false; });
        return;
      }
      this.nom = data;
      this.afficher();
      notifier('Deck renommé.');
    });
  }
}


// ---------------------------------------------------------------------
//  Glisser-déposer à la souris et au doigt (Pointer Events).
//  Au doigt : appui long pour saisir la carte, sinon la page défile normalement.
//  deposer(element, cible) est appelé quand on lâche la carte sur une cible.
// ---------------------------------------------------------------------
const SEUIL = 6;          // px avant de considérer que la souris "glisse"
const APPUI_LONG = 280;   // ms au doigt avant de saisir la carte

export function activerGlisser(zone, { poignee, cible, deposer }) {
  let enCours = null;

  // Tant qu'une carte est saisie au doigt, on empêche la page de défiler
  document.addEventListener('touchmove', (e) => {
    if (enCours?.retenir) e.preventDefault();
  }, { passive: false });

  zone.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(poignee);
    if (!el || !zone.contains(el) || e.button !== 0 || e.target.closest('button, a')) return;

    const tactile = e.pointerType !== 'mouse';
    const depart = { x: e.clientX, y: e.clientY };
    const etat = { el, fantome: null, survol: null, retenir: false, minuteur: null };
    enCours = etat;

    const saisir = (x, y) => {
      const r = el.getBoundingClientRect();
      etat.decalage = { x: depart.x - r.left, y: depart.y - r.top };
      etat.fantome = el.cloneNode(true);
      etat.fantome.classList.add('carte-fantome');
      etat.fantome.style.width = `${r.width}px`;
      etat.fantome.style.height = `${r.height}px`;
      document.body.append(etat.fantome);
      el.classList.add('carte-jeu--saisie');
      etat.retenir = true;
      document.body.classList.add('glisser-actif');
      navigator.vibrate?.(15);
      suivre(x, y);
    };

    const suivre = (x, y) => {
      etat.fantome.style.transform = `translate(${x - etat.decalage.x}px, ${y - etat.decalage.y}px) rotate(4deg) scale(1.05)`;
      const dessous = document.elementFromPoint(x, y)?.closest(cible) ?? null;
      if (dessous !== etat.survol) {
        etat.survol?.classList.remove('cible-survol');
        etat.survol = dessous;
        etat.survol?.classList.add('cible-survol');
      }
    };

    if (tactile) {
      etat.minuteur = setTimeout(() => saisir(depart.x, depart.y), APPUI_LONG);
    }

    const bouger = (ev) => {
      if (etat.fantome) return suivre(ev.clientX, ev.clientY);
      const distance = Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y);
      if (distance < SEUIL) return;
      if (tactile) return terminer();   // le doigt bouge avant l'appui long : c'est un défilement
      saisir(ev.clientX, ev.clientY);
    };

    const terminer = (ev) => {
      clearTimeout(etat.minuteur);
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', terminer);
      window.removeEventListener('pointercancel', terminer);
      enCours = null;
      if (!etat.fantome) return;

      etat.fantome.remove();
      el.classList.remove('carte-jeu--saisie');
      document.body.classList.remove('glisser-actif');
      etat.survol?.classList.remove('cible-survol');

      // Le "click" qui suit un glisser ne doit pas sélectionner la carte
      const bloquerClic = (c) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', bloquerClic, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', bloquerClic, { capture: true }), 0);

      if (ev?.type === 'pointerup' && etat.survol) deposer(el, etat.survol);
    };

    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', terminer);
    window.addEventListener('pointercancel', terminer);
  });

  // Empêche le menu contextuel de l'appui long sur mobile
  zone.addEventListener('contextmenu', (e) => {
    if (e.target.closest(poignee)) e.preventDefault();
  });
}
