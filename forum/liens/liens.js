/* Behind the Soul — les liens à double accord, en répertoire de bipeur.
 * Chacun note ses liens dans le champ de profil « Liens », une ligne « Pseudo : nature ». Un lien ne
 * s'affiche que s'il est réciproque (l'autre a noté ce résident en retour) ; sinon seul son auteur le voit,
 * « en attente ». Personne n'est prévenu d'un refus : ne pas noter le lien suffit. */
(function (window, document) {
  'use strict';

  var TITRE = '[liens]';

  /* ---------- le texte du champ ---------- */

  function lire(texte) {
    var liens = [];
    String(texte || '').replace(/\r\n/g, '\n').split('\n').forEach(function (ligne) {
      var brute = ligne.trim();
      if (!brute || brute === '-' || /^\[.*\]$/.test(brute)) return;
      var i = brute.indexOf(' : ');
      var pseudo = (i === -1 ? brute.replace(/\s*:$/, '') : brute.slice(0, i)).trim();
      if (pseudo) liens.push({ pseudo: pseudo, nature: i === -1 ? '' : brute.slice(i + 3).trim() });
    });
    return liens;
  }

  function ecrire(liens) {
    return [TITRE].concat(liens.filter(function (l) { return l.pseudo && l.pseudo.trim(); }).map(function (l) {
      var nature = (l.nature || '').trim();
      return l.pseudo.trim() + (nature ? ' : ' + nature : '');
    })).join('\n');
  }

  function pareil(a, b) {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }

  /* ---------- la réciprocité ---------- */

  function page(url) {
    return window.fetch(url, { credentials: 'same-origin' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).then(function (html) {
      return new window.DOMParser().parseFromString(html, 'text/html');
    }, function () { return null; });
  }

  function trouverProfil(pseudo) {
    return page('/memberlist?mode=username&order=ASC&username=' + encodeURIComponent(pseudo)).then(function (doc) {
      if (!doc) return null;
      var lien = [].filter.call(doc.querySelectorAll('a[href]'), function (a) {
        return /^\/u\d+/.test(a.getAttribute('href')) && pareil(a.textContent, pseudo);
      })[0];
      return lien ? lien.getAttribute('href').match(/^\/u\d+/)[0] : null;
    });
  }

  function champDe(doc) {
    var champ = [].filter.call(doc.querySelectorAll('dl[id^="field_id"]'), function (dl) {
      var dt = dl.querySelector('dt');
      return dt && /^Liens\b/i.test(dt.textContent.trim());
    })[0];
    var valeur = champ && champ.querySelector('.field_uneditable');
    if (!valeur) return '';
    var copie = valeur.cloneNode(true);
    [].forEach.call(copie.querySelectorAll('br'), function (br) {
      br.parentNode.replaceChild(doc.createTextNode('\n'), br);
    });
    return copie.textContent;
  }

  function verifier(liens, proprietaire) {
    return Promise.all(liens.map(function (l) {
      return trouverProfil(l.pseudo).then(function (profil) {
        if (!profil) return { pseudo: l.pseudo, nature: l.nature, profil: null, etat: 'introuvable' };
        return page(profil).then(function (doc) {
          var retour = doc ? lire(champDe(doc)) : [];
          var ok = retour.some(function (r) { return pareil(r.pseudo, proprietaire); });
          return { pseudo: l.pseudo, nature: l.nature, profil: profil, etat: ok ? 'ok' : 'attente' };
        });
      });
    }));
  }

  /* ---------- le bipeur ---------- */

  function element(nom, classe, texte) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  var MOTS = { attente: 'en attente', introuvable: 'introuvable' };

  function monter(conteneur, options) {
    var modifiable = !!options.modifiable;
    var masques = options.masques || [];
    var contacts = (options.contacts || []).filter(function (c) {
      return (modifiable || c.etat === 'ok') && masques.indexOf(c.pseudo) === -1;
    });
    conteneur.textContent = '';

    var bipeur = element('div', 'bts-liens__bipeur');
    var ecran = element('div', 'bts-liens__ecran');
    var liste = element('ol', 'bts-liens__contacts');
    var message = element('p', 'bts-liens__message');
    message.setAttribute('aria-live', 'polite');
    var boutons = [];

    function choisir(i) {
      var c = contacts[i];
      boutons.forEach(function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      message.textContent = '';
      var nom = c.profil ? element('a', 'bts-liens__profil', c.pseudo) : element('span', null, c.pseudo);
      if (c.profil) nom.href = c.profil;
      message.appendChild(nom);
      message.appendChild(document.createTextNode(c.nature ? ' · ' + c.nature : ''));
      if (MOTS[c.etat]) message.appendChild(element('span', 'bts-liens__etat', ' (' + MOTS[c.etat] + ')'));
    }

    contacts.forEach(function (c, i) {
      var li = element('li');
      var b = element('button', 'bts-liens__contact bts-liens__contact--' + c.etat);
      b.type = 'button';
      b.appendChild(element('span', 'bts-liens__numero', (i < 9 ? '0' : '') + (i + 1)));
      b.appendChild(document.createTextNode(' ' + c.pseudo));
      if (MOTS[c.etat]) {
        b.appendChild(element('span', 'bts-liens__marque', ' · ' + MOTS[c.etat]));
      } else {
        var coeur = element('span', 'bts-liens__marque', ' ♥');
        coeur.setAttribute('aria-hidden', 'true');
        b.appendChild(coeur);
      }
      ['click', 'mouseenter', 'focus'].forEach(function (evt) {
        b.addEventListener(evt, function () { choisir(i); });
      });
      b.addEventListener('keydown', function (e) {
        var cible = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : null;
        if (cible === null || !boutons[cible]) return;
        e.preventDefault();
        boutons[cible].focus();
      });
      boutons.push(b);
      li.appendChild(b);
      liste.appendChild(li);
    });

    if (contacts.length) {
      ecran.appendChild(liste);
      ecran.appendChild(message);
      choisir(0);
    } else {
      ecran.appendChild(element('p', 'bts-liens__vide', 'Répertoire vide.' + (modifiable ? ' Ajoute un contact ci-dessous.' : '')));
    }
    bipeur.appendChild(ecran);
    var touches = element('div', 'bts-liens__touches');
    touches.setAttribute('aria-hidden', 'true');
    for (var t = 0; t < 3; t++) touches.appendChild(element('span'));
    bipeur.appendChild(touches);
    conteneur.appendChild(bipeur);

    var controle = {};
    if (!modifiable) return controle;

    /* L'édition : une ligne par contact, pseudo et nature. */
    var edition = element('details', 'bts-liens__edition');
    edition.appendChild(element('summary', null, 'Modifier mon répertoire'));
    var lignes = element('div', 'bts-liens__lignes');
    var compteur = 0;

    function ligne(l) {
      var bloc = element('div', 'bts-liens__ligne');
      [['pseudo', 'Pseudo du compte'], ['nature', 'Nature du lien']].forEach(function (champ) {
        var id = 'bts-liens-' + champ[0] + '-' + (++compteur);
        var label = element('label', null, champ[1]);
        label.htmlFor = id;
        var input = document.createElement('input');
        input.type = 'text';
        input.id = id;
        input.name = champ[0];
        input.value = l[champ[0]] || '';
        var groupe = element('div', 'bts-liens__champ');
        groupe.appendChild(label);
        groupe.appendChild(input);
        bloc.appendChild(groupe);
      });
      var retirer = element('button', 'bts-liens__retirer', 'Retirer');
      retirer.type = 'button';
      retirer.addEventListener('click', function () { lignes.removeChild(bloc); });
      bloc.appendChild(retirer);
      lignes.appendChild(bloc);
      return bloc;
    }

    (options.contacts || []).forEach(ligne);
    edition.appendChild(lignes);
    var pied = element('div', 'bts-liens__pied');
    var ajouter = element('button', 'bts-liens__ajouter', 'Ajouter un contact');
    ajouter.type = 'button';
    ajouter.addEventListener('click', function () { ligne({}).querySelector('input').focus(); });
    var enregistrer = element('button', 'bts-liens__enregistrer button1', 'Enregistrer le répertoire');
    enregistrer.type = 'button';
    var statut = element('p', 'bts-liens__statut');
    statut.setAttribute('role', 'status');
    [ajouter, enregistrer, statut].forEach(function (e) { pied.appendChild(e); });
    edition.appendChild(pied);
    edition.appendChild(element('p', 'bts-liens__aide',
      'Un lien s\'affiche quand l\'autre t\'a noté·e aussi. En attendant, toi seul·e le vois. Personne n\'est prévenu d\'un refus.'));
    conteneur.appendChild(edition);

    controle.enregistrer = function () {
      var liens = [].map.call(lignes.querySelectorAll('.bts-liens__ligne'), function (b) {
        return { pseudo: b.querySelector('input[name="pseudo"]').value, nature: b.querySelector('input[name="nature"]').value };
      });
      statut.textContent = 'Enregistrement…';
      enregistrer.disabled = true;
      return Promise.resolve(options.enregistrer(ecrire(liens))).then(function (ok) {
        statut.textContent = ok ? 'Répertoire enregistré. Recharge la page pour voir les liens confirmés.'
          : 'Le répertoire n\'a pas pu être enregistré. Réessaie dans un instant.';
      }, function () {
        statut.textContent = 'Le répertoire n\'a pas pu être enregistré. Réessaie dans un instant.';
      }).then(function () { enregistrer.disabled = false; });
    };
    enregistrer.addEventListener('click', function () { controle.enregistrer(); });
    return controle;
  }

  /* ---------- sur le profil ---------- */

  function demarrer(options) {
    var liens = lire(options.texte);
    var filtre = window.BTSFiltre && window.BTSFiltre.voit;
    return verifier(liens, options.nom).then(function (contacts) {
      /* Les personnes que je filtre ne s'affichent pas sur l'écran (elles restent dans l'édition). */
      return Promise.all(contacts.map(function (c) { return filtre ? window.BTSFiltre.voit(c.pseudo) : true; })).then(function (vus) {
        var masques = contacts.filter(function (c, i) { return !vus[i]; }).map(function (c) { return c.pseudo; });
        var visibles = contacts.filter(function (c, i) { return c.etat === 'ok' && vus[i]; });
        if (!options.modifiable && !visibles.length) return false;
        monter(options.corps, { contacts: contacts, masques: masques, modifiable: options.modifiable, enregistrer: options.enregistrer });
        options.section.hidden = false;
        return true;
      });
    });
  }

  window.BTSLiens = {
    lire: lire, ecrire: ecrire, trouverProfil: trouverProfil, verifier: verifier, monter: monter, demarrer: demarrer,
  };
})(window, document);
