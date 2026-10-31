/* Behind the Soul — « À toi de jouer ».
 * Un petit bouton dans le quai : la liste privée des RP (sections de la carte) où quelqu'un a posté après toi.
 * Un point s'allume s'il y a quelque chose, jamais de chiffre ; la liste ne nomme personne et ne relance pas.
 * Les données viennent de la recherche Forumactif (sujets où j'ai posté), au plus toutes les 10 minutes. */
(function (window, document) {
  'use strict';

  var CLE = 'bts-tour-v1';
  var DUREE = 10 * 60 * 1000;
  var compteur = 0;

  function nettoie(t) { return String(t || '').trim().toLowerCase(); }
  function texte(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

  function forumsDeLaCarte(config) {
    var ids = [];
    ((config && config.quartiers) || []).forEach(function (q) {
      ids.push(String(q.forum));
      (q.lieux || []).forEach(function (l) { ids.push(String(l.forum)); });
    });
    return ids;
  }

  /* Les résultats de recherche « sujets » : titre, lieu, dernier posteur et date, sections de la carte seulement. */
  function lire(doc, forums) {
    var liste = [];
    [].forEach.call(doc.querySelectorAll('a.topictitle'), function (a) {
      var ligne = a.closest('li, tr, .row');
      if (!ligne) return;
      var lieu = [].filter.call(ligne.querySelectorAll('a[href]'), function (x) { return /^\/f\d+-/.test(x.getAttribute('href')); })[0];
      var forum = lieu && lieu.getAttribute('href').match(/^\/f(\d+)-/)[1];
      if (!forum || forums.indexOf(forum) === -1) return;
      var dernier = ligne.querySelector('.lastpost');
      var posteur = dernier && dernier.querySelector('a[href^="/u"]');
      var vers = dernier && [].filter.call(dernier.querySelectorAll('a[href*="#"]'), function (x) { return /^\/t\d+/.test(x.getAttribute('href')); })[0];
      var morceaux = dernier ? dernier.innerHTML.split(/<br\s*\/?>/i) : [];
      var tmp = document.createElement('div');
      tmp.innerHTML = morceaux.length > 1 ? morceaux[morceaux.length - 1] : '';
      liste.push({
        titre: texte(a), url: vers ? vers.getAttribute('href') : a.getAttribute('href'),
        lieu: texte(lieu), dernier: texte(posteur), date: texte(tmp),
      });
    });
    return liste;
  }

  function aToi(liste, moi) {
    return liste.filter(function (x) { return x.dernier && nettoie(x.dernier) !== nettoie(moi) && !/^\s*\[Termin[ée]e\]/i.test(x.titre); });
  }

  /* ---------- le bouton et la liste ---------- */

  function element(nom, classe, contenu) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (contenu != null) e.textContent = contenu;
    return e;
  }

  function monter(conteneur, liste) {
    var ancien = conteneur.querySelector('.bts-tour');
    if (ancien) ancien.parentNode.removeChild(ancien);
    var id = 'bts-tour-liste-' + (++compteur);
    var bloc = element('div', 'bts-tour');
    var b = element('button', 'bts-tour__bouton', 'À toi');
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', id);
    b.setAttribute('aria-label', liste.length ? 'À toi de jouer : des RP t\'attendent' : 'À toi de jouer : rien en attente');
    b.title = 'À toi de jouer';
    if (liste.length) {
      var point = element('span', 'bts-tour__point');
      point.setAttribute('aria-hidden', 'true');
      b.appendChild(point);
    }
    var panneau = element('div', 'bts-tour__liste');
    panneau.id = id;
    panneau.hidden = true;
    panneau.appendChild(element('p', 'bts-tour__titre', 'À toi de jouer'));
    if (liste.length) {
      var ul = element('ul');
      liste.forEach(function (x) {
        var li = element('li');
        var a = element('a', null, x.titre);
        a.href = x.url;
        li.appendChild(a);
        li.appendChild(element('span', 'bts-tour__meta', [x.lieu, x.date].filter(Boolean).join(' · ')));
        ul.appendChild(li);
      });
      panneau.appendChild(ul);
    } else {
      panneau.appendChild(element('p', 'bts-tour__vide', 'Rien en attente.'));
    }
    panneau.appendChild(element('p', 'bts-tour__aide', 'Pas de pression : réponds quand tu peux.'));

    function ouvrir(oui) {
      panneau.hidden = !oui;
      b.setAttribute('aria-expanded', oui ? 'true' : 'false');
    }
    b.addEventListener('click', function () { ouvrir(panneau.hidden); });
    panneau.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { ouvrir(false); b.focus(); }
    });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') ouvrir(false);
    });
    bloc.appendChild(b);
    bloc.appendChild(panneau);
    conteneur.insertBefore(bloc, conteneur.firstChild);
    return bloc;
  }

  /* ---------- tout le forum ---------- */

  function memoire(valeur) {
    try {
      if (valeur === undefined) return JSON.parse(window.sessionStorage.getItem(CLE) || 'null');
      window.sessionStorage.setItem(CLE, JSON.stringify(valeur));
    } catch (e) { return null; }
    return null;
  }

  function demarrer(o) {
    var u = window._userdata;
    var conteneur = document.getElementById('fal-compte');
    if (!u || !Number(u.session_logged_in) || !conteneur || !window.fetch) return Promise.resolve(false);
    var moi = u.username;
    var forums = o.forums || forumsDeLaCarte(o.config);
    var connu = memoire();
    if (connu && connu.moi === moi && Date.now() - connu.quand < DUREE) {
      monter(conteneur, connu.liste);
      return Promise.resolve(true);
    }
    var url = '/search?search_keywords=&search_terms=any&search_author=' + encodeURIComponent(moi) +
      '&search_where=-1&search_time=0&show_results=topics&sort_by=0&sort_dir=DESC';
    return window.fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).then(function (html) {
      var doc = new window.DOMParser().parseFromString(html, 'text/html');
      var liste = aToi(lire(doc, forums), moi);
      memoire({ moi: moi, quand: Date.now(), liste: liste });
      monter(conteneur, liste);
      return true;
    }, function () { return false; });
  }

  window.BTSTour = { lire: lire, aToi: aToi, monter: monter, demarrer: demarrer };
})(window, document);
