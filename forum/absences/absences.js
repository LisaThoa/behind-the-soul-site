/* Behind the Soul — les absences, et la présence minimale.
 * Un bouton sur son profil : « en pause » un mois, renouvelable une fois d'un mois. Ensuite, pour se
 * redéclarer absent·e, il faut avoir posté un RP depuis la fin de l'absence ET qu'un mois soit passé.
 * Un membre absent a « En pause » sur son profil, sans date : personne n'a à se justifier.
 * Présence minimale : sans RP depuis plus d'un mois (hors absence, inscrit depuis plus d'un mois), le compte
 * apparaît dans une liste que seul le staff voit, pour faire le ménage des comptes fantômes.
 * Le champ de profil « Absence » garde début, fin et renouvellement ; les dates sont au format aaaa-mm-jj. */
(function (window, document) {
  'use strict';

  /* ---------- les dates ---------- */

  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + deux(m) + '-' + deux(d); }
  function parties(s) { return s.split('-').map(Number); }
  function joursDans(y, m) { return new Date(y, m, 0).getDate(); }

  function ajouterMois(s, n) {
    var p = parties(s);
    var m = p[1] - 1 + n;
    var y = p[0] + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12 + 1;
    return iso(y, m, Math.min(p[2], joursDans(y, m)));
  }

  function ajouterJours(s, n) {
    var p = parties(s);
    var d = new Date(p[0], p[1] - 1, p[2] + n);
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function aujourdhui() {
    var d = new Date();
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function fr(s) {
    var p = parties(s);
    return deux(p[2]) + '/' + deux(p[1]) + '/' + p[0];
  }

  var MOIS = [['jan', 1], ['fév', 2], ['fev', 2], ['mar', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['juil', 7],
    ['aoû', 8], ['aou', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['déc', 12], ['dec', 12]];

  /* Les dates telles que Forumactif les écrit : « Aujourd'hui à 15:25 », « Hier à 18:40 »,
     « 23/01/2026 », « Jeu 29 Oct 2026 - 18:40 », « Lun 2 Fév - 10:00 » (année en cours). */
  function dateDe(texte, jour) {
    var t = String(texte || '').trim().toLowerCase();
    if (/^aujourd/.test(t)) return jour;
    if (/^hier/.test(t)) return ajouterJours(jour, -1);
    var m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) return iso(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]));
    m = t.match(/(\d{1,2})\s+([a-zéû]+)\.?(?:\s+(\d{4}))?/);
    if (m) {
      var mois = MOIS.filter(function (x) { return m[2].indexOf(x[0]) === 0; })[0];
      if (mois) return iso(m[3] ? Number(m[3]) : parties(jour)[0], mois[1], Number(m[1]));
    }
    return null;
  }

  /* ---------- le champ « Absence » ---------- */

  function lire(texte) {
    var a = { debut: null, fin: null, renouvelee: false };
    String(texte || '').split(/\r?\n/).forEach(function (ligne) {
      var m = ligne.trim().match(/^(debut|fin|renouvelee)\s*:\s*(\S+)$/);
      if (!m) return;
      if (m[1] === 'renouvelee') a.renouvelee = m[2] === 'oui';
      else if (/^\d{4}-\d{2}-\d{2}$/.test(m[2])) a[m[1]] = m[2];
    });
    return a;
  }

  function ecrire(a) {
    return ['[absence]', 'debut : ' + (a.debut || '-'), 'fin : ' + (a.fin || '-'), 'renouvelee : ' + (a.renouvelee ? 'oui' : 'non')].join('\n');
  }

  /* ---------- les règles ---------- */

  function declarer(jour) { return { debut: jour, fin: ajouterMois(jour, 1), renouvelee: false }; }
  function prolonger(a) { return { debut: a.debut, fin: ajouterMois(a.fin, 1), renouvelee: true }; }
  function revenir(a, jour) { return { debut: a.debut, fin: jour, renouvelee: a.renouvelee }; }

  function enPause(a, jour) { return !!(a.debut && a.fin && a.debut <= jour && jour < a.fin); }

  /* Pour les mini-cartes : le texte brut du champ dit-il « en pause » aujourd'hui ? */
  function pauseDans(texte, jour) { return enPause(lire(texte), jour || aujourdhui()); }

  function etat(a, jour, dernierRP) {
    if (enPause(a, jour)) return { pause: true, peutProlonger: !a.renouvelee, peutRevenir: true, peutDeclarer: false, raison: '' };
    var e = { pause: false, peutProlonger: false, peutRevenir: false, peutDeclarer: true, raison: '' };
    if (!a.fin) return e;
    var delai = ajouterMois(a.fin, 1);
    var rp = !!(dernierRP && dernierRP >= a.fin);
    var mois = jour >= delai;
    e.peutDeclarer = rp && mois;
    var manque = [];
    if (!rp) manque.push('il faudra d\'abord poster un RP');
    if (!mois) manque.push('ce sera possible à partir du ' + fr(delai));
    if (manque.length) e.raison = 'Pour te redéclarer absent·e, ' + manque.join(', et ') + '.';
    return e;
  }

  function fantome(m, jour) {
    if (enPause(m.absence, jour)) return false;
    var limite = ajouterMois(jour, -1);
    if (m.inscription && m.inscription > limite) return false;
    return !m.dernierRP || m.dernierRP < limite;
  }

  /* ---------- lire le forum ---------- */

  function page(url) {
    return window.fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).then(function (html) {
      return new window.DOMParser().parseFromString(html, 'text/html');
    }, function () { return null; });
  }

  /* Le dernier message RP d'un pseudo : la recherche par auteur, du plus récent au plus ancien,
     en ne gardant que les sections de la carte (le hors-jeu ne compte pas). */
  function dernierRP(pseudo, forums, jour) {
    var url = '/search?search_keywords=&search_terms=any&search_author=' + encodeURIComponent(pseudo) +
      '&search_where=-1&search_time=0&show_results=posts&sort_by=0&sort_dir=DESC';
    return page(url).then(function (doc) {
      if (!doc) return null;
      var trouve = null;
      [].some.call(doc.querySelectorAll('.search.post, .post'), function (p) {
        var lien = p.querySelector('a.postdetails[href^="/f"]');
        var f = lien && (lien.getAttribute('href').match(/^\/f(\d+)-/) || [])[1];
        if (!f || forums.indexOf(String(f)) === -1) return false;
        var dd = p.querySelector('.postprofile dd');
        trouve = dd ? dateDe(dd.textContent, jour || aujourdhui()) : null;
        return !!trouve;
      });
      return trouve;
    });
  }

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

  function champ(doc) {
    return [].filter.call(doc.querySelectorAll('dl[id^="field_id"]'), function (dl) {
      var dt = dl.querySelector('dt');
      return dt && /^Absence\b/i.test(dt.textContent.trim());
    })[0] || null;
  }

  function texteDu(dl) {
    var zone = dl && dl.querySelector('.field_editable textarea, .field_editable input');
    if (zone) return zone.value;
    var valeur = dl && dl.querySelector('.field_uneditable');
    if (!valeur) return '';
    var copie = valeur.cloneNode(true);
    [].forEach.call(copie.querySelectorAll('br'), function (br) {
      br.parentNode.replaceChild(document.createTextNode('\n'), br);
    });
    return copie.textContent;
  }

  /* ---------- les multicomptes : une personne = tous ses comptes (bottin du staff) ---------- */

  function nettoie(t) { return String(t || '').trim().toLowerCase(); }

  /* Le bottin : une ligne « nom (staff) : compte, compte ». Un compte absent du bottin est seul. */
  function comptesDe(texte, pseudo) {
    var trouve = null;
    String(texte || '').split(/\r?\n/).some(function (ligne) {
      var i = ligne.indexOf(':');
      if (i === -1 || ligne.trim().charAt(0) === '#') return false;
      var comptes = ligne.slice(i + 1).split(',').map(function (c) { return c.trim(); }).filter(Boolean);
      if (comptes.some(function (c) { return nettoie(c) === nettoie(pseudo); })) { trouve = comptes; return true; }
      return false;
    });
    return trouve || [String(pseudo).trim()];
  }

  var bottins = {};
  function bottin(url) {
    if (!url) return Promise.resolve('');
    if (!bottins[url]) {
      bottins[url] = page(url).then(function (doc) {
        var pre = doc && doc.getElementById('bts-bottin');
        return pre ? pre.textContent : '';
      });
    }
    return bottins[url];
  }

  var profils = {};
  function profilDe(pseudo) {
    var cle = nettoie(pseudo);
    if (!profils[cle]) {
      profils[cle] = page('/memberlist?mode=username&order=ASC&username=' + encodeURIComponent(pseudo)).then(function (doc) {
        var lien = doc && [].filter.call(doc.querySelectorAll('a[href]'), function (a) {
          return /^\/u\d+/.test(a.getAttribute('href')) && nettoie(a.textContent) === cle;
        })[0];
        return lien ? lien.getAttribute('href').match(/^\/u\d+/)[0] : null;
      });
    }
    return profils[cle];
  }

  /* Les absences des comptes d'une personne (sauf celui dont on connaît déjà le texte). */
  function absencesDe(comptes, sauf) {
    return Promise.all(comptes.filter(function (c) { return nettoie(c) !== nettoie(sauf); }).map(function (c) {
      return profilDe(c).then(function (url) { return url ? page(url) : null; }).then(function (doc) {
        return { pseudo: c, absence: lire(texteDu(doc && champ(doc))) };
      });
    }));
  }

  function laPlusRecente(liste) {
    return liste.filter(function (x) { return x.absence && x.absence.debut; }).sort(function (a, b) {
      return a.absence.debut < b.absence.debut ? 1 : -1;
    })[0] || null;
  }

  /* Pour la mini-carte et les profils : la personne de ce compte est-elle en pause ? */
  var pauses = {};
  function pausePersonne(pseudo, o) {
    var jour = (o && o.jour) || aujourdhui();
    var connu = o && typeof o.texte === 'string';
    if (connu && pauseDans(o.texte, jour)) return Promise.resolve(true);
    /* Un même joueur peut apparaître plusieurs fois sur une page : une seule lecture par personne. */
    var cle = nettoie(pseudo) + '|' + (connu ? 'connu' : 'tout') + '|' + jour + '|' + ((o && o.bottin) || '');
    if (!pauses[cle]) {
      pauses[cle] = bottin(o && o.bottin).then(function (texte) {
        return absencesDe(comptesDe(texte, pseudo), connu ? pseudo : null);
      }).then(function (liste) {
        return liste.some(function (x) { return enPause(x.absence, jour); });
      });
    }
    return pauses[cle];
  }

  /* ---------- l'affichage ---------- */

  function element(nom, classe, texte) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  function pastille(doc, pause) {
    [].forEach.call(doc.querySelectorAll('.bts-pause'), function (p) { p.parentNode.removeChild(p); });
    if (!pause) return;
    var nom = doc.getElementById('bts-resident-nom');
    if (!nom) return;
    var p = doc.createElement('span');
    p.className = 'bts-pause';
    p.textContent = 'En pause';
    nom.parentNode.insertBefore(p, nom.nextSibling);
  }

  function monterChezMoi(conteneur, o) {
    var absence = o.absence;
    conteneur.textContent = '';
    var zone = element('div', 'bts-absence__etat');
    var statut = element('p', 'bts-absence__statut');
    statut.setAttribute('role', 'status');
    conteneur.appendChild(zone);
    conteneur.appendChild(statut);
    conteneur.appendChild(element('p', 'bts-absence__aide',
      'Pendant ta pause, « En pause » s\'affiche sur ton profil, sans date. Personne n\'a à savoir pourquoi.'));

    function agir(nouvelle, message) {
      statut.textContent = 'Enregistrement…';
      return Promise.resolve(o.enregistrer(ecrire(nouvelle))).then(function (ok) { return ok; }, function () { return false; }).then(function (ok) {
        if (ok) {
          absence = nouvelle;
          if (o.changement) o.changement(absence);
          rendre();
        }
        statut.textContent = ok ? message : 'Ça n\'a pas pu être enregistré. Réessaie dans un instant.';
      });
    }

    function bouton(classe, texte, action) {
      var b = element('button', classe + ' button1', texte);
      b.type = 'button';
      b.addEventListener('click', action);
      zone.appendChild(b);
    }

    function rendre() {
      zone.textContent = '';
      /* La règle vaut pour la personne : si l'absence la plus récente est sur un autre de ses comptes, c'est elle qui compte. */
      var ailleurs = o.ailleurs && o.ailleurs.absence.debut && (!absence.debut || o.ailleurs.absence.debut > absence.debut) ? o.ailleurs : null;
      var e = etat(ailleurs ? ailleurs.absence : absence, o.aujourdhui, o.dernierRP);
      if (e.pause && ailleurs) {
        zone.appendChild(element('p', 'bts-absence__phrase', 'En pause jusqu\'au ' + fr(ailleurs.absence.fin) +
          ', déclarée depuis ton compte « ' + ailleurs.pseudo + ' ». Pour prolonger ou revenir, passe par ce compte.'));
        return;
      }
      if (e.pause) {
        zone.appendChild(element('p', 'bts-absence__phrase', 'En pause jusqu\'au ' + fr(absence.fin) + '.'));
        if (e.peutProlonger) bouton('bts-absence__prolonger', 'Prolonger d\'un mois', function () { agir(prolonger(absence), 'Pause prolongée d\'un mois.'); });
        bouton('bts-absence__revenir', 'Je suis de retour', function () { agir(revenir(absence, o.aujourdhui), 'Bon retour !'); });
        return;
      }
      if (e.peutDeclarer) {
        zone.appendChild(element('p', 'bts-absence__phrase', 'Besoin de souffler ? Tu peux te mettre en pause un mois, renouvelable une fois.'));
        bouton('bts-absence__declarer', 'Je m\'absente un mois', function () { agir(declarer(o.aujourdhui), 'C\'est noté. Prends soin de toi.'); });
      } else {
        zone.appendChild(element('p', 'bts-absence__phrase', e.raison));
      }
    }
    rendre();
  }

  function monterFantomes(conteneur, liste) {
    conteneur.textContent = '';
    if (!liste.length) {
      conteneur.appendChild(element('p', 'bts-absence__aide', 'Aucun compte fantôme pour l\'instant.'));
      return;
    }
    var ul = element('ul', 'bts-absence__fantomes');
    liste.forEach(function (m) {
      var li = element('li');
      var a = element('a', null, m.nom);
      a.href = m.profil;
      li.appendChild(a);
      li.appendChild(document.createTextNode(' · dernier RP : ' + (m.dernierRP ? fr(m.dernierRP) : 'jamais')));
      ul.appendChild(li);
    });
    conteneur.appendChild(ul);
  }

  /* ---------- le staff : chercher les comptes fantômes ---------- */

  function attendre(ms) { return new Promise(function (r) { window.setTimeout(r, ms); }); }

  function membres(jour) {
    return page('/memberlist').then(function (doc) {
      if (!doc) return [];
      var vus = {};
      var liste = [];
      [].forEach.call(doc.querySelectorAll('a[href]'), function (a) {
        var m = a.getAttribute('href').match(/^\/u(\d+)$/);
        if (!m || vus[m[1]] || !a.textContent.trim()) return;
        vus[m[1]] = true;
        var ligne = a.closest('tr, li');
        var info = ligne && [].filter.call(ligne.querySelectorAll('.memberlist-info'), function (x) { return /inscription/i.test(x.textContent); })[0];
        liste.push({ nom: a.textContent.trim(), profil: '/u' + m[1], inscription: info ? dateDe(info.textContent.replace(/^[^:]*:/, ''), jour) : null });
      });
      return liste;
    });
  }

  /* La présence se compte par compte ; mais un compte dont la personne est en pause (sur n'importe
     lequel de ses comptes, d'après le bottin) n'est pas un fantôme. */
  function chercherFantomes(forums, jour, progression, o) {
    var attente = o && o.attente != null ? o.attente : 1500;
    return Promise.all([membres(jour), bottin(o && o.bottin)]).then(function (r) {
      var liste = r[0];
      var texteBottin = r[1];
      var infos = [];
      /* Un compte à la fois, avec une pause : la recherche de Forumactif n'aime pas les rafales. */
      return liste.reduce(function (p, m, i) {
        return p.then(function () {
          if (progression) progression(i + 1, liste.length);
          return Promise.all([page(m.profil), dernierRP(m.nom, forums, jour)]).then(function (x) {
            infos.push({ m: m, absence: lire(texteDu(x[0] && champ(x[0]))), dernierRP: x[1] });
            return attendre(attente);
          });
        });
      }, Promise.resolve()).then(function () {
        function pausePourLaPersonne(nom) {
          var comptes = comptesDe(texteBottin, nom).map(nettoie);
          return infos.some(function (x) { return comptes.indexOf(nettoie(x.m.nom)) !== -1 && enPause(x.absence, jour); });
        }
        return infos.filter(function (x) {
          if (pausePourLaPersonne(x.m.nom)) return false;
          return fantome({ absence: x.absence, dernierRP: x.dernierRP, inscription: x.m.inscription }, jour);
        }).map(function (x) { return { nom: x.m.nom, profil: x.m.profil, dernierRP: x.dernierRP }; });
      });
    });
  }

  /* ---------- sur le profil ---------- */

  function profil(o) {
    var jour = o.jour || aujourdhui();
    var texte = texteDu(o.champ);
    var absence = lire(texte);
    var nom = o.nom || o.pseudo;
    pastille(document, enPause(absence, jour));
    var moi = Number(o.moi);
    var forums = forumsDeLaCarte(o.config);
    /* Les autres comptes de la personne de ce profil (d'après le bottin). */
    var autres = bottin(o.bottin).then(function (t) { return absencesDe(comptesDe(t, nom), nom).then(function (l) { return { liste: l, comptes: comptesDe(t, nom) }; }); });
    var pastilleFaite = autres.then(function (a) {
      if (a.liste.some(function (x) { return enPause(x.absence, jour); })) pastille(document, true);
      return a;
    });
    if (!moi || moi !== Number(o.autre) || !o.champ) return pastilleFaite.then(function () { return false; });
    var id = o.champ.id.substring(8);
    return pastilleFaite.then(function (a) {
      /* Le dernier RP de la personne : le plus récent de tous ses comptes. */
      return Promise.all(a.comptes.map(function (c) { return dernierRP(c, forums, jour); })).then(function (dates) {
        var rp = dates.filter(Boolean).sort().pop() || null;
        return { autres: a.liste, rp: rp };
      });
    }).then(function (r) {
      var ailleurs = laPlusRecente(r.autres);
      monterChezMoi(o.corps, {
        absence: absence, aujourdhui: jour, dernierRP: r.rp, ailleurs: ailleurs,
        enregistrer: function (t) { return o.enregistrer(id, t); },
        changement: function (a) { pastille(document, enPause(a, jour) || r.autres.some(function (x) { return enPause(x.absence, jour); })); },
      });
      if (o.staff) {
        var bloc = element('div', 'bts-absence__staff');
        bloc.appendChild(element('h3', 'bts-absence__titre-staff', 'Staff · comptes sans RP depuis plus d\'un mois'));
        var b = element('button', 'bts-absence__chercher button2', 'Chercher les comptes fantômes');
        b.type = 'button';
        var resultat = element('div', 'bts-absence__resultat');
        resultat.setAttribute('aria-live', 'polite');
        b.addEventListener('click', function () {
          b.disabled = true;
          chercherFantomes(forums, jour, function (i, n) { resultat.textContent = 'Lecture ' + i + ' / ' + n + '…'; }, { bottin: o.bottin }).then(function (liste) {
            monterFantomes(resultat, liste);
            b.disabled = false;
          });
        });
        bloc.appendChild(b);
        bloc.appendChild(resultat);
        o.corps.appendChild(bloc);
      }
      o.section.hidden = false;
      return true;
    });
  }

  window.BTSAbsences = {
    lire: lire, ecrire: ecrire, ajouterMois: ajouterMois, declarer: declarer, prolonger: prolonger, revenir: revenir,
    etat: etat, pauseDans: pauseDans, comptesDe: comptesDe, pausePersonne: pausePersonne, dateDe: dateDe, dernierRP: dernierRP, fantome: fantome, pastille: pastille,
    monterChezMoi: monterChezMoi, monterFantomes: monterFantomes, chercherFantomes: chercherFantomes, profil: profil,
  };
})(window, document);
