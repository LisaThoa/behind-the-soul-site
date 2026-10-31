/* Behind the Soul — le filtre : bloquer des gens, ou ne voir que des gens choisis.
 * Une personne, c'est tous ses comptes, d'après le bottin tenu par le staff (page HTML, <pre id="bts-bottin">,
 * une ligne « nom (staff) : compte, compte »). Le staff n'est jamais filtré, soi-même non plus.
 * Effet au choix : replier (une ligne « masqué », dépliable) ou cacher (rien ne reste). La personne filtrée
 * n'en sait rien. Le champ de profil « Filtre » ne garde que des empreintes, comme les envies. */
(function (window, document) {
  'use strict';

  var CACHE = 'bts-filtre-v1';

  /* ---------- le bottin ---------- */

  function nettoie(texte) {
    return String(texte || '').trim().toLowerCase();
  }

  function lireBottin(texte) {
    var personnes = [];
    String(texte || '').split(/\r?\n/).forEach(function (ligne) {
      var brute = ligne.trim();
      if (!brute || brute.charAt(0) === '#') return;
      var i = brute.indexOf(':');
      if (i === -1) return;
      var tete = brute.slice(0, i).trim();
      var staff = /\(staff\)/i.test(tete);
      var nom = tete.replace(/\(staff\)/i, '').trim();
      var comptes = brute.slice(i + 1).split(',').map(function (c) { return c.trim(); }).filter(Boolean);
      if (nom && comptes.length) personnes.push({ nom: nom, staff: staff, comptes: comptes });
    });
    return personnes;
  }

  function personneDe(bottin, pseudo) {
    var p = bottin.filter(function (x) {
      return x.comptes.some(function (c) { return nettoie(c) === nettoie(pseudo); });
    })[0];
    if (p) return { cle: 'p:' + nettoie(p.nom), nom: p.nom, staff: p.staff, comptes: p.comptes.slice() };
    return { cle: 'c:' + nettoie(pseudo), nom: String(pseudo).trim(), staff: false, comptes: [String(pseudo).trim()] };
  }

  /* ---------- le champ « Filtre » ---------- */

  function lire(texte) {
    var f = { mode: 'tous', effet: 'replier', bloques: [], choisis: [] };
    var liste = null;
    String(texte || '').split(/\r?\n/).forEach(function (ligne) {
      var brute = ligne.trim();
      var m = brute.match(/^(mode|effet)\s*:\s*(\S+)$/);
      if (m && m[1] === 'mode' && (m[2] === 'tous' || m[2] === 'choisis')) f.mode = m[2];
      else if (m && m[1] === 'effet' && (m[2] === 'replier' || m[2] === 'cacher')) f.effet = m[2];
      else if (brute === '[bloqués]') liste = 'bloques';
      else if (brute === '[choisis]') liste = 'choisis';
      else if (liste && /^[0-9a-f]{16}$/.test(brute) && f[liste].indexOf(brute) === -1) f[liste].push(brute);
    });
    return f;
  }

  function ecrire(f) {
    return ['[filtre]', 'mode : ' + f.mode, 'effet : ' + f.effet, '[bloqués]'].concat(f.bloques, ['[choisis]'], f.choisis).join('\n');
  }

  function jeton(moi, cle) {
    var octets = new window.TextEncoder().encode('bts-filtre|' + moi + '|' + cle);
    return window.crypto.subtle.digest('SHA-256', octets).then(function (h) {
      return [].map.call(new Uint8Array(h).slice(0, 8), function (o) {
        return (o < 16 ? '0' : '') + o.toString(16);
      }).join('');
    });
  }

  function decision(f, moi, personneMoi, personne) {
    if (personne.staff || (personneMoi && personne.cle === personneMoi.cle)) return Promise.resolve('voir');
    return jeton(moi, personne.cle).then(function (j) {
      if (f.mode === 'choisis') return f.choisis.indexOf(j) !== -1 ? 'voir' : f.effet;
      return f.bloques.indexOf(j) !== -1 ? f.effet : 'voir';
    });
  }

  /* ---------- sur les pages ---------- */

  /* Où un nom peut apparaître. « toujours » : là, filtrer veut dire retirer, sans ligne « masqué »
     (une liste de connectés ou un dernier message qui dirait « masqué » trahirait la personne). */
  var CIBLES = [
    { selecteur: '.fal-message', auteurs: '.bts-mini__nom a', mot: 'Message masqué' },
    { selecteur: '.fal-sujet', auteurs: '.fal-sujet__auteur a, .fal-sujet__dernier a[href^="/u"]', mot: 'Sujet masqué', sujet: true },
    { selecteur: 'blockquote', citation: true, mot: 'Citation masquée' },
    { selecteur: '.fal-forum__dernier', auteurs: 'a[href^="/u"]', toujours: 'cacher', sujet: true },
    { selecteur: '.fal-liste a[href^="/u"]', soi: true, toujours: 'cacher' },
    { selecteur: '[data-bts-auteur]', attribut: 'data-bts-auteur', toujours: 'cacher', sujet: true },
  ];
  var FORCE = { voir: 0, replier: 1, cacher: 2 };
  var deciderActuel = null;
  var demarre = false;
  var signalerPret = null;
  var decideurPret = new Promise(function (r) { signalerPret = r; });

  /* Pour les autres modules (liens, envies) : est-ce que je vois cette personne ?
     Sans filtre lancé, oui ; filtre lancé, on attend sa décision (4 s au plus). */
  function voit(pseudo) {
    if (!deciderActuel && !demarre) return Promise.resolve(true);
    var attente = new Promise(function (r) { window.setTimeout(function () { r(null); }, 4000); });
    return Promise.race([decideurPret, attente]).then(function () {
      return deciderActuel ? deciderActuel(pseudo).then(function (d) { return d === 'voir'; }) : true;
    });
  }

  function remettre(doc) {
    [].forEach.call(doc.querySelectorAll('[data-bts-vu]'), function (e) { e.removeAttribute('data-bts-vu'); });
    [].forEach.call(doc.querySelectorAll('[data-bts-filtre]'), function (e) {
      e.removeAttribute('data-bts-filtre');
      e.classList.remove('bts-filtre--replie');
      e.classList.remove('bts-filtre-verif');
      e.hidden = false;
      var b = e.querySelector(':scope > .bts-filtre__deplier');
      if (b) b.parentNode.removeChild(b);
    });
  }

  function replier(e, mot) {
    var b = doc_(e).createElement('button');
    b.type = 'button';
    b.className = 'bts-filtre__deplier';
    b.setAttribute('aria-expanded', 'false');
    b.textContent = mot + ' par ton filtre · afficher';
    b.addEventListener('click', function () {
      var ouvert = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
      b.textContent = mot + (ouvert ? ' par ton filtre · afficher' : ' par ton filtre · replier');
      e.classList.toggle('bts-filtre--replie', ouvert);
    });
    e.classList.add('bts-filtre--replie');
    e.insertBefore(b, e.firstChild);
  }

  function doc_(e) { return e.ownerDocument || document; }

  /* Dans une liste « a, b, c », la virgule d'un nom retiré part avec lui. */
  function virgule(a) {
    var apres = a.nextSibling;
    var avant = a.previousSibling;
    var cible = apres && apres.nodeType === 3 && /^\s*,/.test(apres.nodeValue) ? apres
      : avant && avant.nodeType === 3 && /,\s*$/.test(avant.nodeValue) && !(apres && apres.nodeType === 1 && apres.tagName === 'A') ? avant : null;
    if (!cible) return;
    var span = doc_(a).createElement('span');
    span.className = 'bts-filtre__sep';
    var m = cible === apres ? cible.nodeValue.match(/^(\s*,\s*)([\s\S]*)$/) : cible.nodeValue.match(/^([\s\S]*?)(,\s*)$/);
    if (cible === apres) {
      span.textContent = m[1];
      cible.nodeValue = m[2];
      a.parentNode.insertBefore(span, cible);
    } else {
      span.textContent = m[2];
      cible.nodeValue = m[1];
      a.parentNode.insertBefore(span, a);
    }
    span.setAttribute('data-bts-filtre', 'cacher');
    span.setAttribute('data-bts-vu', '1');
  }

  /* ---------- les participants d'un sujet (au milieu d'un RP) ---------- */

  var SUJETS = 'bts-filtre-sujets-v1';
  var memoSujets = null;
  var enCours = 0;
  var fileAttente = [];

  /* Au plus quatre lectures à la fois : le forum reste léger. */
  function limiter(tache) {
    return new Promise(function (resoudre) {
      function lancer() {
        enCours++;
        tache().then(function (r) { enCours--; resoudre(r); suivant(); }, function () { enCours--; resoudre(null); suivant(); });
      }
      if (enCours < 4) lancer(); else fileAttente.push(lancer);
    });
  }
  function suivant() { if (fileAttente.length && enCours < 4) fileAttente.shift()(); }

  function memo() {
    if (memoSujets) return memoSujets;
    try { memoSujets = JSON.parse(window.sessionStorage.getItem(SUJETS) || '{}') || {}; } catch (e) { memoSujets = {}; }
    return memoSujets;
  }
  function garder() {
    try { window.sessionStorage.setItem(SUJETS, JSON.stringify(memoSujets)); } catch (e) { return; }
  }

  function chemin(href) {
    try { return new URL(href, window.location.href).pathname; } catch (e) { return ''; }
  }

  /* Le sujet nommé par un élément : sa première page, et le plus grand « #123 » (son dernier message connu). */
  function sujetDe(e) {
    var url = '';
    var marque = 0;
    [].forEach.call(e.querySelectorAll('a[href]'), function (a) {
      var h = a.getAttribute('href');
      var p = chemin(h);
      if (!url && /^\/t\d+(p\d+)?-/.test(p)) url = p.replace(/^\/t(\d+)p\d+-/, '/t$1-');
      var m = h.match(/#(\d+)\s*$/);
      if (m && +m[1] > marque) marque = +m[1];
    });
    return url ? { id: url.match(/^\/t(\d+)/)[1], url: url, marque: marque } : null;
  }

  function nomsDe(doc) {
    return [].map.call(doc.querySelectorAll('.bts-mini__nom a'), function (a) { return a.textContent.trim(); }).filter(Boolean);
  }

  function lireParticipants(url) {
    return limiter(function () { return page(url); }).then(function (doc) {
      if (!doc) return null;
      var autres = [];
      [].forEach.call(doc.querySelectorAll('.pagination a[href]'), function (a) {
        var p = chemin(a.getAttribute('href'));
        if (/^\/t\d+(p\d+)?-/.test(p) && p !== url && autres.indexOf(p) === -1) autres.push(p);
      });
      return Promise.all(autres.map(function (u) { return limiter(function () { return page(u); }); })).then(function (docs) {
        var noms = [];
        [doc].concat(docs).forEach(function (d) {
          if (d) nomsDe(d).forEach(function (n) { if (noms.indexOf(n) === -1) noms.push(n); });
        });
        return noms;
      });
    });
  }

  /* Un sujet déjà lu n'est relu que s'il a un nouveau message. */
  function participantsDe(sujet) {
    var m = memo();
    var connu = m[sujet.id];
    if (connu && sujet.marque && connu.marque === sujet.marque) return Promise.resolve(connu.noms);
    return lireParticipants(sujet.url).then(function (noms) {
      if (noms && sujet.marque) {
        m[sujet.id] = { marque: sujet.marque, noms: noms };
        garder();
      }
      return noms || [];
    });
  }

  /* ---------- décider, puis appliquer ---------- */

  var optionsActuelles = {};

  function pire(a, b) { return FORCE[b] > FORCE[a] ? b : a; }

  function poser(x, d) {
    x.e.classList.remove('bts-filtre-verif');
    if (d === 'voir') return;
    if (x.c.toujours) d = x.c.toujours;
    x.e.setAttribute('data-bts-filtre', d);
    if (d === 'cacher') {
      x.e.hidden = true;
      if (x.c.soi) virgule(x.e);
    } else replier(x.e, x.c.mot);
  }

  function traiter(doc) {
    var decider = deciderActuel;
    if (!decider) return Promise.resolve();
    var elements = [];
    CIBLES.forEach(function (c) {
      [].forEach.call(doc.querySelectorAll(c.selecteur), function (e) {
        if (e.hasAttribute('data-bts-vu')) return;
        var noms = [];
        if (c.attribut) noms.push(e.getAttribute(c.attribut));
        else if (c.soi) noms.push(e.textContent);
        else if (c.citation) {
          /* « Kang Min a écrit : » — une citation sans auteur n'est pas touchée. */
          var cite = e.querySelector('cite');
          var m = cite && cite.textContent.match(/^\s*(.+?)\s+a\s+écrit/i);
          if (m) noms.push(m[1]);
        }
        else [].forEach.call(e.querySelectorAll(c.auteurs), function (a) { noms.push(a.textContent); });
        noms = noms.map(function (n) { return String(n || '').trim(); }).filter(Boolean);
        e.setAttribute('data-bts-vu', '1');
        var sujet = optionsActuelles.participants && c.sujet ? sujetDe(e) : null;
        if (noms.length || sujet) elements.push({ e: e, noms: noms, c: c, sujet: sujet });
      });
    });
    function decide(noms) {
      return Promise.all(noms.map(function (n) { return decider(n); })).then(function (choix) {
        return choix.reduce(function (d, c) { return pire(d, c || 'voir'); }, 'voir');
      });
    }
    return Promise.all(elements.map(function (x) {
      return decide(x.noms).then(function (d) {
        if (d === 'cacher' || !x.sujet) { poser(x, d); return null; }
        /* L'élément attend, invisible, qu'on ait lu qui joue dans ce sujet (8 s au plus). */
        x.e.classList.add('bts-filtre-verif');
        window.setTimeout(function () { x.e.classList.remove('bts-filtre-verif'); }, 8000);
        return function () {
          return participantsDe(x.sujet).then(decide).then(function (d2) { poser(x, pire(d, d2)); });
        };
      });
    })).then(function (suites) {
      doc.documentElement.classList.remove('bts-filtre-attente');
      return Promise.all(suites.filter(Boolean).map(function (f) { return f(); }));
    });
  }

  function appliquer(doc, decider, options) {
    remettre(doc);
    deciderActuel = decider;
    signalerPret(true);
    optionsActuelles = options || {};
    return traiter(doc).then(function () {
      doc.documentElement.classList.remove('bts-filtre-attente');
    }, function () {
      doc.documentElement.classList.remove('bts-filtre-attente');
    });
  }

  /* Ce qui arrive après coup (le plan de la carte, chargé à la demande) passe aussi par le filtre. */
  var observateur = null;
  function surveiller(doc) {
    if (observateur || !window.MutationObserver) return;
    var prevu = false;
    observateur = new window.MutationObserver(function () {
      if (prevu) return;
      prevu = true;
      window.setTimeout(function () { prevu = false; traiter(doc); }, 0);
    });
    observateur.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
  }

  /* ---------- lire les pages du forum ---------- */

  function page(url) {
    return window.fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).then(function (html) {
      return new window.DOMParser().parseFromString(html, 'text/html');
    }, function () { return null; });
  }

  function champ(doc) {
    return [].filter.call(doc.querySelectorAll('dl[id^="field_id"]'), function (dl) {
      var dt = dl.querySelector('dt');
      return dt && /^Filtre\b/i.test(dt.textContent.trim());
    })[0] || null;
  }

  function texteDu(dl) {
    var zone = dl && dl.querySelector('.field_editable textarea');
    if (zone) return zone.value;
    var valeur = dl && dl.querySelector('.field_uneditable');
    if (!valeur) return '';
    var copie = valeur.cloneNode(true);
    [].forEach.call(copie.querySelectorAll('br'), function (br) {
      br.parentNode.replaceChild(document.createTextNode('\n'), br);
    });
    return copie.textContent;
  }

  function bottinDe(url) {
    return page(url).then(function (doc) {
      var pre = doc && doc.getElementById('bts-bottin');
      return pre ? pre.textContent : '';
    });
  }

  function membres() {
    return page('/memberlist').then(function (doc) {
      if (!doc) return [];
      var vus = {};
      var liste = [];
      [].forEach.call(doc.querySelectorAll('a[href]'), function (a) {
        var m = a.getAttribute('href').match(/^\/u(\d+)$/);
        if (!m || vus[m[1]] || !a.textContent.trim()) return;
        vus[m[1]] = true;
        liste.push(a.textContent.trim());
      });
      return liste;
    });
  }

  /* ---------- les réglages ---------- */

  function element(nom, classe, texte) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  function texteBouton(mode, dedans) {
    if (mode === 'choisis') return dedans ? 'Retirer de mes gens choisis' : 'Ajouter à mes gens choisis';
    return dedans ? 'Ne plus filtrer cette personne' : 'Filtrer cette personne';
  }

  function monterChez(conteneur, o) {
    conteneur.textContent = '';
    var dedans = !!o.filtre;
    var b = element('button', 'bts-filtre__basculer', texteBouton(o.mode, dedans));
    b.type = 'button';
    b.setAttribute('aria-pressed', dedans ? 'true' : 'false');
    var statut = element('p', 'bts-filtre__statut');
    statut.setAttribute('role', 'status');
    b.addEventListener('click', function () {
      var voulu = !dedans;
      b.disabled = true;
      statut.textContent = 'Enregistrement…';
      Promise.resolve(o.basculer(voulu)).then(function (ok) { return ok; }, function () { return false; }).then(function (ok) {
        b.disabled = false;
        if (ok) dedans = voulu;
        b.textContent = texteBouton(o.mode, dedans);
        b.setAttribute('aria-pressed', dedans ? 'true' : 'false');
        statut.textContent = ok ? 'C\'est enregistré.' : 'Ça n\'a pas pu être enregistré. Réessaie dans un instant.';
      });
    });
    conteneur.appendChild(b);
    conteneur.appendChild(element('p', 'bts-filtre__aide',
      'Ça s\'applique à tous ses comptes. ' + o.nom + ' ne le saura pas. Tes réglages sont sur ton propre profil.'));
    conteneur.appendChild(statut);
  }

  var compteur = 0;

  function monterChezMoi(conteneur, o) {
    var f = { mode: o.filtre.mode, effet: o.filtre.effet, bloques: o.filtre.bloques.slice(), choisis: o.filtre.choisis.slice() };
    var uid = 'bts-filtre-' + (++compteur);
    conteneur.textContent = '';

    function groupe(cle, titre, choix) {
      var g = element('fieldset', 'bts-filtre__groupe');
      g.appendChild(element('legend', null, titre));
      choix.forEach(function (c) {
        var label = element('label', 'bts-filtre__option');
        var r = document.createElement('input');
        r.type = 'radio';
        r.name = uid + '-' + cle;
        r.value = c[0];
        r.checked = f[cle] === c[0];
        r.addEventListener('change', function () {
          f[cle] = c[0];
          if (cle === 'mode') liste();
        });
        label.appendChild(r);
        label.appendChild(document.createTextNode(' ' + c[1]));
        g.appendChild(label);
      });
      conteneur.appendChild(g);
    }
    groupe('mode', 'Qui je vois', [['tous', 'Tout le monde, sauf les personnes que je filtre'], ['choisis', 'Seulement des gens choisis (et le staff)']]);
    groupe('effet', 'Ce qui est filtré', [['replier', 'Se replie : une ligne « masqué », que je peux déplier'], ['cacher', 'Disparaît complètement']]);

    var bloc = element('div', 'bts-filtre__personnes');
    conteneur.appendChild(bloc);
    function liste() {
      var cle = f.mode === 'choisis' ? 'choisis' : 'bloques';
      bloc.textContent = '';
      bloc.appendChild(element('h3', 'bts-filtre__titre-liste', f.mode === 'choisis' ? 'Mes gens choisis' : 'Personnes filtrées'));
      var dedans = (o.personnes || []).filter(function (p) { return f[cle].indexOf(p.jeton) !== -1; });
      if (!dedans.length) {
        bloc.appendChild(element('p', 'bts-filtre__aide', 'Personne pour l\'instant. Le bouton se trouve sur le profil de chacun.'));
        return;
      }
      var ul = element('ul', 'bts-filtre__liste');
      dedans.forEach(function (p) {
        var li = element('li', null, p.nom + ' ');
        var r = element('button', 'bts-filtre__retirer', 'Retirer');
        r.type = 'button';
        r.setAttribute('aria-label', 'Retirer ' + p.nom);
        r.addEventListener('click', function () {
          f[cle] = f[cle].filter(function (j) { return j !== p.jeton; });
          liste();
        });
        li.appendChild(r);
        ul.appendChild(li);
      });
      bloc.appendChild(ul);
    }
    liste();

    var pied = element('div', 'bts-filtre__pied');
    var enregistrer = element('button', 'bts-filtre__enregistrer button1', 'Enregistrer mon filtre');
    enregistrer.type = 'button';
    var statut = element('p', 'bts-filtre__statut');
    statut.setAttribute('role', 'status');
    pied.appendChild(enregistrer);
    pied.appendChild(statut);
    conteneur.appendChild(pied);
    conteneur.appendChild(element('p', 'bts-filtre__aide',
      'Personne n\'est prévenu. Le staff n\'est jamais filtré : si quelque chose ne va pas, écris-lui.'));

    var controle = {
      enregistrer: function () {
        statut.textContent = 'Enregistrement…';
        enregistrer.disabled = true;
        return Promise.resolve(o.enregistrer(f)).then(function (ok) { return ok; }, function () { return false; }).then(function (ok) {
          enregistrer.disabled = false;
          statut.textContent = ok ? 'Filtre enregistré.' : 'Le filtre n\'a pas pu être enregistré. Réessaie dans un instant.';
        });
      },
    };
    enregistrer.addEventListener('click', function () { controle.enregistrer(); });
    return controle;
  }

  /* ---------- tout le forum : appliquer le filtre ---------- */

  function memoire(valeur) {
    try {
      if (valeur === undefined) return JSON.parse(window.sessionStorage.getItem(CACHE) || 'null');
      if (valeur === null) window.sessionStorage.removeItem(CACHE);
      else window.sessionStorage.setItem(CACHE, JSON.stringify(valeur));
    } catch (e) { return null; }
    return null;
  }

  function pret() {
    return new Promise(function (r) {
      if (document.readyState !== 'loading') r();
      else document.addEventListener('DOMContentLoaded', function () { r(); });
    });
  }

  function demarrer(o) {
    var racine = document.documentElement;
    var moi = Number(o.moi);
    if (!moi) { racine.classList.remove('bts-filtre-attente'); signalerPret(false); return Promise.resolve(false); }
    demarre = true;
    window.setTimeout(function () { racine.classList.remove('bts-filtre-attente'); }, 4000);
    function avec(t) {
      var f = lire(t.filtre);
      var bottin = lireBottin(t.bottin);
      var personneMoi = personneDe(bottin, o.pseudo);
      return pret().then(function () {
        surveiller(document);
        return appliquer(document, function (pseudo) {
          return decision(f, moi, personneMoi, personneDe(bottin, pseudo));
        }, { participants: f.mode === 'choisis' || f.bloques.length > 0 });
      });
    }
    var connu = memoire();
    var deja = connu ? avec(connu) : null;
    return Promise.all([page('/u' + moi), bottinDe(o.bottin)]).then(function (r) {
      var frais = { filtre: texteDu(r[0] && champ(r[0])), bottin: r[1] };
      memoire(frais);
      if (connu && connu.filtre === frais.filtre && connu.bottin === frais.bottin) return deja;
      return avec(frais);
    }, function () {
      racine.classList.remove('bts-filtre-attente');
      signalerPret(false);
    });
  }

  /* ---------- le profil d'une personne filtrée ---------- */

  /* Tout le profil se replie derrière un seul bouton (ou disparaît, avec une phrase) ;
     la fenêtre « Filtre » reste visible pour pouvoir changer d'avis. */
  function masquerProfil(doc, d) {
    var corps = doc.body;
    corps.classList.remove('bts-profil-filtre');
    [].forEach.call(doc.querySelectorAll('.bts-profil-deplier, .bts-profil-note'), function (e) { e.parentNode.removeChild(e); });
    if (d === 'voir') return;
    var carte = doc.querySelector('.bts-resident');
    if (!carte) return;
    corps.classList.add('bts-profil-filtre');
    if (d === 'cacher') {
      var note = doc.createElement('p');
      note.className = 'bts-profil-note';
      note.textContent = 'Ce profil est masqué par ton filtre. Tu peux changer ça plus bas, dans « Filtre ».';
      carte.parentNode.insertBefore(note, carte);
      return;
    }
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'bts-profil-deplier';
    b.setAttribute('aria-expanded', 'false');
    b.textContent = 'Profil masqué par ton filtre · afficher';
    b.addEventListener('click', function () {
      var ouvert = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
      b.textContent = 'Profil masqué par ton filtre · ' + (ouvert ? 'afficher' : 'replier');
      corps.classList.toggle('bts-profil-filtre', ouvert);
    });
    carte.parentNode.insertBefore(b, carte);
  }

  /* ---------- sur un profil : les réglages ---------- */

  function profil(o) {
    var moi = Number(o.moi);
    var autre = Number(o.autre);
    if (!moi || !autre) return Promise.resolve(false);
    var mien = moi === autre ? Promise.resolve(o.champ) : page('/u' + moi).then(function (d) { return d && champ(d); });
    return Promise.all([mien, bottinDe(o.bottin)]).then(function (r) {
      var dl = r[0];
      var id = (o.champ || dl || { id: '' }).id.substring(8);
      if (!id) return false;
      var bottin = lireBottin(r[1]);
      var personneMoi = personneDe(bottin, o.pseudoMoi);
      var f = lire(texteDu(dl));
      function sauver(texte) {
        return Promise.resolve(o.enregistrer(id, texte)).then(function (ok) {
          if (ok) memoire(null);
          return ok;
        });
      }
      if (moi === autre) {
        return membres().then(function (pseudos) {
          var vues = {};
          var candidates = [];
          bottin.forEach(function (p) {
            if (!p.staff) candidates.push(personneDe(bottin, p.comptes[0]));
          });
          pseudos.forEach(function (ps) { candidates.push(personneDe(bottin, ps)); });
          candidates = candidates.filter(function (p) {
            if (p.staff || p.cle === personneMoi.cle || vues[p.cle]) return false;
            vues[p.cle] = true;
            return true;
          });
          return Promise.all(candidates.map(function (p) { return jeton(moi, p.cle); })).then(function (j) {
            monterChezMoi(o.corps, {
              filtre: f,
              personnes: candidates.map(function (p, i) { return { nom: p.nom, jeton: j[i] }; }),
              enregistrer: function (nouveau) { return sauver(ecrire(nouveau)); },
            });
            o.section.hidden = false;
            return true;
          });
        });
      }
      var personne = personneDe(bottin, o.pseudo);
      if (personne.staff || personne.cle === personneMoi.cle) return false;
      return jeton(moi, personne.cle).then(function (j) {
        var cle = f.mode === 'choisis' ? 'choisis' : 'bloques';
        monterChez(o.corps, {
          nom: o.pseudo, mode: f.mode, filtre: f[cle].indexOf(j) !== -1,
          basculer: function (voulu) {
            return page('/u' + moi).then(function (d) {
              var frais = lire(texteDu(d && champ(d)));
              frais[cle] = frais[cle].filter(function (x) { return x !== j; });
              if (voulu) frais[cle].push(j);
              return sauver(ecrire(frais)).then(function (ok) {
                if (!ok) return ok;
                return decision(frais, moi, personneMoi, personne).then(function (d2) {
                  masquerProfil(document, d2);
                  return ok;
                });
              });
            });
          },
        });
        o.section.hidden = false;
        return decision(f, moi, personneMoi, personne).then(function (d) {
          masquerProfil(document, d);
          return true;
        });
      });
    });
  }

  window.BTSFiltre = {
    lireBottin: lireBottin, personneDe: personneDe, lire: lire, ecrire: ecrire, jeton: jeton, decision: decision,
    appliquer: appliquer, surveiller: surveiller, voit: voit, masquerProfil: masquerProfil, monterChez: monterChez, monterChezMoi: monterChezMoi, demarrer: demarrer, profil: profil,
  };
})(window, document);
