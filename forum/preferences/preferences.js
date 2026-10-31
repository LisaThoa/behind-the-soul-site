/* Behind the Soul — la fiche de préférences RP.
 * Chaque joueur dit, thème par thème, ce qu'il accepte en scène (ok), ce qui peut exister sans être
 * décrit (hors champ) et ce qu'il refuse (non). La fiche vit dans un seul champ de profil, « Préférences RP »,
 * sous forme d'un texte lisible même sans script ; ce module en fait une grille, modifiable par son
 * propriétaire. comparer() croise plusieurs fiches sans dire qui a répondu quoi (pour le tableau des scènes).
 * Les violences sexuelles ne sont jamais « ok » : la règle du forum les garde hors champ. */
(function (window, document) {
  'use strict';

  var THEMES = [
    { id: 'violence', nom: 'Violence physique' },
    { id: 'sang', nom: 'Sang et blessures' },
    { id: 'torture', nom: 'Torture' },
    { id: 'armes', nom: 'Armes' },
    { id: 'drogue', nom: 'Drogue et addiction' },
    { id: 'mort', nom: 'Mort et deuil' },
    { id: 'maladie', nom: 'Maladie' },
    { id: 'automutilation', nom: 'Automutilation, idées suicidaires' },
    { id: 'emprise', nom: 'Harcèlement, manipulation, emprise' },
    { id: 'romance', nom: 'Romance' },
    { id: 'sexuel', nom: 'Contenu sexuel' },
    { id: 'violences-sexuelles', nom: 'Violences sexuelles', jamaisOk: true },
    { id: 'langage', nom: 'Langage cru' },
    { id: 'phobies', nom: 'Phobies (précise lesquelles dans tes limites)' },
  ];
  var NIVEAUX = [
    { id: 'ok', mot: 'ok', signe: '✓', aide: 'peut être joué en scène' },
    { id: 'hc', mot: 'hors champ', signe: '◐', aide: 'existe, sans être décrit' },
    { id: 'non', mot: 'non', signe: '✕', aide: 'jamais dans mes scènes' },
  ];
  var RANG = { ok: 0, hc: 1, non: 2 };
  var TITRES = { themes: '[préférences RP]', limites: '[mes limites en plus]', jeu: '[comment je joue]' };

  function theme(id) {
    return THEMES.filter(function (t) { return t.id === id; })[0];
  }

  function niveauDe(mot) {
    var m = String(mot || '').trim().toLowerCase();
    if (m === 'ok') return 'ok';
    if (m === 'hors champ' || m === 'hc') return 'hc';
    if (m === 'non') return 'non';
    return null;
  }

  function borne(id, niveau) {
    var t = theme(id);
    return t && t.jamaisOk && niveau === 'ok' ? 'hc' : niveau;
  }

  /* ---------- le texte du champ ---------- */

  function lire(texte) {
    var fiche = { themes: {}, limites: '', jeu: '' };
    var partie = null;
    var lignes = { limites: [], jeu: [] };
    String(texte || '').replace(/\r\n/g, '\n').split('\n').forEach(function (ligne) {
      var brute = ligne.trim();
      if (brute === TITRES.themes) { partie = 'themes'; return; }
      if (brute === TITRES.limites) { partie = 'limites'; return; }
      if (brute === TITRES.jeu) { partie = 'jeu'; return; }
      if (partie === 'themes') {
        var m = brute.match(/^([a-z-]+)\s*:\s*(.+)$/i);
        if (!m || !theme(m[1].toLowerCase())) return;
        var niveau = niveauDe(m[2]);
        if (niveau) fiche.themes[m[1].toLowerCase()] = borne(m[1].toLowerCase(), niveau);
      } else if (partie) {
        lignes[partie].push(ligne);
      }
    });
    fiche.limites = lignes.limites.join('\n').trim();
    fiche.jeu = lignes.jeu.join('\n').trim();
    return fiche;
  }

  function ecrire(fiche) {
    var mots = { ok: 'ok', hc: 'hors champ', non: 'non' };
    var sortie = [TITRES.themes];
    THEMES.forEach(function (t) {
      var niveau = fiche.themes && fiche.themes[t.id];
      if (niveau) sortie.push(t.id + ' : ' + mots[borne(t.id, niveau)]);
    });
    sortie.push(TITRES.limites, (fiche.limites || '').trim());
    sortie.push(TITRES.jeu, (fiche.jeu || '').trim());
    return sortie.join('\n').trim();
  }

  function comparer(fiches) {
    var pire = {};
    fiches.forEach(function (f) {
      Object.keys(f.themes || {}).forEach(function (id) {
        var n = f.themes[id];
        if (pire[id] === undefined || RANG[n] > RANG[pire[id]]) pire[id] = n;
      });
    });
    return pire;
  }

  /* ---------- l'affichage ---------- */

  function element(nom, classe, texte) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  var compteur = 0;

  function monter(conteneur, options) {
    var fiche = lire(options.texte);
    var modifiable = !!options.modifiable;
    var uid = 'bts-pref-' + (++compteur);
    conteneur.textContent = '';
    conteneur.classList.add('bts-pref');

    var grille = element(modifiable ? 'div' : 'ul', 'bts-pref__grille');
    THEMES.forEach(function (t) {
      var niveau = fiche.themes[t.id] || null;
      if (!modifiable) {
        var li = element('li', 'bts-pref__theme' + (niveau ? ' bts-pref__theme--' + niveau : ''));
        li.appendChild(element('span', 'bts-pref__nom', t.nom));
        var n = NIVEAUX.filter(function (x) { return x.id === niveau; })[0];
        var valeur = element('span', 'bts-pref__niveau');
        if (n) {
          var signe = element('span', 'bts-pref__signe', n.signe);
          signe.setAttribute('aria-hidden', 'true');
          valeur.appendChild(signe);
          valeur.appendChild(document.createTextNode(' ' + n.mot));
        } else {
          valeur.textContent = 'pas indiqué';
        }
        li.appendChild(valeur);
        grille.appendChild(li);
        return;
      }
      var groupe = element('fieldset', 'bts-pref__theme');
      groupe.appendChild(element('legend', 'bts-pref__nom', t.nom));
      var choix = element('div', 'bts-pref__choix');
      NIVEAUX.forEach(function (n) {
        if (t.jamaisOk && n.id === 'ok') return;
        var label = element('label', 'bts-pref__option bts-pref__option--' + n.id);
        label.title = n.aide;
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = uid + '-' + t.id;
        radio.value = n.id;
        radio.checked = niveau === n.id;
        label.appendChild(radio);
        var signe = element('span', 'bts-pref__signe', n.signe);
        signe.setAttribute('aria-hidden', 'true');
        label.appendChild(signe);
        label.appendChild(document.createTextNode(' ' + n.mot));
        choix.appendChild(label);
      });
      groupe.appendChild(choix);
      grille.appendChild(groupe);
    });
    conteneur.appendChild(grille);

    function zone(cle, titre, aide) {
      var bloc = element('div', 'bts-pref__' + cle);
      if (modifiable) {
        var id = uid + '-' + cle;
        var label = element('label', 'bts-pref__titre', titre);
        label.htmlFor = id;
        bloc.appendChild(label);
        var champ = document.createElement('textarea');
        champ.id = id;
        champ.rows = 3;
        champ.value = fiche[cle];
        champ.placeholder = aide;
        bloc.appendChild(champ);
      } else {
        if (!fiche[cle]) return null;
        bloc.appendChild(element('p', 'bts-pref__titre', titre));
        bloc.appendChild(element('p', 'bts-pref__texte', fiche[cle]));
      }
      return bloc;
    }
    [zone('limites', 'Mes limites en plus', 'Ce que la grille ne couvre pas.'),
      zone('jeu', 'Comment je joue', 'Rythme, longueur, PNJ… facultatif.')].forEach(function (b) {
      if (b) conteneur.appendChild(b);
    });

    var controle = {
      fiche: function () {
        var f = { themes: {}, limites: '', jeu: '' };
        THEMES.forEach(function (t) {
          var coche = conteneur.querySelector('input[name="' + uid + '-' + t.id + '"]:checked');
          if (coche) f.themes[t.id] = coche.value;
        });
        var l = conteneur.querySelector('.bts-pref__limites textarea');
        var j = conteneur.querySelector('.bts-pref__jeu textarea');
        f.limites = l ? l.value : '';
        f.jeu = j ? j.value : '';
        return f;
      },
    };

    if (modifiable) {
      var pied = element('div', 'bts-pref__pied');
      var bouton = element('button', 'bts-pref__enregistrer button1', 'Enregistrer mes préférences');
      bouton.type = 'button';
      var statut = element('p', 'bts-pref__statut');
      statut.setAttribute('role', 'status');
      pied.appendChild(bouton);
      pied.appendChild(statut);
      conteneur.appendChild(pied);
      controle.enregistrer = function () {
        statut.textContent = 'Enregistrement…';
        bouton.disabled = true;
        return Promise.resolve(options.enregistrer(ecrire(controle.fiche()))).then(function (ok) {
          statut.textContent = ok ? 'Préférences enregistrées.' : 'Les préférences n\'ont pas pu être enregistrées. Réessaie dans un instant.';
        }, function () {
          statut.textContent = 'Les préférences n\'ont pas pu être enregistrées. Réessaie dans un instant.';
        }).then(function () { bouton.disabled = false; });
      };
      bouton.addEventListener('click', function () { controle.enregistrer(); });
    }
    return controle;
  }

  window.BTSPreferences = {
    THEMES: THEMES, NIVEAUX: NIVEAUX, lire: lire, ecrire: ecrire, comparer: comparer, monter: monter,
  };
})(window, document);
