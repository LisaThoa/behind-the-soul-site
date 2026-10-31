/* Behind the Soul — les bips : l'intérêt mutuel caché, dans le bipeur.
 * Sur le profil de quelqu'un, on bipe pour « un lien » ou « un RP ». La personne ne voit « X vous a bipé »
 * que si elle a bipé aussi ; sinon elle ne sait rien, et personne n'est prévenu d'un « non ».
 * Le champ de profil « Envies » ne garde que des empreintes (SHA-256 tronquées) de « moi > l'autre, type »,
 * jamais de pseudo en clair. C'est discret, pas un coffre-fort : un membre qui fouille le code peut recalculer. */
(function (window, document) {
  'use strict';

  var TYPES = [{ id: 'lien', mot: 'un lien' }, { id: 'rp', mot: 'un RP' }];
  var TITRE = '[envies]';

  /* ---------- les empreintes ---------- */

  function jeton(de, vers, type) {
    var octets = new window.TextEncoder().encode('bts-envie|' + type + '|' + de + '>' + vers);
    return window.crypto.subtle.digest('SHA-256', octets).then(function (h) {
      return [].map.call(new Uint8Array(h).slice(0, 8), function (o) {
        return (o < 16 ? '0' : '') + o.toString(16);
      }).join('');
    });
  }

  function lire(texte) {
    var jetons = [];
    String(texte || '').split(/\r?\n/).forEach(function (ligne) {
      var j = ligne.trim();
      if (/^[0-9a-f]{16}$/.test(j) && jetons.indexOf(j) === -1) jetons.push(j);
    });
    return jetons;
  }

  function ecrire(jetons) {
    return [TITRE].concat(jetons).join('\n');
  }

  function basculerJeton(texte, de, vers, type, coche) {
    return jeton(de, vers, type).then(function (j) {
      var jetons = lire(texte).filter(function (x) { return x !== j; });
      if (coche) jetons.push(j);
      return ecrire(jetons);
    });
  }

  function etat(moi, autre, miens, siens) {
    return Promise.all(TYPES.map(function (t) {
      return Promise.all([jeton(moi, autre, t.id), jeton(autre, moi, t.id)]);
    })).then(function (paires) {
      var r = {};
      TYPES.forEach(function (t, i) {
        var coche = miens.indexOf(paires[i][0]) !== -1;
        r[t.id] = { moi: coche, partage: coche && siens.indexOf(paires[i][1]) !== -1 };
      });
      return r;
    });
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
      return dt && /^Envies\b/i.test(dt.textContent.trim());
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

  function membres() {
    return page('/memberlist').then(function (doc) {
      if (!doc) return [];
      var autres = [].map.call(doc.querySelectorAll('.pagination a[href*="memberlist"]'), function (a) { return a.getAttribute('href'); });
      autres = autres.filter(function (h, i) { return autres.indexOf(h) === i; });
      return Promise.all(autres.map(page)).then(function (docs) {
        var vus = {};
        var liste = [];
        [doc].concat(docs).forEach(function (d) {
          if (!d) return;
          [].forEach.call(d.querySelectorAll('a[href]'), function (a) {
            var m = a.getAttribute('href').match(/^\/u(\d+)$/);
            if (!m || vus[m[1]] || !a.textContent.trim()) return;
            vus[m[1]] = true;
            liste.push({ id: Number(m[1]), nom: a.textContent.trim(), profil: '/u' + m[1] });
          });
        });
        return liste;
      });
    });
  }

  function partages(moi, miens) {
    return membres().then(function (liste) {
      return Promise.all(liste.filter(function (m) { return m.id !== Number(moi); }).map(function (m) {
        return Promise.all(TYPES.map(function (t) { return jeton(moi, m.id, t.id); })).then(function (j) {
          var voulus = TYPES.filter(function (t, i) { return miens.indexOf(j[i]) !== -1; });
          if (!voulus.length) return null;
          return page(m.profil).then(function (doc) {
            var siens = doc ? lire(texteDu(champ(doc))) : [];
            return Promise.all(voulus.map(function (t) { return jeton(m.id, moi, t.id); })).then(function (retour) {
              var types = voulus.filter(function (t, i) { return siens.indexOf(retour[i]) !== -1; }).map(function (t) { return t.id; });
              return types.length ? { id: m.id, nom: m.nom, profil: m.profil, types: types } : null;
            });
          });
        });
      }));
    }).then(function (r) {
      r = r.filter(Boolean);
      /* Une envie partagée avec une personne que je filtre ne s'affiche pas. */
      if (!window.BTSFiltre || !window.BTSFiltre.voit) return r;
      return Promise.all(r.map(function (m) { return window.BTSFiltre.voit(m.nom); })).then(function (vus) {
        return r.filter(function (m, i) { return vus[i]; });
      });
    });
  }

  /* ---------- l'affichage ---------- */

  function element(nom, classe, texte) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  function mots(types) {
    return types.map(function (id) {
      return TYPES.filter(function (t) { return t.id === id; })[0].mot;
    }).join(' et ');
  }

  function actions(parent, mp, proposer) {
    if (mp) {
      var ecrire = element('a', 'bts-envies__ecrire', 'Lui écrire');
      ecrire.href = mp;
      parent.appendChild(ecrire);
    }
    parent.appendChild(proposer);
  }

  function monterChez(conteneur, options) {
    conteneur.textContent = '';
    var groupe = element('div', 'bts-envies__choix');
    groupe.setAttribute('role', 'group');
    groupe.setAttribute('aria-label', 'Biper ' + options.nom);
    var statut = element('p', 'bts-envies__statut');
    statut.setAttribute('role', 'status');
    var boutons = TYPES.map(function (t) {
      var b = element('button', 'bts-envies__biper', 'Biper · ' + t.mot);
      b.type = 'button';
      b.setAttribute('data-type', t.id);
      b.setAttribute('aria-pressed', options.etat[t.id].moi ? 'true' : 'false');
      b.addEventListener('click', function () {
        var voulu = b.getAttribute('aria-pressed') !== 'true';
        /* Un seul enregistrement à la fois : le suivant repartirait d'un texte périmé. */
        boutons.forEach(function (x) { x.disabled = true; });
        statut.textContent = 'Enregistrement…';
        Promise.resolve(options.basculer(t.id, voulu)).then(function (ok) { return ok; }, function () { return false; }).then(function (ok) {
          boutons.forEach(function (x) { x.disabled = false; });
          if (ok) b.setAttribute('aria-pressed', voulu ? 'true' : 'false');
          statut.textContent = ok ? (voulu ? 'Bip envoyé, discrètement.' : 'Bip retiré.')
            : 'Ton bip n\'a pas pu être enregistré. Réessaie dans un instant.';
        });
      });
      groupe.appendChild(b);
      return b;
    });
    conteneur.appendChild(groupe);
    conteneur.appendChild(element('p', 'bts-envies__aide',
      options.nom + ' ne le verra que si ce bip est réciproque. Sinon, rien ne s\'affiche, pour personne.'));
    var communs = TYPES.filter(function (t) { return options.etat[t.id].partage; }).map(function (t) { return t.id; });
    if (communs.length) {
      var recu = element('p', 'bts-envies__recu', '▸ Vous vous êtes bipés · ' + mots(communs) + ' ');
      var proposer = element('a', 'bts-envies__proposer', 'Proposer un lien');
      proposer.href = '/u' + options.moi + '#bts-liens';
      proposer.addEventListener('click', function () {
        try { window.sessionStorage.setItem('bts-lien-a-proposer', options.nom); } catch (e) { return; }
      });
      actions(recu, options.mp, proposer);
      conteneur.appendChild(recu);
    }
    conteneur.appendChild(statut);
  }

  function monterChezMoi(conteneur, liste, options) {
    options = options || {};
    conteneur.textContent = '';
    if (!liste.length) {
      conteneur.appendChild(element('p', 'bts-envies__aide', 'Pas de bip pour l\'instant. Un bip n\'arrive ici que s\'il est réciproque.'));
      return;
    }
    var ul = element('ul', 'bts-envies__liste');
    liste.forEach(function (m) {
      var li = element('li', 'bts-envies__recu');
      li.appendChild(document.createTextNode('▸ '));
      var a = element('a', null, m.nom);
      a.href = m.profil;
      li.appendChild(a);
      li.appendChild(document.createTextNode(' vous a bipé · ' + mots(m.types) + ' '));
      var proposer = element('button', 'bts-envies__proposer', 'Proposer un lien');
      proposer.type = 'button';
      proposer.addEventListener('click', function () { if (options.proposer) options.proposer(m.nom); });
      actions(li, '/privmsg?mode=post&u=' + m.id, proposer);
      ul.appendChild(li);
    });
    conteneur.appendChild(ul);
  }

  /* ---------- sur le profil ---------- */

  function demarrer(o) {
    var moi = Number(o.moi);
    var autre = Number(o.autre);
    if (!moi || !autre) return Promise.resolve(false);
    if (moi === autre) {
      return partages(moi, lire(texteDu(o.champ))).then(function (liste) {
        monterChezMoi(o.corps, liste, { proposer: o.proposer });
        o.section.hidden = false;
        return true;
      });
    }
    var siens = lire(texteDu(o.champ));
    return page('/u' + moi).then(function (doc) {
      var mien = doc && champ(doc);
      var id = (o.champ || mien || { id: '' }).id.substring(8);
      if (!id) return false;
      return etat(moi, autre, lire(texteDu(mien)), siens).then(function (e) {
        monterChez(o.corps, {
          nom: o.nom, mp: o.mp, moi: moi, etat: e,
          basculer: function (type, coche) {
            return page('/u' + moi).then(function (d) {
              return basculerJeton(texteDu(d && champ(d)), moi, autre, type, coche);
            }).then(function (texte) { return o.enregistrer(id, texte); });
          },
        });
        o.section.hidden = false;
        return true;
      });
    });
  }

  window.BTSEnvies = {
    TYPES: TYPES, jeton: jeton, lire: lire, ecrire: ecrire, basculerJeton: basculerJeton, etat: etat,
    partages: partages, monterChez: monterChez, monterChezMoi: monterChezMoi, demarrer: demarrer,
  };
})(window, document);
