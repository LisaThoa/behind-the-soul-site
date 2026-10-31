/* Behind the Soul — la gestion des multicomptes.
 * Un bouton « Comptes » dans le quai : changer de compte en un clic, sans quitter la page.
 * Les mots de passe restent dans ce navigateur, chiffrés (AES-GCM) avec une clé tirée d'un code choisi par
 * le joueur (PBKDF2) ; la clé ne vit que le temps de la session. Ils ne partent que vers le formulaire /login.
 * Un code court arrête un curieux, pas quelqu'un de déterminé qui aurait l'ordinateur entre les mains.
 * Un message en cours d'écriture est gardé pendant le changement, puis rendu sur la même page. */
(function (window, document) {
  'use strict';

  var COFFRE = 'bts-comptes-v1';
  var CLE = 'bts-comptes-cle';
  var BROUILLON = 'bts-comptes-brouillon';
  var VERIF = 'bts-ok';
  var compteur = 0;

  function pareil(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }

  /* ---------- le chiffrement ---------- */

  function versB64(octets) {
    return window.btoa(String.fromCharCode.apply(null, new Uint8Array(octets)));
  }

  function deB64(texte) {
    return Uint8Array.from(window.atob(texte), function (c) { return c.charCodeAt(0); });
  }

  function aleatoire(n) {
    return window.crypto.getRandomValues(new Uint8Array(n));
  }

  function deriver(code, sel) {
    var subtle = window.crypto.subtle;
    return subtle.importKey('raw', new window.TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle.deriveKey({ name: 'PBKDF2', salt: deB64(sel), iterations: api.ITERATIONS, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    });
  }

  function chiffrer(cle, texte) {
    var iv = aleatoire(12);
    return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, cle, new window.TextEncoder().encode(texte)).then(function (data) {
      return { iv: versB64(iv), data: versB64(data) };
    });
  }

  function dechiffrer(cle, boite) {
    return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(boite.iv) }, cle, deB64(boite.data)).then(function (octets) {
      return new window.TextDecoder().decode(octets);
    });
  }

  function creerCoffre(code) {
    var sel = versB64(aleatoire(16));
    return deriver(code, sel).then(function (cle) {
      return chiffrer(cle, VERIF).then(function (verif) {
        return { coffre: { v: 1, sel: sel, verif: verif, comptes: [] }, cle: cle };
      });
    });
  }

  function ouvrir(coffre, code) {
    return deriver(code, coffre.sel).then(function (cle) {
      return dechiffrer(cle, coffre.verif).then(function (t) { return t === VERIF ? cle : null; });
    }).then(null, function () { return null; });
  }

  function ajouter(coffre, cle, nom, motdepasse) {
    return chiffrer(cle, motdepasse).then(function (boite) {
      var comptes = coffre.comptes.filter(function (c) { return !pareil(c.nom, nom); });
      comptes.push({ nom: String(nom).trim(), iv: boite.iv, data: boite.data });
      return { v: coffre.v, sel: coffre.sel, verif: coffre.verif, comptes: comptes };
    });
  }

  function oublier(coffre, nom) {
    return {
      v: coffre.v, sel: coffre.sel, verif: coffre.verif,
      comptes: coffre.comptes.filter(function (c) { return !pareil(c.nom, nom); }),
    };
  }

  /* ---------- le stockage : le coffre dans localStorage, la clé dans sessionStorage ---------- */

  function lire() {
    try { return JSON.parse(window.localStorage.getItem(COFFRE) || 'null'); } catch (e) { return null; }
  }

  function sauver(coffre) {
    try { window.localStorage.setItem(COFFRE, JSON.stringify(coffre)); } catch (e) { return false; }
    return true;
  }

  function effacer() {
    try {
      window.localStorage.removeItem(COFFRE);
      window.sessionStorage.removeItem(CLE);
    } catch (e) { return false; }
    return true;
  }

  function garderCle(cle) {
    return window.crypto.subtle.exportKey('raw', cle).then(function (brut) {
      try { window.sessionStorage.setItem(CLE, versB64(brut)); } catch (e) { return false; }
      return true;
    });
  }

  function cleDeSession() {
    var brut = null;
    try { brut = window.sessionStorage.getItem(CLE); } catch (e) { brut = null; }
    if (!brut) return Promise.resolve(null);
    return window.crypto.subtle.importKey('raw', deB64(brut), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
      .then(null, function () { return null; });
  }

  /* ---------- le bottin : « nom (staff) : compte, compte » ---------- */

  function comptesDuBottin(texte, moi) {
    var trouves = [];
    String(texte || '').split(/\r?\n/).forEach(function (ligne) {
      var brute = ligne.trim();
      var i = brute.indexOf(':');
      if (!brute || brute.charAt(0) === '#' || i === -1) return;
      var comptes = brute.slice(i + 1).split(',').map(function (c) { return c.trim(); }).filter(Boolean);
      if (!comptes.some(function (c) { return pareil(c, moi); })) return;
      comptes.forEach(function (c) { if (!pareil(c, moi)) trouves.push(c); });
    });
    return trouves;
  }

  /* ---------- le brouillon ---------- */

  function editeur() {
    var zone = document.getElementById('text_editor_textarea');
    var instance = null;
    try {
      if (zone && window.jQuery && window.jQuery(zone).sceditor) instance = window.jQuery(zone).sceditor('instance');
    } catch (e) { instance = null; }
    return { zone: zone, instance: instance && instance.val ? instance : null };
  }

  function ici() { return window.location.pathname + window.location.search; }

  function garderBrouillon() {
    var e = editeur();
    if (!e.zone) return false;
    var texte = e.instance ? e.instance.val() : e.zone.value;
    if (!String(texte || '').trim()) return false;
    try { window.sessionStorage.setItem(BROUILLON, JSON.stringify({ url: ici(), texte: texte })); } catch (x) { return false; }
    return true;
  }

  function rendreBrouillon() {
    var b = null;
    try { b = JSON.parse(window.sessionStorage.getItem(BROUILLON) || 'null'); } catch (x) { b = null; }
    var e = editeur();
    if (!b || b.url !== ici() || !e.zone) return false;
    if (e.instance) e.instance.val(b.texte);
    e.zone.value = b.texte;
    try { window.sessionStorage.removeItem(BROUILLON); } catch (x) { return true; }
    return true;
  }

  /* ---------- changer de compte ---------- */

  function changer(nom, motdepasse, o) {
    o = o || {};
    garderBrouillon();
    var sortie = document.querySelector('a[href*="logout=1"]');
    var avant = sortie ? window.fetch(sortie.getAttribute('href'), { credentials: 'same-origin', cache: 'no-store' }) : Promise.resolve(null);
    return avant.then(function () {
      var corps = new window.URLSearchParams();
      corps.set('username', nom);
      corps.set('password', motdepasse);
      corps.set('autologin', 'on');
      corps.set('login', '1');
      corps.set('redirect', ici());
      return window.fetch('/login', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', body: corps,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    }).then(function (r) { return r.text(); }).then(function (html) {
      if (!/logout=1/.test(html)) return false;
      (o.recharger || function () { window.location.reload(); })();
      return true;
    }, function () { return false; });
  }

  /* ---------- le bouton et le panneau ---------- */

  function element(nom, classe, contenu) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (contenu != null) e.textContent = contenu;
    return e;
  }

  function champ(parent, etiquette, attributs) {
    var id = 'bts-comptes-champ-' + (++compteur);
    var bloc = element('div', 'bts-comptes__champ');
    var label = element('label', null, etiquette);
    label.htmlFor = id;
    var input = document.createElement('input');
    input.id = id;
    Object.keys(attributs).forEach(function (k) { input.setAttribute(k, attributs[k]); });
    bloc.appendChild(label);
    bloc.appendChild(input);
    parent.appendChild(bloc);
    return input;
  }

  function monter(conteneur, etat) {
    var ancien = conteneur.querySelector('.bts-comptes');
    if (ancien) ancien.parentNode.removeChild(ancien);
    var id = 'bts-comptes-panneau-' + (++compteur);
    var bloc = element('div', 'bts-comptes');
    var b = element('button', 'bts-comptes__bouton', 'Comptes');
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', id);
    b.title = 'Changer de compte';
    var panneau = element('div', 'bts-comptes__panneau');
    panneau.id = id;
    panneau.hidden = true;
    var statut = element('p', 'bts-comptes__statut');
    statut.setAttribute('role', 'status');

    function formulaire(bouton, envoyer) {
      var f = element('form', 'bts-comptes__formulaire');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        envoyer();
      });
      return { f: f, fin: function () {
        var ok = element('button', 'bts-comptes__valider', bouton);
        ok.type = 'submit';
        f.appendChild(ok);
        return f;
      } };
    }

    function dessiner() {
      panneau.textContent = '';
      panneau.appendChild(element('p', 'bts-comptes__titre', 'Comptes'));
      if (!etat.coffre) dessinerCreation();
      else if (!etat.cle) dessinerVerrou();
      else dessinerListe();
      panneau.appendChild(statut);
    }

    function dessinerCreation() {
      var x = formulaire('Créer le code', function () {
        if (code.value.length < 4) { statut.textContent = 'Le code doit faire au moins 4 caractères.'; return; }
        if (code.value !== encore.value) { statut.textContent = 'Les deux codes ne sont pas pareils.'; return; }
        creerCoffre(code.value).then(function (r) {
          sauver(r.coffre);
          etat.coffre = r.coffre;
          etat.cle = r.cle;
          return garderCle(r.cle);
        }).then(function () {
          dessiner();
          statut.textContent = 'Code créé. Ajoute tes comptes.';
        });
      });
      var code = champ(x.f, 'Choisis un code', { type: 'password', name: 'code', autocomplete: 'new-password' });
      var encore = champ(x.f, 'Retape-le', { type: 'password', name: 'code2', autocomplete: 'new-password' });
      panneau.appendChild(x.fin());
      panneau.appendChild(element('p', 'bts-comptes__aide',
        'Tes mots de passe restent dans ce navigateur, chiffrés avec ce code. Ils ne sont envoyés qu\'au formulaire de connexion du forum.'));
    }

    function dessinerVerrou() {
      var x = formulaire('Déverrouiller', function () {
        ouvrir(etat.coffre, code.value).then(function (cle) {
          if (!cle) { statut.textContent = 'Code incorrect.'; return null; }
          etat.cle = cle;
          return garderCle(cle).then(function () {
            dessiner();
            statut.textContent = '';
          });
        });
      });
      var code = champ(x.f, 'Ton code', { type: 'password', name: 'code', autocomplete: 'off' });
      panneau.appendChild(x.fin());
    }

    function dessinerListe() {
      var ul = element('ul', 'bts-comptes__liste');
      etat.coffre.comptes.forEach(function (c) {
        var li = element('li');
        var actuel = etat.moi && pareil(c.nom, etat.moi);
        var choisir = element('button', 'bts-comptes__compte', c.nom);
        choisir.type = 'button';
        if (actuel) {
          choisir.appendChild(element('span', 'bts-comptes__actuel', ' · connecté·e'));
          choisir.setAttribute('aria-current', 'true');
        }
        choisir.addEventListener('click', function () {
          if (actuel) return;
          statut.textContent = 'Connexion à ' + c.nom + '…';
          dechiffrer(etat.cle, c).then(function (mdp) { return changer(c.nom, mdp, etat); }).then(function (ok) {
            if (!ok) statut.textContent = 'La connexion à ' + c.nom + ' a échoué. Vérifie son mot de passe.';
          }, function () { statut.textContent = 'Le mot de passe de ' + c.nom + ' n\'a pas pu être lu.'; });
        });
        var oubli = element('button', 'bts-comptes__oublier', 'Oublier');
        oubli.type = 'button';
        oubli.setAttribute('aria-label', 'Oublier ' + c.nom);
        oubli.addEventListener('click', function () {
          etat.coffre = oublier(etat.coffre, c.nom);
          sauver(etat.coffre);
          dessiner();
          statut.textContent = c.nom + ' est oublié sur cet appareil.';
        });
        li.appendChild(choisir);
        li.appendChild(oubli);
        ul.appendChild(li);
      });
      if (etat.coffre.comptes.length) panneau.appendChild(ul);
      else panneau.appendChild(element('p', 'bts-comptes__aide', 'Aucun compte pour l\'instant.'));

      var x = formulaire('Ajouter', function () {
        if (!pseudo.value.trim() || !mdp.value) { statut.textContent = 'Il faut le pseudo et le mot de passe.'; return; }
        var nom = pseudo.value.trim();
        ajouter(etat.coffre, etat.cle, nom, mdp.value).then(function (c) {
          etat.coffre = c;
          sauver(c);
          dessiner();
          statut.textContent = nom + ' est ajouté.';
        });
      });
      var details = element('details', 'bts-comptes__ajout');
      details.appendChild(element('summary', null, 'Ajouter un compte'));
      var liste = element('datalist');
      liste.id = 'bts-comptes-suggestions-' + (++compteur);
      (etat.suggestions || []).filter(function (s) {
        return !etat.coffre.comptes.some(function (c) { return pareil(c.nom, s); });
      }).forEach(function (s) {
        var o = document.createElement('option');
        o.value = s;
        liste.appendChild(o);
      });
      var pseudo = champ(x.f, 'Pseudo du compte', { type: 'text', name: 'pseudo', list: liste.id, autocomplete: 'off' });
      var mdp = champ(x.f, 'Son mot de passe', { type: 'password', name: 'motdepasse', autocomplete: 'off' });
      x.f.appendChild(liste);
      details.appendChild(x.fin());
      panneau.appendChild(details);

      var tout = element('button', 'bts-comptes__effacer', 'Tout effacer sur cet appareil');
      tout.type = 'button';
      tout.addEventListener('click', function () {
        if (!window.confirm('Effacer le code et tous les mots de passe enregistrés sur cet appareil ?')) return;
        effacer();
        etat.coffre = null;
        etat.cle = null;
        dessiner();
        statut.textContent = 'Tout est effacé sur cet appareil.';
      });
      panneau.appendChild(tout);
    }

    function basculer(oui) {
      panneau.hidden = !oui;
      b.setAttribute('aria-expanded', oui ? 'true' : 'false');
    }
    b.addEventListener('click', function () { basculer(panneau.hidden); });
    panneau.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { basculer(false); b.focus(); }
    });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') basculer(false);
    });
    dessiner();
    bloc.appendChild(b);
    bloc.appendChild(panneau);
    conteneur.insertBefore(bloc, conteneur.firstChild);
    return bloc;
  }

  /* ---------- tout le forum ---------- */

  function bottin(url) {
    return window.fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
      var pre = new window.DOMParser().parseFromString(html, 'text/html').getElementById('bts-bottin');
      return pre ? pre.textContent : '';
    }, function () { return ''; });
  }

  function demarrer(o) {
    o = o || {};
    var conteneur = document.getElementById('fal-compte');
    if (!conteneur || !window.crypto || !window.crypto.subtle || !window.fetch) return Promise.resolve(false);
    if (document.readyState === 'complete') rendreBrouillon();
    else window.addEventListener('load', rendreBrouillon);
    var u = window._userdata;
    var connecte = u && Number(u.session_logged_in);
    var coffre = lire();
    if (!connecte && !(coffre && coffre.comptes.length)) return Promise.resolve(false);
    var moi = connecte ? u.username : '';
    var suggestions = connecte && o.bottin ? bottin(o.bottin).then(function (t) { return comptesDuBottin(t, moi); }) : Promise.resolve([]);
    return Promise.all([cleDeSession(), suggestions]).then(function (r) {
      monter(conteneur, { coffre: coffre, cle: r[0], moi: moi, suggestions: r[1] });
      return true;
    });
  }

  var api = {
    ITERATIONS: 200000,
    creerCoffre: creerCoffre, ouvrir: ouvrir, chiffrer: chiffrer, dechiffrer: dechiffrer, ajouter: ajouter, oublier: oublier,
    lire: lire, sauver: sauver, effacer: effacer, garderCle: garderCle, cleDeSession: cleDeSession,
    comptesDuBottin: comptesDuBottin, garderBrouillon: garderBrouillon, rendreBrouillon: rendreBrouillon,
    changer: changer, monter: monter, demarrer: demarrer,
  };
  window.BTSComptes = api;
})(window, document);
