/*!
 * Carte interactive de Behind the Soul — accueil du forum.
 *
 * Un quartier (arrondissement) est un forum ; chacun de ses lieux, dessiné comme
 * une station, est un sous-forum. Au chargement, la carte lit la page de chaque
 * quartier : la liste de ses sous-forums donne, pour chaque lieu, son dernier
 * sujet et le numéro de son dernier message. Les lectures partent avec la
 * session du visiteur : chacun ne voit que ce à quoi il a accès.
 *
 * « Nouveau » = un dernier message dont le numéro dépasse le plus grand déjà vu
 * pour ce lieu. Ce repère est gardé dans le navigateur du visiteur.
 *
 * Licence MIT.
 */

(function (window, document) {
  'use strict';

  var VERSION = '0.2.0';
  var CLE = 'bts-carte-vus';
  var CLE_VUE = 'bts-carte-vue';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var NB_SUJETS = 6;
  var ZOOM_MAX = 3;

  function texteDe(noeud) {
    return noeud ? noeud.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function element(nom, classe, contenu) {
    var el = document.createElement(nom);
    if (classe) el.className = classe;
    if (contenu != null) el.textContent = contenu;
    return el;
  }

  function lien(texte, href, classe) {
    var a = element('a', classe, texte);
    a.setAttribute('href', href);
    return a;
  }

  function bouton(texte, classe) {
    var b = element('button', classe, texte);
    b.type = 'button';
    return b;
  }

  function lieuxAvecDuNouveau(n) {
    return n === 1 ? '1 lieu avec du nouveau' : n + ' lieux avec du nouveau';
  }

  /* ---------- lecture des pages ---------- */

  function analyser(html) {
    return new window.DOMParser().parseFromString(html || '', 'text/html');
  }

  function estInterdit(doc) {
    return /^\s*connexion\s*$/i.test(doc.title || '') || !!doc.querySelector('input[type="password"]');
  }

  /* Le plus grand « #123 » des liens d'un bloc : le dernier message, et son adresse. */
  function dernierMessage(bloc, repli) {
    var ordre = 0, url = repli || '';
    if (!bloc) return { ordre: ordre, url: url };
    [].forEach.call(bloc.querySelectorAll('a[href*="#"]'), function (a) {
      var h = a.getAttribute('href');
      var m = h.match(/#(\d+)\s*$/);
      if (m && +m[1] > ordre) { ordre = +m[1]; url = h; }
    });
    return { ordre: ordre, url: url };
  }

  /* Posteur (lien de profil) et date (le morceau qui porte une heure), quel que soit
     l'ordre dans lequel Forumactif les écrit autour de ses <br>. */
  function posteurEtDate(bloc) {
    if (!bloc) return { posteur: '', date: '' };
    var profil = [].filter.call(bloc.querySelectorAll('a[href]'), function (l) {
      return /\/u\d+/.test(l.getAttribute('href')) && texteDe(l);
    })[0];
    var date = '';
    bloc.innerHTML.split(/<br\s*\/?>/i).forEach(function (morceau) {
      var bout = document.createElement('div');
      bout.innerHTML = morceau;
      var t = texteDe(bout);
      if (/\d{1,2}\s*:\s*\d{2}/.test(t) && !bout.querySelector('a[href*="/u"]')) date = t;
    });
    return { posteur: texteDe(profil), date: date };
  }

  function lireSection(html) {
    var doc = analyser(html);
    if (estInterdit(doc)) return { interdit: true, sujets: [] };
    var sujets = [];
    [].forEach.call(doc.querySelectorAll('a.topictitle'), function (a) {
      var href = a.getAttribute('href') || '';
      var id = (href.match(/\/t(\d+)/) || [])[1];
      if (!id) return;
      var ligne = a.closest('li, tr, .row') || a.parentNode;
      var dernier = dernierMessage(ligne, href);
      var infos = posteurEtDate(ligne.querySelector('.lastpost-infos, .lastpost'));
      sujets.push({ id: id, titre: texteDe(a), url: dernier.url, ordre: dernier.ordre, posteur: infos.posteur, date: infos.date });
    });
    return { interdit: false, sujets: sujets };
  }

  function lireQuartier(html) {
    var doc = analyser(html);
    if (estInterdit(doc)) return { interdit: true, lieux: [] };
    var lieux = [];
    [].forEach.call(doc.querySelectorAll('a.forumtitle'), function (a) {
      var forum = +((a.getAttribute('href') || '').match(/\/f(\d+)-/) || [])[1];
      if (!forum) return;
      var ligne = a.closest('li, tr, .row') || a.parentNode;
      var bloc = ligne.querySelector('.lastpost-infos, .lastpost');
      var titreSujet = bloc && bloc.querySelector('.fal-forum__dernier-sujet, a[href^="/t"]:not([href*="#"])');
      var dernier = dernierMessage(bloc);
      var infos = posteurEtDate(bloc);
      lieux.push({
        forum: forum, nom: texteDe(a), sujet: texteDe(titreSujet),
        url: dernier.url, ordre: dernier.ordre, posteur: infos.posteur, date: infos.date,
      });
    });
    return { interdit: false, lieux: lieux };
  }

  function compterNouveaux(sujets, vu) {
    if (vu == null) return 0;
    return sujets.filter(function (s) { return s.ordre > vu; }).length;
  }

  function plusGrand(sujets) {
    return sujets.reduce(function (max, s) { return Math.max(max, s.ordre); }, 0);
  }

  /* ---------- mémoire du visiteur (peut être refusée par le navigateur) ---------- */

  function lireVus(stockage) {
    try {
      var brut = stockage && stockage.getItem(CLE);
      return brut ? JSON.parse(brut) : {};
    } catch (e) {
      return {};
    }
  }

  function ecrireVus(stockage, vus) {
    try {
      if (stockage) stockage.setItem(CLE, JSON.stringify(vus));
    } catch (e) { void e; }
  }

  function stockageParDefaut() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  /* ---------- montage ---------- */

  function monter(options) {
    var recuperer = options.fetch || window.fetch.bind(window);
    var lire = function (forum) {
      return recuperer('/f' + forum + '-', { credentials: 'same-origin' })
        .then(function (rep) { return rep.ok ? rep.text() : ''; });
    };
    var config = options.config;

    return Promise.all(config.quartiers.map(function (q) {
      return lire(q.forum).then(lireQuartier).catch(function () { return { erreur: true, lieux: [] }; });
    })).then(function (pages) {
      return construire({
        conteneur: options.conteneur,
        config: config,
        pages: pages,
        lire: lire,
        stockage: 'stockage' in options ? options.stockage : stockageParDefaut(),
        ecran: options.matchMedia || (window.matchMedia && window.matchMedia.bind(window)),
        animation: options.animation !== false,
      });
    });
  }

  /* La vue « jeu » : les quartiers configurés, avec une marge. */
  function vueDuJeu(svg, config) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    config.quartiers.forEach(function (q) {
      var chemin = svg.querySelector('path.gu[data-gu="' + q.gu + '"]');
      var boite = chemin && chemin.getAttribute('data-bbox');
      if (!boite) return;
      var b = boite.split(' ').map(Number);
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[0] + b[2]); y1 = Math.max(y1, b[1] + b[3]);
    });
    if (!isFinite(x0)) return null;
    var marge = 24;
    return [x0 - marge, y0 - marge, x1 - x0 + 2 * marge, y1 - y0 + 2 * marge].map(function (v) { return v.toFixed(1); }).join(' ');
  }

  function activable(cible, action) {
    cible.setAttribute('role', 'button');
    cible.setAttribute('tabindex', '0');
    cible.addEventListener('click', function () { action(cible); });
    cible.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(cible); }
    });
  }

  function construire(o) {
    var conteneur = o.conteneur, config = o.config, stockage = o.stockage;
    var svg = conteneur.querySelector('svg');
    var calqueBadges = svg.querySelector('.bts-badges');
    var controle = { attente: Promise.resolve() };

    /* Ce que dit la page de chaque quartier, et de chaque lieu (par numéro de sous-forum). */
    var quartiers = config.quartiers.map(function (q, i) {
      return { q: q, page: o.pages[i], chemin: svg.querySelector('path.gu[data-gu="' + q.gu + '"]') };
    });
    var infos = {};
    quartiers.forEach(function (e) {
      e.page.lieux.forEach(function (l) { infos[l.forum] = l; });
    });

    /* Un lieu jamais vu (première visite, ou ajouté depuis) part de son état actuel. */
    var vus = lireVus(stockage);
    Object.keys(infos).forEach(function (forum) {
      if (!(forum in vus)) vus[forum] = infos[forum].ordre;
    });
    ecrireVus(stockage, vus);

    function estNouveau(lieu) {
      var info = infos[lieu.forum];
      return !!info && vus[lieu.forum] != null && info.ordre > vus[lieu.forum];
    }

    function nouveauxDe(e) {
      return e.q.lieux.filter(estNouveau).length;
    }

    function marquerVu(forum, ordre) {
      vus[forum] = Math.max(vus[forum] || 0, ordre || 0);
      ecrireVus(stockage, vus);
    }

    /* ---------- barre, liste, colonne de droite ---------- */

    conteneur.classList.add('bts-carte');

    var barre = element('div', 'bts-carte__barre');
    var bascule = bouton('Voir en liste', 'bts-carte__bascule');
    bascule.setAttribute('aria-pressed', 'false');
    bascule.setAttribute('aria-controls', 'bts-carte-liste');
    var cadre = bouton('Voir tout Séoul', 'bts-carte__cadre');
    cadre.setAttribute('aria-pressed', 'false');
    var annonce = element('p', 'bts-carte__annonce');
    annonce.setAttribute('aria-live', 'polite');
    barre.appendChild(bascule);
    barre.appendChild(cadre);
    barre.appendChild(annonce);
    conteneur.insertBefore(barre, svg);

    var liste = element('ul', 'bts-carte__liste');
    liste.id = 'bts-carte-liste';
    liste.hidden = true;
    conteneur.appendChild(liste);

    var bulle = element('div', 'bts-carte__bulle');
    bulle.setAttribute('aria-hidden', 'true');
    bulle.hidden = true;
    conteneur.appendChild(bulle);

    /* La colonne de droite ne disparaît jamais : la légende quand rien n'est ouvert,
       le panneau sinon. La carte garde ainsi la même taille. */
    var accueil = element('aside', 'bts-carte__accueil');
    accueil.appendChild(element('h2', null, 'Séoul, 2001'));
    accueil.appendChild(element('p', null, 'Choisis un quartier ou une station sur la carte pour voir ses lieux et ses derniers RP.'));
    accueil.appendChild(element('h3', null, 'Territoires'));
    var legende = element('ul', 'bts-legende');
    var dejaVues = [];
    [].forEach.call(svg.querySelectorAll('.territoire'), function (t) {
      var id = t.getAttribute('data-faction');
      if (dejaVues.indexOf(id) !== -1) return;
      dejaVues.push(id);
      var li = element('li');
      var echantillon = document.createElementNS(SVGNS, 'svg');
      echantillon.setAttribute('width', '40');
      echantillon.setAttribute('height', '24');
      echantillon.setAttribute('aria-hidden', 'true');
      /* Les tramages se mesurent en cases de carte : on les montre à la même échelle que la carte. */
      var groupe = document.createElementNS(SVGNS, 'g');
      groupe.setAttribute('transform', 'scale(2)');
      var rect = document.createElementNS(SVGNS, 'rect');
      rect.setAttribute('width', '20');
      rect.setAttribute('height', '12');
      rect.setAttribute('fill', 'url(#motif-' + id + ')');
      groupe.appendChild(rect);
      echantillon.appendChild(groupe);
      li.appendChild(echantillon);
      li.appendChild(document.createTextNode(t.getAttribute('data-nom-faction')));
      legende.appendChild(li);
    });
    accueil.appendChild(legende);
    conteneur.appendChild(accueil);

    var panneau = element('section', 'bts-carte__panneau');
    panneau.setAttribute('aria-labelledby', 'bts-panneau-titre');
    panneau.hidden = true;
    conteneur.appendChild(panneau);

    var declencheur = null;

    function factionsDe(gu) {
      var noms = [];
      [].forEach.call(svg.querySelectorAll('.territoire[data-gu="' + gu + '"]'), function (t) {
        var nom = t.getAttribute('data-nom-faction');
        if (nom && noms.indexOf(nom) === -1) noms.push(nom);
      });
      return noms;
    }

    /* ---------- quartiers et stations ---------- */

    var stations = [];
    quartiers.forEach(function (e) {
      var b = bouton('', 'bts-carte__quartier');
      b.dataset.gu = e.q.gu;
      b.addEventListener('click', function () { ouvrirQuartier(e, b); });
      var li = element('li');
      li.appendChild(b);
      liste.appendChild(li);
      e.bouton = b;

      if (e.chemin) {
        e.chemin.classList.add('gu--actif');
        activable(e.chemin, function (cible) { ouvrirQuartier(e, cible); });
        e.chemin.addEventListener('mouseenter', function () { bulleQuartier(e); });
        e.chemin.addEventListener('focus', function () { bulleQuartier(e); });
        e.chemin.addEventListener('mouseleave', cacherBulle);
        e.chemin.addEventListener('blur', cacherBulle);
      }

      e.q.lieux.forEach(function (lieu) {
        var g = svg.querySelector('g.lieu[data-lieu="' + lieu.id + '"]');
        if (!g) return;
        var s = { lieu: lieu, quartier: e, g: g };
        stations.push(s);
        activable(g, function (cible) { ouvrirLieu(s, cible); });
        g.addEventListener('mouseenter', function () { bulleLieu(s); });
        g.addEventListener('focus', function () { bulleLieu(s); });
        g.addEventListener('mouseleave', cacherBulle);
        g.addEventListener('blur', cacherBulle);
      });
    });

    function majQuartier(e) {
      var n = nouveauxDe(e);
      var resume = e.q.nom + ', ' + (n ? lieuxAvecDuNouveau(n) : 'rien de nouveau');
      e.bouton.textContent = resume;
      if (!e.chemin) return;
      e.chemin.setAttribute('aria-label', resume);
      e.chemin.classList.toggle('gu--nouveau', n > 0);

      var ancien = calqueBadges.querySelector('.bts-badge[data-gu="' + e.q.gu + '"]');
      if (ancien) ancien.parentNode.removeChild(ancien);
      if (!n) return;
      /* Juste au-dessus de la plaque du nom, qui est centrée sur le quartier. */
      var badge = document.createElementNS(SVGNS, 'g');
      badge.setAttribute('class', 'bts-badge');
      badge.setAttribute('data-gu', e.q.gu);
      badge.setAttribute('aria-hidden', 'true');
      badge.setAttribute('transform', 'translate(' + e.chemin.getAttribute('data-cx') + ' ' + (+e.chemin.getAttribute('data-cy') - 30) + ')');
      var carre = document.createElementNS(SVGNS, 'rect');
      carre.setAttribute('x', '-11');
      carre.setAttribute('y', '-11');
      carre.setAttribute('width', '22');
      carre.setAttribute('height', '22');
      var chiffre = document.createElementNS(SVGNS, 'text');
      chiffre.setAttribute('text-anchor', 'middle');
      chiffre.setAttribute('dominant-baseline', 'central');
      chiffre.textContent = String(n);
      badge.appendChild(carre);
      badge.appendChild(chiffre);
      calqueBadges.appendChild(badge);
    }

    function majStation(s) {
      var nouveau = estNouveau(s.lieu);
      s.g.classList.toggle('lieu--nouveau', nouveau);
      s.g.setAttribute('aria-label', s.lieu.nom + ', ' + s.quartier.q.nom + (nouveau ? ', nouveau message' : ''));
    }

    function majTout() {
      quartiers.forEach(majQuartier);
      stations.forEach(majStation);
      var avecNouveaux = quartiers.filter(function (e) { return nouveauxDe(e) > 0; });
      annonce.textContent = avecNouveaux.length
        ? 'Du nouveau : ' + avecNouveaux.map(function (e) { return e.q.nom + ' (' + nouveauxDe(e) + ')'; }).join(', ') + '.'
        : '';
    }

    /* ---------- infobulle (doublon visuel des libellés) ---------- */

    function placerBulle(cible) {
      var c = conteneur.getBoundingClientRect();
      var z = cible.getBoundingClientRect();
      bulle.style.left = Math.round(z.left - c.left + z.width / 2) + 'px';
      bulle.style.top = Math.round(z.top - c.top) + 'px';
      bulle.hidden = false;
    }

    function bulleQuartier(e) {
      var n = nouveauxDe(e);
      bulle.textContent = '';
      bulle.appendChild(element('strong', null, e.q.nom));
      bulle.appendChild(element('span', null, n ? lieuxAvecDuNouveau(n) : 'Rien de nouveau'));
      placerBulle(e.chemin);
    }

    function bulleLieu(s) {
      var info = infos[s.lieu.forum];
      bulle.textContent = '';
      bulle.appendChild(element('strong', null, s.lieu.nom));
      if (estNouveau(s.lieu)) bulle.appendChild(element('span', null, 'Nouveau message'));
      if (info && info.sujet) bulle.appendChild(element('span', 'bts-carte__bulle-sujet', info.sujet));
      placerBulle(s.g);
    }

    function cacherBulle() { bulle.hidden = true; }

    /* ---------- panneau ---------- */

    /* L'en-tête est un bandeau de station : nom en latin, nom en coréen, bouton de fermeture. */
    function entetePanneau(titreTexte, nomKo) {
      cacherBulle();
      panneau.textContent = '';
      var entete = element('header', 'bts-carte__entete bts-station');
      var noms = element('div', 'bts-station__noms');
      var titre = element('h2', null, titreTexte);
      titre.id = 'bts-panneau-titre';
      titre.tabIndex = -1;
      noms.appendChild(titre);
      if (nomKo) {
        var ko = element('span', null, nomKo);
        ko.setAttribute('lang', 'ko');
        noms.appendChild(ko);
      }
      var fermer = bouton('×', 'bts-carte__fermer');
      fermer.setAttribute('aria-label', 'Fermer le panneau');
      fermer.addEventListener('click', fermerPanneau);
      entete.appendChild(noms);
      entete.appendChild(fermer);
      panneau.appendChild(entete);
      return titre;
    }

    function montrer(titre, gu) {
      accueil.hidden = true;
      panneau.hidden = false;
      zoomerSur(gu);
      titre.focus();
    }

    function ouvrirQuartier(e, origine) {
      if (origine) declencheur = origine;
      var q = e.q;
      var titre = entetePanneau(q.nom, q.nomKo);

      var factions = factionsDe(q.gu);
      panneau.appendChild(element('p', 'bts-carte__factions',
        factions.length ? 'Territoire de : ' + factions.join(', ') + '.' : 'Aucune faction ne contrôle ce quartier.'));
      var entrer = element('p', 'bts-carte__entrer');
      entrer.appendChild(lien('Entrer dans le quartier', '/f' + q.forum + '-'));
      panneau.appendChild(entrer);

      panneau.appendChild(element('h3', null, 'Lieux'));
      if (e.page.interdit) {
        panneau.appendChild(element('p', 'bts-carte__vide', 'Ce quartier est réservé aux membres connectés.'));
      } else {
        var ul = element('ul', 'bts-carte__lieux');
        q.lieux.forEach(function (lieu) {
          var info = infos[lieu.forum];
          var nouveau = estNouveau(lieu);
          var li = element('li', 'bts-lieu' + (nouveau ? ' bts-lieu--nouveau' : ''));
          li.dataset.lieu = lieu.id;
          var b = bouton(lieu.nom, 'bts-lieu__nom');
          var s = stations.filter(function (x) { return x.lieu === lieu; })[0] || { lieu: lieu, quartier: e };
          b.addEventListener('click', function () { ouvrirLieu(s); });
          li.appendChild(b);
          if (nouveau) li.appendChild(element('strong', 'bts-sujet__nouveau', 'nouveau'));
          if (info && info.sujet) {
            var dernier = element('span', 'bts-lieu__dernier');
            dernier.appendChild(lien(info.sujet, info.url || '/f' + lieu.forum + '-'));
            var meta = [info.posteur, info.date].filter(Boolean).join(' · ');
            if (meta) dernier.appendChild(document.createTextNode(' · ' + meta));
            /* Le filtre (forum/filtre/filtre.js) retire les lignes des personnes filtrées. */
            if (info.posteur) dernier.setAttribute('data-bts-auteur', info.posteur);
            li.appendChild(dernier);
          } else {
            li.appendChild(element('span', 'bts-lieu__dernier', 'Pas encore de RP'));
          }
          ul.appendChild(li);
        });
        panneau.appendChild(ul);
      }

      /* Ce qui vient d'être montré est désormais vu. */
      q.lieux.forEach(function (lieu) {
        if (infos[lieu.forum]) marquerVu(lieu.forum, infos[lieu.forum].ordre);
      });
      majTout();
      montrer(titre, q.gu);
    }

    function ouvrirLieu(s, origine) {
      if (origine) declencheur = origine;
      var lieu = s.lieu, e = s.quartier;
      var titre = entetePanneau(lieu.nom, lieu.nomKo);
      panneau.appendChild(element('p', 'bts-carte__factions', 'Quartier : ' + e.q.nom));
      var retour = bouton('Retour à ' + e.q.nom, 'bts-carte__retour');
      retour.addEventListener('click', function () { ouvrirQuartier(e); });
      panneau.appendChild(retour);
      var entrer = element('p', 'bts-carte__entrer');
      entrer.appendChild(lien('Entrer dans le lieu', '/f' + lieu.forum + '-'));
      panneau.appendChild(entrer);
      panneau.appendChild(element('h3', null, 'Derniers RP'));
      var zone = element('div', 'bts-carte__rp');
      zone.setAttribute('aria-busy', 'true');
      zone.appendChild(element('p', 'bts-carte__vide', 'Chargement…'));
      panneau.appendChild(zone);
      montrer(titre, e.q.gu);

      var vuAvant = vus[lieu.forum];
      controle.attente = o.lire(lieu.forum).then(lireSection).catch(function () {
        return { erreur: true, sujets: [] };
      }).then(function (section) {
        zone.textContent = '';
        zone.removeAttribute('aria-busy');
        if (section.interdit) {
          zone.appendChild(element('p', 'bts-carte__vide', 'Ce lieu est réservé aux membres connectés.'));
        } else if (!section.sujets.length) {
          zone.appendChild(element('p', 'bts-carte__vide', 'Aucun RP pour l\'instant.'));
        } else {
          var ul = element('ul', 'bts-carte__sujets');
          section.sujets.slice().sort(function (a, b) { return b.ordre - a.ordre; }).slice(0, NB_SUJETS).forEach(function (sujet) {
            var nouveau = vuAvant != null && sujet.ordre > vuAvant;
            var li = element('li', 'bts-sujet' + (nouveau ? ' bts-sujet--nouveau' : ''));
            li.appendChild(lien(sujet.titre, sujet.url));
            if (nouveau) li.appendChild(element('strong', 'bts-sujet__nouveau', 'nouveau'));
            var meta = [sujet.posteur, sujet.date].filter(Boolean).join(' · ');
            if (meta) li.appendChild(element('span', 'bts-sujet__meta', meta));
            if (sujet.posteur) li.setAttribute('data-bts-auteur', sujet.posteur);
            ul.appendChild(li);
          });
          zone.appendChild(ul);
        }
        var info = infos[lieu.forum];
        if (!section.interdit && !section.erreur) marquerVu(lieu.forum, Math.max(plusGrand(section.sujets), info ? info.ordre : 0));
        majTout();
      });
      return controle.attente;
    }

    function fermerPanneau() {
      dezoomer();
      panneau.hidden = true;
      accueil.hidden = false;
      if (declencheur) declencheur.focus();
    }

    panneau.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fermerPanneau();
    });

    /* Sur le forum, la liste, ce sont les vrais forums des quartiers (la catégorie que la carte
       masque) ; sans eux, la liste de boutons du plan. */
    bascule.addEventListener('click', function () {
      var enListe = !conteneur.classList.contains('bts-carte--liste');
      mettreEnListe(enListe);
      /* Le choix reste dans le navigateur pour la prochaine visite. */
      try {
        if (stockage) stockage.setItem(CLE_VUE, enListe ? 'liste' : 'carte');
      } catch (e) { void e; }
    });

    function mettreEnListe(enListe) {
      var categories = document.querySelectorAll('.bts-categorie--sur-la-carte');
      [].forEach.call(categories, function (c) {
        c.hidden = !enListe;
        c.classList.toggle('bts-categorie--en-liste', enListe);
      });
      liste.hidden = !enListe || categories.length > 0;
      conteneur.classList.toggle('bts-carte--liste', enListe);
      bascule.setAttribute('aria-pressed', String(enListe));
      bascule.textContent = enListe ? 'Voir la carte' : 'Voir en liste';
    }

    /* ---------- cadrage téléphone ---------- */

    /* Sur téléphone, la ville entière rend tout illisible : on recadre sur le jeu,
       et « Voir tout Séoul » laisse revenir à la ville entière. */
    var vueComplete = svg.getAttribute('viewBox');
    var vueJeu = vueDuJeu(svg, config);
    var etroit = o.ecran ? o.ecran('(max-width: 640px)') : null;
    var toutVoir = false;

    function petitEcran() {
      return !!(etroit && etroit.matches && vueJeu);
    }

    function vueDeBase() {
      return petitEcran() && !toutVoir ? vueJeu : vueComplete;
    }

    function cadrer() {
      var zoom = petitEcran() && !toutVoir;
      if (!guZoom) appliquerVue(vueDeBase());
      conteneur.classList.toggle('bts-carte--zoom', zoom);
      cadre.hidden = !petitEcran();
      cadre.setAttribute('aria-pressed', String(toutVoir));
    }

    /* ---------- zoom sur un quartier ouvert ---------- */

    /* La carte garde sa taille : seul le cadre (viewBox) change. --bts-echelle dit à la feuille
       de combien on a zoomé, pour garder les textes à une taille lisible. Les pixels, eux,
       grossissent avec le zoom : c'est voulu. */
    var largeurComplete = Number(vueComplete.split(' ')[2]);
    var guZoom = null;
    var tour = 0;
    var animer = o.animation && !!window.requestAnimationFrame &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function appliquerVue(v) {
      var valeurs = typeof v === 'string' ? v.split(' ').map(Number) : v;
      svg.setAttribute('viewBox', valeurs.map(function (n) { return String(Math.round(n * 10) / 10); }).join(' '));
      var echelle = (valeurs[2] / largeurComplete).toFixed(3);
      conteneur.style.setProperty('--bts-echelle', echelle);
    }

    function allerVers(v) {
      var cible = v.split(' ').map(Number);
      var mon = ++tour;
      if (!animer) { appliquerVue(cible); return; }
      var depart = svg.getAttribute('viewBox').split(' ').map(Number);
      var debut = null, duree = 380;
      /* Un onglet en arrière-plan ne dessine plus d'images : la vue finale arrive quand même. */
      window.setTimeout(function () { if (mon === tour) { tour++; appliquerVue(cible); } }, duree + 80);
      window.requestAnimationFrame(function etape(t) {
        if (mon !== tour) return;
        if (debut === null) debut = t;
        var p = Math.min(1, (t - debut) / duree);
        var doux = 1 - Math.pow(1 - p, 3);
        appliquerVue(depart.map(function (d, i) { return d + (cible[i] - d) * doux; }));
        if (p < 1) window.requestAnimationFrame(etape);
      });
    }

    /* Part de la largeur de la carte cachée à gauche par l'encart posé dessus (grand écran).
       Sous la carte (téléphone), il ne cache rien. */
    function recouvrement() {
      if (panneau.hidden) return 0;
      var c = svg.getBoundingClientRect(), p = panneau.getBoundingClientRect();
      if (!c.width || p.top >= c.bottom || p.left > c.left + c.width / 2) return 0;
      return Math.max(0, Math.min(0.6, (p.right + 16 - c.left) / c.width));
    }

    function vueDuQuartier(gu) {
      var chemin = svg.querySelector('path.gu[data-gu="' + gu + '"]');
      var b = chemin.getAttribute('data-bbox').split(' ').map(Number);
      var marge = Math.max(b[2], b[3]) * 0.15 + 12;
      var cache = recouvrement();
      /* Le quartier doit tenir dans la partie visible, à droite de l'encart. */
      var l = (b[2] + 2 * marge) / (1 - cache), h = b[3] + 2 * marge;
      /* Mêmes proportions que la vue de départ : la carte, dont la hauteur suit son cadre,
         garde ainsi exactement sa taille. On élargit le côté trop court, autour du centre. */
      var base = vueDeBase().split(' ').map(Number);
      var rapport = base[2] / base[3];
      if (l / h < rapport) l = h * rapport; else h = l / rapport;
      /* Pas plus de ×3 : au-delà, les pixels de la ville deviennent des pavés illisibles. */
      if (l < base[2] / ZOOM_MAX) { l = base[2] / ZOOM_MAX; h = l / rapport; }
      var cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2;
      return [cx - l * (1 + cache) / 2, cy - h / 2, l, h].join(' ');
    }

    function zoomerSur(gu) {
      if (!gu) return;
      guZoom = gu;
      conteneur.classList.add('bts-carte--quartier');
      allerVers(vueDuQuartier(gu));
    }

    function dezoomer() {
      guZoom = null;
      conteneur.classList.remove('bts-carte--quartier');
      allerVers(vueDeBase());
    }

    cadre.addEventListener('click', function () {
      toutVoir = !toutVoir;
      cadrer();
    });
    if (etroit) {
      if (etroit.addEventListener) etroit.addEventListener('change', cadrer);
      else if (etroit.addListener) etroit.addListener(cadrer);
    }

    cadrer();
    majTout();

    var vueRetenue = null;
    try { vueRetenue = stockage && stockage.getItem(CLE_VUE); } catch (e) { void e; }
    if (vueRetenue === 'liste') mettreEnListe(true);
    controle.mettreEnListe = mettreEnListe;

    controle.ouvrir = function (gu) {
      var e = quartiers.filter(function (x) { return x.q.gu === gu; })[0];
      if (e) ouvrirQuartier(e, e.chemin || e.bouton);
    };
    controle.fermer = fermerPanneau;
    return controle;
  }

  /* ---------- sur le forum ---------- */

  /* Une catégorie de l'accueil dont toutes les sections sont des quartiers est déjà sur la carte :
     on la masque. Les autres (hors-jeu, ou mêlées) restent. */
  function masquerQuartiersEnDouble(config, cible) {
    var quartiers = config.quartiers.map(function (q) { return String(q.forum); });
    var masquees = [];
    [].forEach.call(document.querySelectorAll('.fal-categorie, .forabg'), function (categorie) {
      var sections = categorie.querySelectorAll('.fal-forum[data-lien], li.row[data-lien]');
      var toutes = sections.length > 0 && [].every.call(sections, function (s) {
        var id = (s.getAttribute('data-lien').match(/\/f(\d+)-/) || [])[1];
        return quartiers.indexOf(id) !== -1;
      });
      if (toutes) {
        categorie.hidden = true;
        categorie.classList.add('bts-categorie--sur-la-carte');
        if (!categorie.id) categorie.id = 'bts-quartiers-' + (masquees.length + 1);
        masquees.push(categorie.id);
      }
    });
    /* Le plan prend la place de la première d'entre elles : les catégories d'avant
       (hors-jeu, administration) restent au-dessus. */
    var premiere = masquees.length && document.getElementById(masquees[0]);
    var bloc = cible && (cible.closest('.bts-accueil') || cible);
    if (premiere && bloc && !bloc.contains(premiere)) premiere.parentNode.insertBefore(bloc, premiere);
    /* « Voir en liste » montre ces catégories-là. */
    var bascule = cible && cible.querySelector('.bts-carte__bascule');
    if (bascule && masquees.length) bascule.setAttribute('aria-controls', masquees.join(' '));
  }

  /* <div id="bts-carte" data-carte="adresse du SVG"> et window.BTS_CARTE_CONFIG : on charge le plan,
     on le monte, puis on retire les catégories en double. Si le plan ne vient pas, l'accueil
     garde toutes ses catégories, et on le dit. */
  function demarrer(options) {
    options = options || {};
    var cible = options.conteneur || document.getElementById('bts-carte');
    var config = options.config || window.BTS_CARTE_CONFIG;
    if (!cible || !config) return Promise.resolve(null);
    var recuperer = options.fetch || window.fetch.bind(window);

    var plan = cible.querySelector('svg') ? Promise.resolve() : recuperer(cible.getAttribute('data-carte'))
      .then(function (rep) {
        if (!rep.ok) throw new Error('plan introuvable');
        return rep.text();
      })
      .then(function (svg) { cible.innerHTML = svg; });

    return plan.then(function () {
      var reglages = { conteneur: cible, config: config };
      ['fetch', 'stockage', 'matchMedia', 'animation'].forEach(function (cle) {
        if (cle in options) reglages[cle] = options[cle];
      });
      return monter(reglages);
    }).then(function (carte) {
      masquerQuartiersEnDouble(config, cible);
      /* En liste depuis la dernière visite : les catégories qu'on vient de masquer reviennent. */
      if (carte && cible.classList.contains('bts-carte--liste')) carte.mettreEnListe(true);
      return carte;
    }).catch(function () {
      cible.textContent = '';
      cible.appendChild(element('p', 'bts-carte__erreur',
        'Le plan n\'a pas pu se charger. Les quartiers restent accessibles dans la liste ci-dessous.'));
      return null;
    }).then(function (carte) {
      /* À sa place (ou avec son message d'erreur) : le bloc peut se montrer. */
      var bloc = cible.closest('.bts-accueil');
      if (bloc) bloc.classList.add('bts-accueil--pret');
      return carte;
    });
  }

  window.BTSCarte = {
    VERSION: VERSION, lireSection: lireSection, lireQuartier: lireQuartier,
    compterNouveaux: compterNouveaux, monter: monter, demarrer: demarrer,
  };

  if (document.getElementById('bts-carte') && window.BTS_CARTE_CONFIG) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { demarrer(); });
    else demarrer();
  }
})(window, document);
