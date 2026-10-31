/* Behind the Soul — le tableau de scène.
 * En tête d'un sujet RP (une section de quartier ou de lieu de la carte), une fenêtre repliable croise les
 * fiches de préférences de tous les auteurs du sujet : pour chaque thème, la réponse la plus stricte.
 * Le tableau ne dit jamais qui a répondu quoi. Réservé aux membres connectés, comme les fiches.
 * Dépend de preferences.js (window.BTSPreferences). */
(function (window, document) {
  'use strict';

  var COLONNES = [
    { id: 'non', titre: 'non', signe: '✕' },
    { id: 'hc', titre: 'hors champ', signe: '◐' },
    { id: 'ok', titre: 'ok', signe: '✓' },
  ];
  var NOTE = 'Certaines fiches ne sont pas remplies : demandez avant d\'aborder un thème « pas indiqué ».';

  function chemin(href) {
    try { return new URL(href, window.location.href).pathname; } catch (e) { return ''; }
  }

  function forumsDeLaCarte(config) {
    var ids = [];
    (config.quartiers || []).forEach(function (q) {
      ids.push(String(q.forum));
      (q.lieux || []).forEach(function (l) { ids.push(String(l.forum)); });
    });
    /* Les ondes (SMS, chatrooms) sont des RP, même hors de la carte. */
    ((config && config.ondes) || []).forEach(function (o) { ids.push(String(o.forum)); });
    return ids;
  }

  function estUneScene(liens, config) {
    var ids = forumsDeLaCarte(config);
    return liens.some(function (href) {
      var m = chemin(href).match(/^\/f(\d+)-/);
      return !!m && ids.indexOf(m[1]) !== -1;
    });
  }

  function uniques(liste) {
    return liste.filter(function (x, i) { return x && liste.indexOf(x) === i; });
  }

  function participants(doc) {
    return uniques([].map.call(doc.querySelectorAll('.bts-mini__nom a[href]'), function (a) {
      var p = chemin(a.getAttribute('href'));
      return /^\/u\d+/.test(p) ? p : '';
    }));
  }

  function pages(doc) {
    var ici = window.location.pathname;
    return uniques([].map.call(doc.querySelectorAll('.pagination a[href]'), function (a) {
      var p = chemin(a.getAttribute('href'));
      return /^\/t\d+(p\d+)?-/.test(p) && p !== ici ? p : '';
    }));
  }

  function ficheDuProfil(doc) {
    var champ = [].filter.call(doc.querySelectorAll('dl[id^="field_id"]'), function (dl) {
      var dt = dl.querySelector('dt');
      return dt && /^Préférences RP/i.test(dt.textContent.trim());
    })[0];
    var valeur = champ && champ.querySelector('.field_uneditable');
    if (!valeur) return null;
    var copie = valeur.cloneNode(true);
    [].forEach.call(copie.querySelectorAll('br'), function (br) {
      br.parentNode.replaceChild(doc.createTextNode('\n'), br);
    });
    return copie.textContent.replace(/\n\n/g, '\n');
  }

  /* ---------- l'affichage ---------- */

  function element(nom, classe, texte) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  function monter(conteneur, fiches) {
    var P = window.BTSPreferences;
    var remplies = fiches.filter(function (f) { return Object.keys(f.themes || {}).length > 0; });
    conteneur.textContent = '';
    var fenetre = element('details', 'bts-scene');
    fenetre.appendChild(element('summary', 'bts-scene__titre', 'Cette scène · ce qui se joue, hors champ, ou pas'));
    conteneur.appendChild(fenetre);

    if (!remplies.length) {
      fenetre.appendChild(element('p', 'bts-scene__note',
        'Personne dans cette scène n\'a encore rempli sa fiche de préférences : demandez avant d\'aborder un thème sensible.'));
      return fenetre;
    }

    var niveaux = P.comparer(remplies);
    if (!niveaux['violences-sexuelles'] || niveaux['violences-sexuelles'] === 'ok') niveaux['violences-sexuelles'] = 'hc';

    var colonnes = element('div', 'bts-scene__colonnes');
    COLONNES.forEach(function (c) {
      var col = element('div', 'bts-scene__colonne bts-scene__colonne--' + c.id);
      var titre = element('h3', 'bts-scene__niveau');
      var signe = element('span', 'bts-scene__signe', c.signe);
      signe.setAttribute('aria-hidden', 'true');
      titre.appendChild(signe);
      titre.appendChild(document.createTextNode(' ' + c.titre));
      col.appendChild(titre);
      var themes = P.THEMES.filter(function (t) { return niveaux[t.id] === c.id; });
      if (themes.length) {
        var liste = element('ul', 'bts-scene__themes');
        themes.forEach(function (t) { liste.appendChild(element('li', null, t.nom)); });
        col.appendChild(liste);
      } else {
        col.appendChild(element('p', 'bts-scene__aucun', 'aucun thème'));
      }
      colonnes.appendChild(col);
    });
    fenetre.appendChild(colonnes);

    var vides = P.THEMES.filter(function (t) { return !niveaux[t.id]; });
    if (vides.length) {
      fenetre.appendChild(element('p', 'bts-scene__vide',
        'Pas indiqué : ' + vides.map(function (t) { return t.nom; }).join(', ') + '.'));
    }
    if (remplies.length < fiches.length) fenetre.appendChild(element('p', 'bts-scene__note', NOTE));
    return fenetre;
  }

  /* ---------- tout le parcours ---------- */

  function lirePage(url) {
    return window.fetch(url, { credentials: 'same-origin' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).then(function (html) {
      return new window.DOMParser().parseFromString(html, 'text/html');
    }, function () { return null; });
  }

  function demarrer(options) {
    var place = document.querySelector('.bts-scene-place');
    var connecte = window._userdata && Number(window._userdata.session_logged_in);
    var fil = [].map.call(document.querySelectorAll('.fal-fil a[href]'), function (a) { return a.getAttribute('href'); });
    if (!place || !connecte || !window.BTSPreferences || !estUneScene(fil, options.config)) return Promise.resolve(false);

    return Promise.all(pages(document).map(lirePage)).then(function (autres) {
      var qui = participants(document);
      autres.forEach(function (doc) { if (doc) qui = uniques(qui.concat(participants(doc))); });
      return Promise.all(qui.map(function (u) {
        return lirePage(u).then(function (doc) {
          return window.BTSPreferences.lire(doc ? ficheDuProfil(doc) : '');
        });
      }));
    }).then(function (fiches) {
      if (!fiches.length) return false;
      monter(place, fiches);
      place.hidden = false;
      return true;
    });
  }

  window.BTSScene = {
    estUneScene: estUneScene, participants: participants, pages: pages,
    ficheDuProfil: ficheDuProfil, monter: monter, demarrer: demarrer,
  };
})(window, document);
