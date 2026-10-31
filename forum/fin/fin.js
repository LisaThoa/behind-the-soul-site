/* Behind the Soul — « Scène terminée ».
 * Dans un RP (un lieu de la carte), l'auteur·ice ou le staff clique « Scène terminée » : le titre prend
 * « [Terminée] » (l'édition du premier message s'ouvre préremplie, on valide soi-même).
 * Dès qu'un compte staff passe sur le forum, au plus toutes les 10 minutes, son navigateur met les scènes
 * marquées à la Corbeille (l'action « corbeille » de Forumactif, réservée au staff). */
(function (window, document) {
  'use strict';

  var CLE_TITRE = 'bts-fin-titre';
  var CLE_RANGE = 'bts-fin-range';
  var DUREE = 10 * 60 * 1000;
  var MARQUE = '[Terminée] ';

  function estMarquee(titre) { return /^\s*\[Termin[ée]e\]/i.test(String(titre || '')); }

  function forumsDeLaCarte(config) {
    var ids = [];
    ((config && config.quartiers) || []).forEach(function (q) {
      ids.push(String(q.forum));
      (q.lieux || []).forEach(function (l) { ids.push(String(l.forum)); });
    });
    /* Les ondes (SMS, chatrooms) sont des RP, même hors de la carte. */
    ((config && config.ondes) || []).forEach(function (o) { ids.push(String(o.forum)); });
    return ids;
  }

  function dansUnRP(doc, forums) {
    return [].some.call(doc.querySelectorAll('.fal-fil a[href]'), function (a) {
      var m = a.getAttribute('href').match(/^\/f(\d+)-/);
      return !!m && forums.indexOf(m[1]) !== -1;
    });
  }

  /* ---------- le bouton, dans le sujet ---------- */

  function bouton(doc, o) {
    var actions = doc.querySelector('.fal-titre-page .fal-actions, .fal-actions');
    var titreEl = doc.querySelector('.fal-titre-page__titre a, .fal-titre-page__titre');
    var premier = doc.querySelector('.fal-message[id^="p"]');
    if (!actions || !titreEl || !premier || doc.querySelector('.bts-fin__bouton')) return false;
    var titre = titreEl.textContent.trim();
    if (estMarquee(titre) || !dansUnRP(doc, o.forums)) return false;
    var auteur = premier.querySelector('.bts-mini__nom a[href]');
    var id = auteur && (auteur.getAttribute('href').match(/^\/u(\d+)/) || [])[1];
    if (!o.staff && Number(id) !== Number(o.moi)) return false;
    var confirmer = o.confirmer || function (m) { return window.confirm(m); };
    var aller = o.aller || function (u) { window.location.href = u; };
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'bts-fin__bouton fal-bouton fal-bouton--discret';
    b.textContent = 'Scène terminée';
    b.title = 'Marquer la scène comme terminée : elle sera rangée dans la Corbeille.';
    b.addEventListener('click', function () {
      if (!confirmer('Marquer « ' + titre + ' » comme terminée ? Le titre prendra « [Terminée] » et la scène sera rangée dans la Corbeille.')) return;
      try { window.sessionStorage.setItem(CLE_TITRE, JSON.stringify({ titre: MARQUE + titre, quand: Date.now() })); } catch (e) { return; }
      aller('/post?p=' + premier.id.substring(1) + '&mode=editpost');
    });
    actions.appendChild(b);
    return true;
  }

  /* ---------- l'édition : seul le titre change ---------- */

  function preremplir(doc) {
    var prep = null;
    try { prep = JSON.parse(window.sessionStorage.getItem(CLE_TITRE) || 'null'); window.sessionStorage.removeItem(CLE_TITRE); } catch (e) { prep = null; }
    if (!prep || !prep.quand || Date.now() - prep.quand > DUREE) return false;
    var sujet = doc.getElementById('fal-sujet');
    if (!sujet) return false;
    sujet.value = prep.titre;
    return true;
  }

  /* ---------- le rangement, côté staff ---------- */

  function aRanger(doc, forums) {
    var ids = [];
    [].forEach.call(doc.querySelectorAll('a.topictitle'), function (a) {
      if (!estMarquee(a.textContent)) return;
      var ligne = a.closest('li, tr, .row') || a.parentNode;
      var lieu = [].filter.call(ligne.querySelectorAll('a[href]'), function (x) { return /^\/f\d+-/.test(x.getAttribute('href')); })[0];
      var forum = lieu && lieu.getAttribute('href').match(/^\/f(\d+)-/)[1];
      var id = (a.getAttribute('href').match(/^\/t(\d+)/) || [])[1];
      if (id && forum && forums.indexOf(forum) !== -1 && ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }

  function memo(valeur) {
    try {
      if (valeur === undefined) return Number(window.localStorage.getItem(CLE_RANGE) || 0);
      window.localStorage.setItem(CLE_RANGE, String(valeur));
    } catch (e) { return 0; }
    return 0;
  }

  function ranger(o) {
    if (!o.staff || !window.fetch) return Promise.resolve(0);
    if (Date.now() - memo() < DUREE) return Promise.resolve(0);
    memo(Date.now());
    var lien = document.querySelector('a[href*="logout"][href*="tid="]');
    var tid = lien && (lien.getAttribute('href').match(/tid=([^&]+)/) || [])[1];
    if (!tid) return Promise.resolve(0);
    var url = '/search?search_keywords=' + encodeURIComponent('Terminée') +
      '&search_terms=any&search_author=&search_where=-1&search_time=0&show_results=topics&sort_by=0&sort_dir=DESC';
    return window.fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
      var ids = aRanger(new window.DOMParser().parseFromString(html, 'text/html'), o.forums);
      /* Une scène à la fois : l'action « corbeille » de Forumactif agit dès l'ouverture de l'adresse. */
      return ids.reduce(function (p, id) {
        return p.then(function () { return window.fetch('/modcp?mode=trash&t=' + id + '&tid=' + tid, { credentials: 'same-origin' }); });
      }, Promise.resolve()).then(function () { return ids.length; });
    }, function () { return 0; });
  }

  /* ---------- sur tout le forum ---------- */

  function demarrer(o) {
    var u = window._userdata;
    if (!u || !Number(u.session_logged_in)) return;
    var chemin = window.location.pathname;
    var forums = o.forums || forumsDeLaCarte(o.config);
    var staff = Number(u.user_level) > 0;
    if (/^\/post/.test(chemin) && /mode=editpost/.test(window.location.search)) preremplir(document);
    if (/^\/t\d+/.test(chemin)) bouton(document, { moi: u.user_id, staff: staff, forums: forums });
    ranger({ staff: staff, forums: forums });
  }

  window.BTSFin = { estMarquee: estMarquee, bouton: bouton, preremplir: preremplir, aRanger: aRanger, ranger: ranger, demarrer: demarrer };
})(window, document);
