/* Behind the Soul — les scènes à jouer (variante B : le billet de métro).
 * Proposer une scène, ouverte ou sur invitation ; personne n'est obligé de répondre.
 * Dans les deux cas, le formulaire prépare un sujet dans la section « Scènes à jouer », qu'on relit avant d'envoyer.
 * Ouverte : on répond sous le message. Sur invitation : on écrit à l'auteur·ice en MP, qui choisit.
 * Dans le sujet, le premier message devient un billet ; « Ça me tente » prépare la réponse ou le MP.
 * Le message reste lisible sans script : « Lieu : … », « Places : … », etc. */
(function (window, document) {
  'use strict';

  var CLE = 'bts-scene-a-preparer';
  var DUREE = 10 * 60 * 1000;
  var NOTES = {
    ouverte: 'Personne n\'est obligé de répondre. Ça te tente ? Réponds sous ce message ; ne rien faire, c\'est non.',
    invitation: 'Personne n\'est obligé de répondre. Ça te tente ? Écris-moi en MP ; ne rien faire, c\'est non.',
  };
  var PLACES = ['1 personnage', '2 personnages', '2 à 3 personnages', '3 personnages ou plus', 'peu importe'];
  var ACCES = { ouverte: 'ouverte à tout le monde', invitation: 'sur invitation' };
  var ETIQUETTES = { 'Lieu': 'lieu', 'Places': 'places', 'Hors champ': 'horsChamp', 'Qui peut venir': 'acces' };

  /* ---------- le message ---------- */

  function lieux(config) {
    var liste = [];
    ((config && config.quartiers) || []).forEach(function (q) {
      (q.lieux || []).forEach(function (l) { liste.push({ id: l.id, nom: l.nom, quartier: q.nom }); });
    });
    return liste;
  }

  function composer(p, config) {
    var lieu = lieux(config).filter(function (l) { return l.id === p.lieu; })[0];
    var ou = lieu ? lieu.nom + ' · ' + lieu.quartier : (p.lieu || 'à définir ensemble');
    return {
      sujet: String(p.titre || '').trim(),
      message: [
        '[b]Lieu :[/b] ' + ou,
        '[b]Places :[/b] ' + (p.places || 'peu importe'),
        '[b]Hors champ :[/b] ' + (String(p.horsChamp || '').trim() || 'rien de particulier'),
        '[b]Qui peut venir :[/b] ' + (ACCES[p.acces] || ACCES.ouverte),
        '',
        String(p.idee || '').trim(),
        '',
        '[i]' + (NOTES[p.acces] || NOTES.ouverte) + '[/i]',
      ].join('\n'),
    };
  }

  function lignesDe(el) {
    var copie = el.cloneNode(true);
    [].forEach.call(copie.querySelectorAll('br'), function (br) {
      br.parentNode.replaceChild(document.createTextNode('\n'), br);
    });
    return copie.textContent.split('\n').map(function (l) { return l.trim(); });
  }

  /* Retrouve les champs d'une proposition déjà affichée (null si ce n'en est pas une). */
  function lire(el) {
    var lignes = lignesDe(el);
    var p = {};
    var fin = -1;
    lignes.forEach(function (l, i) {
      var m = l.match(/^(Lieu|Places|Hors champ|Qui peut venir)\s*:\s*(.*)$/);
      if (m && p[ETIQUETTES[m[1]]] === undefined) { p[ETIQUETTES[m[1]]] = m[2].trim(); fin = i; }
    });
    if (!p.lieu) return null;
    p.idee = lignes.slice(fin + 1).filter(function (l) { return l.indexOf('Personne n\'est obligé') !== 0; }).join('\n').trim();
    return p;
  }

  /* ---------- préparer, puis préremplir ---------- */

  function memoriser(prep) {
    prep.quand = Date.now();
    try { window.sessionStorage.setItem(CLE, JSON.stringify(prep)); } catch (e) { return false; }
    return true;
  }

  function preremplir(doc) {
    var prep = null;
    try { prep = JSON.parse(window.sessionStorage.getItem(CLE) || 'null'); } catch (e) { prep = null; }
    if (!prep) return false;
    try { window.sessionStorage.removeItem(CLE); } catch (e) { prep.vu = true; }
    if (!prep.quand || Date.now() - prep.quand > DUREE) return false;
    var sujet = doc.getElementById('fal-sujet');
    var zone = doc.getElementById('text_editor_textarea');
    if (!sujet || !zone) return false;
    if (prep.sujet) sujet.value = prep.sujet;
    zone.value = prep.message || '';
    var noms = prep.a || [];
    var premier = doc.querySelector('input[name="username[]"]');
    if (premier && noms.length) {
      premier.value = noms[0];
      var dernier = premier;
      noms.slice(1).forEach(function (n) {
        var autre = premier.cloneNode(false);
        autre.removeAttribute('id');
        autre.value = n;
        dernier.parentNode.insertBefore(autre, dernier.nextSibling);
        dernier = autre;
      });
    }
    /* L'éditeur de Forumactif (SCEditor) se crée après coup : on lui redonne le texte dès qu'il est là. */
    var essais = 0;
    (function editeur() {
      var $ = window.jQuery;
      var instance = $ && $.fn && $.fn.sceditor && $(zone).sceditor('instance');
      if (instance && instance.val) { instance.val(prep.message || ''); return; }
      if (++essais < 30) window.setTimeout(editeur, 100);
    })();
    return true;
  }

  /* ---------- le formulaire ---------- */

  function element(nom, classe, texte) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  var compteur = 0;

  function monterFormulaire(conteneur, o) {
    var uid = 'bts-proposer-' + (++compteur);
    var aller = o.aller || function (u) { window.location.href = u; };
    conteneur.textContent = '';
    var corps = element('div', 'bts-proposer__corps');

    function champ(nom, titre, el) {
      var bloc = element('div', 'bts-proposer__champ bts-proposer__champ--' + nom);
      el.id = uid + '-' + nom;
      el.name = nom;
      var label = element('label', null, titre);
      label.htmlFor = el.id;
      bloc.appendChild(label);
      bloc.appendChild(el);
      return bloc;
    }
    function texte() { var i = document.createElement('input'); i.type = 'text'; return i; }

    var titre = texte();
    var lieu = document.createElement('select');
    lieux(o.config).forEach(function (l) {
      var opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.nom + ' · ' + l.quartier;
      lieu.appendChild(opt);
    });
    var idee = document.createElement('textarea');
    idee.rows = 4;
    var hc = texte();
    hc.placeholder = 'par exemple : violence, sang';
    var places = document.createElement('select');
    PLACES.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      places.appendChild(opt);
    });
    places.value = '2 personnages';

    var deux1 = element('div', 'bts-proposer__deux');
    deux1.appendChild(champ('titre', 'Titre de la scène', titre));
    deux1.appendChild(champ('lieu', 'Lieu (sur la carte)', lieu));
    corps.appendChild(deux1);
    corps.appendChild(champ('idee', 'L\'idée, en quelques lignes', idee));
    var deux2 = element('div', 'bts-proposer__deux');
    deux2.appendChild(champ('hors-champ', 'Ce qui reste hors champ', hc));
    deux2.appendChild(champ('places', 'Places', places));
    corps.appendChild(deux2);

    var acces = element('fieldset', 'bts-proposer__acces');
    acces.appendChild(element('legend', null, 'Qui peut venir'));
    [['ouverte', 'Ouverte à tout le monde (réponses sous le message)'], ['invitation', 'Sur invitation (réponses par MP, tu choisis)']].forEach(function (c, i) {
      var label = element('label', 'bts-proposer__option');
      var r = document.createElement('input');
      r.type = 'radio';
      r.name = 'acces';
      r.value = c[0];
      r.checked = i === 0;
      label.appendChild(r);
      label.appendChild(document.createTextNode(' ' + c[1]));
      acces.appendChild(label);
    });
    corps.appendChild(acces);

    corps.appendChild(element('p', 'bts-proposer__aide',
      'Un sujet est préparé dans « Scènes à jouer », tu le relis avant d\'envoyer. Ouverte : qui est tenté·e répond dessous. Sur invitation : on t\'écrit en MP, et c\'est toi qui choisis.'));
    var envoyer = element('button', 'bts-proposer__envoyer button1', 'Préparer la proposition');
    envoyer.type = 'button';
    var statut = element('p', 'bts-proposer__statut');
    statut.setAttribute('role', 'status');
    corps.appendChild(envoyer);
    corps.appendChild(statut);
    conteneur.appendChild(corps);

    envoyer.addEventListener('click', function () {
      var choix = conteneur.querySelector('input[name="acces"]:checked').value;
      var manque = [];
      if (!titre.value.trim()) manque.push('le titre');
      if (!idee.value.trim()) manque.push('l\'idée');
      if (manque.length) { statut.textContent = 'Il manque ' + manque.join(', ') + '.'; return; }
      var m = composer({ titre: titre.value, lieu: lieu.value, idee: idee.value, horsChamp: hc.value, places: places.value, acces: choix }, o.config);
      memoriser({ sujet: m.sujet, message: m.message, a: [] });
      statut.textContent = 'C\'est préparé. Tu vas pouvoir relire avant d\'envoyer.';
      aller('/post?f=' + o.forum + '&mode=newtopic');
    });
  }

  /* ---------- le billet ---------- */

  function billet(doc, o) {
    var message = doc.querySelector('.fal-message');
    var corps = message && (message.querySelector('.fal-message__texte .content') || message.querySelector('.fal-message__texte'));
    var p = corps && lire(corps);
    if (!p) return false;
    var auteur = message.querySelector('.bts-mini__nom a[href]');
    var id = auteur && (auteur.getAttribute('href').match(/^\/u(\d+)/) || [])[1];
    var titreEl = doc.querySelector('.fal-titre-page__titre a, .fal-titre-page__titre');
    var titre = titreEl ? titreEl.textContent.trim() : '';
    var morceaux = p.lieu.split('·').map(function (x) { return x.trim(); });
    var quartier = morceaux.length > 1 ? morceaux[morceaux.length - 1] : '';

    var b = doc.createElement('article');
    b.className = 'bts-billet';
    var gauche = element('div', 'bts-billet__gauche');
    if (quartier) gauche.appendChild(element('span', 'bts-billet__ligne', quartier));
    gauche.appendChild(element('h2', 'bts-billet__titre', titre));
    gauche.appendChild(element('p', 'bts-billet__meta', morceaux[0] + ' · hors champ : ' + p.horsChamp));
    gauche.appendChild(element('p', 'bts-billet__idee', p.idee));
    var parMP = /invitation/.test(p.acces);
    gauche.appendChild(element('p', 'bts-billet__aide', parMP
      ? 'Sur invitation : personne n\'est obligé de répondre. Ça te tente ? Réponds par MP à l\'auteur·ice, qui choisit ; ne rien faire, c\'est non.'
      : 'Personne n\'est obligé de répondre. Ça te tente ? Réponds sous ce message ; ne rien faire, c\'est non.'));
    var droite = element('div', 'bts-billet__talon');
    droite.appendChild(element('span', 'bts-billet__places', p.places));
    var sujetId = (window.location.pathname.match(/^\/t(\d+)/) || [])[1];
    if (sujetId && id && Number(id) !== Number(o.moi)) {
      var a = element('a', 'bts-billet__tente', 'Ça me tente');
      if (parMP) {
        /* Sur invitation : un MP à l'auteur·ice, déjà commencé, avec le lien de la scène. */
        a.href = '/privmsg?mode=post&u=' + id;
        a.addEventListener('click', function () {
          memoriser({
            sujet: 'Ta scène « ' + titre + ' » me tente',
            message: 'Coucou ! Ta scène « [url=' + window.location.href.split('#')[0] + ']' + titre + '[/url] » me tente.\n\n',
            a: [],
          });
        });
      } else {
        /* Scène ouverte : on répond sous le message ; la réponse arrive déjà commencée. */
        a.href = '/post?t=' + sujetId + '&mode=reply';
        a.addEventListener('click', function () {
          memoriser({ sujet: '', message: 'Ça me tente !\n\n', a: [] });
        });
      }
      droite.appendChild(a);
    } else {
      droite.appendChild(element('span', 'bts-billet__toi', 'ta proposition'));
    }
    droite.appendChild(element('span', 'bts-billet__acces', p.acces));
    b.appendChild(gauche);
    b.appendChild(droite);
    corps.parentNode.insertBefore(b, corps);
    corps.classList.add('bts-billet__brut');
    return true;
  }

  /* ---------- la liste de la section ---------- */

  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function jourDe(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  var MOIS = [['jan', 1], ['fév', 2], ['fev', 2], ['mar', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['juil', 7],
    ['aoû', 8], ['aou', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['déc', 12], ['dec', 12]];

  /* Les dates de Forumactif : « Aujourd'hui à 15:25 », « Hier à 18:40 », « 23/01/2026 », « Jeu 29 Oct 2026 - 18:40 ». */
  function dateDe(texte, jour) {
    var t = String(texte || '').trim().toLowerCase();
    if (/^aujourd/.test(t)) return jour;
    if (/^hier/.test(t)) { var h = jourDe(jour); h.setDate(h.getDate() - 1); return iso(h); }
    var m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) return iso(new Date(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    m = t.match(/(\d{1,2})\s+([a-zéû]+)\.?(?:\s+(\d{4}))?/);
    var mois = m && MOIS.filter(function (x) { return m[2].indexOf(x[0]) === 0; })[0];
    if (mois) return iso(new Date(m[3] ? Number(m[3]) : jourDe(jour).getFullYear(), mois[1] - 1, Number(m[1])));
    return null;
  }

  function dernierMessage(li, jour) {
    var infos = li.querySelector('.lastpost-infos, .fal-sujet__dernier');
    if (!infos) return null;
    var morceaux = infos.innerHTML.split(/<br\s*\/?>/i);
    var tmp = document.createElement('div');
    tmp.innerHTML = morceaux[morceaux.length - 1];
    return dateDe(tmp.textContent, jour);
  }

  function marqueDe(li) {
    var plus = 0;
    [].forEach.call(li.querySelectorAll('a[href*="#"]'), function (a) {
      var m = a.getAttribute('href').match(/#(\d+)\s*$/);
      if (m && +m[1] > plus) plus = +m[1];
    });
    return plus;
  }

  var MEMO = 'bts-scenes-billets-v1';
  function memo() { try { return JSON.parse(window.sessionStorage.getItem(MEMO) || '{}') || {}; } catch (e) { return {}; } }
  function garder(m) { try { window.sessionStorage.setItem(MEMO, JSON.stringify(m)); } catch (e) { return; } }

  function propositionDe(url, marque) {
    var id = (url.match(/^\/t(\d+)/) || [])[1];
    var m = memo();
    if (id && marque && m[id] && m[id].marque === marque) return Promise.resolve(m[id].p);
    return window.fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
      var doc = new window.DOMParser().parseFromString(html, 'text/html');
      var message = doc.querySelector('.fal-message');
      var corps = message && (message.querySelector('.fal-message__texte .content') || message.querySelector('.fal-message__texte'));
      var p = corps ? lire(corps) : null;
      if (id && marque) { m[id] = { marque: marque, p: p }; garder(m); }
      return p;
    }, function () { return null; });
  }

  /* Un billet compact pour la liste : le titre mène à la scène, le talon dit les places et qui peut venir. */
  function billetListe(li, p, titre, url) {
    if (li.querySelector('.bts-billet')) return;
    var morceaux = p.lieu.split('·').map(function (x) { return x.trim(); });
    var quartier = morceaux.length > 1 ? morceaux[morceaux.length - 1] : '';
    var b = element('article', 'bts-billet bts-billet--liste');
    var gauche = element('div', 'bts-billet__gauche');
    if (quartier) gauche.appendChild(element('span', 'bts-billet__ligne', quartier));
    var h = element('h3', 'bts-billet__titre');
    var a = element('a', null, titre);
    a.href = url;
    h.appendChild(a);
    gauche.appendChild(h);
    gauche.appendChild(element('p', 'bts-billet__meta', morceaux[0] + ' · hors champ : ' + p.horsChamp));
    gauche.appendChild(element('p', 'bts-billet__idee', p.idee));
    var droite = element('div', 'bts-billet__talon');
    droite.appendChild(element('span', 'bts-billet__places', p.places));
    droite.appendChild(element('span', 'bts-billet__acces', p.acces));
    b.appendChild(gauche);
    b.appendChild(droite);
    li.appendChild(b);
    li.classList.add('bts-sujet--billet');
  }

  function dessiner(lignes) {
    return Promise.all(lignes.map(function (li) {
      var lien = li.querySelector('a.topictitle, .fal-sujet__titre a');
      if (!lien) return null;
      var url = lien.getAttribute('href').split('#')[0];
      return propositionDe(url, marqueDe(li)).then(function (p) {
        if (p) billetListe(li, p, lien.textContent.trim(), url);
      });
    }));
  }

  /* Les propositions sans message depuis plus d'un mois sont masquées (pas supprimées) ;
     un bouton les remontre, sans compter combien. */
  function liste(doc, o) {
    var jour = (o && o.jour) || iso(new Date());
    var limite = jourDe(jour);
    limite.setMonth(limite.getMonth() - 1);
    limite = iso(limite);
    var visibles = [];
    var anciennes = [];
    [].forEach.call(doc.querySelectorAll('.fal-sujet'), function (li) {
      if (li.hasAttribute('data-fal-postit')) return;
      var d = dernierMessage(li, jour);
      if (d && d < limite) { li.hidden = true; li.classList.add('bts-scene--ancienne'); anciennes.push(li); }
      else visibles.push(li);
    });
    if (anciennes.length && !doc.querySelector('.bts-scenes__anciennes')) {
      var b = element('button', 'bts-scenes__anciennes', 'Voir les propositions plus anciennes');
      b.type = 'button';
      b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', function () {
        var ouvert = b.getAttribute('aria-expanded') === 'true';
        b.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
        b.textContent = ouvert ? 'Voir les propositions plus anciennes' : 'Masquer les propositions plus anciennes';
        anciennes.forEach(function (li) { li.hidden = ouvert; });
        if (!ouvert) dessiner(anciennes);
      });
      var listeEl = anciennes[0].parentNode;
      listeEl.parentNode.insertBefore(b, listeEl.nextSibling);
    }
    return dessiner(visibles);
  }

  /* ---------- sur tout le forum ---------- */

  function demarrer(o) {
    var chemin = window.location.pathname;
    function pret(f) {
      if (document.readyState !== 'loading') f();
      else document.addEventListener('DOMContentLoaded', f);
    }
    pret(function () {
      if (/^\/(post|privmsg)/.test(chemin)) { preremplir(document); return; }
      var u = window._userdata;
      var connecte = u && Number(u.session_logged_in);
      if (new RegExp('^/f' + o.forum + '-').test(chemin)) {
        if (!window.fetch) return;
        liste(document, {});
        if (!connecte) return;
        var tete = document.querySelector('.fal-titre-page');
        if (!tete) return;
        window.fetch(o.config).then(function (r) { return r.json(); }).then(function (config) {
          var volet = document.createElement('details');
          volet.className = 'bts-proposer';
          var resume = element('summary', 'bts-proposer__titre', 'Proposer une scène · personne n\'est obligé de répondre');
          volet.appendChild(resume);
          var dedans = element('div', 'bts-proposer__contenu');
          volet.appendChild(dedans);
          monterFormulaire(dedans, { config: config, forum: o.forum });
          tete.parentNode.insertBefore(volet, tete.nextSibling);
        }).catch(function () { return false; });
        return;
      }
      if (/^\/t\d+/.test(chemin) && document.querySelector('.fal-fil a[href^="/f' + o.forum + '-"]')) {
        billet(document, { moi: connecte ? u.user_id : 0 });
      }
    });
  }

  window.BTSScenes = {
    lieux: lieux, composer: composer, lire: lire, preremplir: preremplir,
    monterFormulaire: monterFormulaire, billet: billet, dateDe: dateDe, liste: liste, demarrer: demarrer,
  };
})(window, document);
