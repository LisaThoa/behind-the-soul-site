/* Behind the Soul — les ondes : SMS et chatrooms en jeu.
 * Deux sections RP déclarées dans la config (« ondes ») : « Téléphones » (un sujet = une conversation SMS)
 * et « Chatrooms » (un sujet = un salon). Ce sont des RP comme les autres ; seul l'affichage change.
 * Une ligne du message = une bulle ; une ligne *entre astérisques* = une note de narration.
 * Le texte brut reste dans la page (caché) : l'édition, la citation et le signalement ne changent pas.
 * La zone d'envoi passe par la réponse rapide de Forumactif. */
(function (window, document) {
  'use strict';

  var compteur = 0;

  function pareil(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }

  function chemin(href) {
    try { return new URL(href, window.location.href).pathname; } catch (e) { return ''; }
  }

  function element(nom, classe, contenu) {
    var e = document.createElement(nom);
    if (classe) e.className = classe;
    if (contenu != null) e.textContent = contenu;
    return e;
  }

  /* ---------- lire ---------- */

  function lignes(bloc) {
    var copie = bloc.cloneNode(true);
    [].forEach.call(copie.querySelectorAll('br'), function (br) {
      br.parentNode.replaceChild(document.createTextNode('\n'), br);
    });
    return copie.textContent.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var note = l.match(/^\*(.+)\*$/);
      return note ? { type: 'note', texte: note[1].trim() } : { type: 'msg', texte: l };
    });
  }

  function typeDuSujet(liens, config) {
    var ondes = (config && config.ondes) || [];
    var trouve = null;
    liens.forEach(function (href) {
      var m = chemin(href).match(/^\/f(\d+)-/);
      if (!m) return;
      ondes.forEach(function (o) { if (String(o.forum) === m[1]) trouve = o.type; });
    });
    return trouve;
  }

  function messages(doc) {
    return [].filter.call(doc.querySelectorAll('article.fal-message'), function (a) {
      return a.querySelector('.postbody .content > div');
    }).map(function (a) {
      var nom = a.querySelector('.bts-mini__nom a, .bts-mini__nom');
      return { article: a, auteur: nom ? nom.textContent.trim() : '', bloc: a.querySelector('.postbody .content > div') };
    });
  }

  /* ---------- afficher ---------- */

  function barre(doc, texte) {
    var fil = doc.querySelector('.fal-messages');
    var b = element('div', 'bts-ondes__barre', texte);
    fil.parentNode.insertBefore(b, fil);
  }

  function rendre(m, contenu) {
    m.bloc.hidden = true;
    var ancien = m.bloc.parentNode.querySelector('.bts-ondes__rendu');
    if (ancien) ancien.parentNode.removeChild(ancien);
    m.bloc.parentNode.insertBefore(contenu, m.bloc.nextSibling);
  }

  function monterSms(doc, liste, moi) {
    var participe = liste.some(function (m) { return pareil(m.auteur, moi); });
    var droite = participe ? moi : (liste[0] ? liste[0].auteur : '');
    var contacts = [];
    liste.forEach(function (m) {
      var aDroite = pareil(m.auteur, droite);
      if (!aDroite && contacts.indexOf(m.auteur) === -1) contacts.push(m.auteur);
      m.article.classList.add('bts-ondes__message', aDroite ? 'bts-ondes__message--droite' : 'bts-ondes__message--gauche');
      var rendu = element('div', 'bts-ondes__rendu');
      lignes(m.bloc).forEach(function (l) {
        rendu.appendChild(element('p', l.type === 'note' ? 'bts-ondes__note' : 'bts-ondes__bulle', l.texte));
      });
      rendre(m, rendu);
    });
    barre(doc, contacts.join(', ') || droite);
  }

  function monterChat(doc, liste) {
    var entres = [];
    liste.forEach(function (m) {
      m.article.classList.add('bts-ondes__message');
      var rendu = element('div', 'bts-ondes__rendu');
      if (!entres.some(function (x) { return pareil(x, m.auteur); })) {
        entres.push(m.auteur);
        rendu.appendChild(element('p', 'bts-ondes__systeme', '*** ' + m.auteur + ' entre dans le salon'));
      }
      lignes(m.bloc).forEach(function (l) {
        rendu.appendChild(l.type === 'note' ? element('p', 'bts-ondes__note', l.texte)
          : element('p', 'bts-ondes__ligne', '<' + m.auteur + '> ' + l.texte));
      });
      rendre(m, rendu);
    });
    var titre = doc.querySelector('h1');
    barre(doc, 'Salon : ' + (titre ? titre.textContent.trim() : ''));
  }

  /* ---------- envoyer ---------- */

  function reponseRapide(doc) {
    var f = doc.querySelector('.fal-reponse-rapide form');
    var zone = f && f.querySelector('textarea[name="message"]');
    return zone ? { form: f, zone: zone } : null;
  }

  function envoyer(rapide, texte) {
    var instance = null;
    try {
      if (window.jQuery && window.jQuery(rapide.zone).sceditor) instance = window.jQuery(rapide.zone).sceditor('instance');
    } catch (e) { instance = null; }
    if (instance && instance.val) instance.val(texte);
    rapide.zone.value = texte;
    var bouton = rapide.form.querySelector('[type="submit"][name="post"], [type="submit"]');
    if (bouton) bouton.click();
    else rapide.form.submit();
  }

  function zoneEnvoi(doc, type) {
    var rapide = reponseRapide(doc);
    if (!rapide) return null;
    var f = element('form', 'bts-ondes__envoi');
    var id = 'bts-ondes-zone-' + (++compteur);
    var label = element('label', 'bts-ondes__etiquette', type === 'sms' ? 'Écrire un SMS (une ligne = un SMS)' : 'Écrire dans le salon (une ligne = un message)');
    label.htmlFor = id;
    var zone = element('textarea');
    zone.id = id;
    zone.rows = 2;
    var b = element('button', 'bts-ondes__envoyer', 'Envoyer');
    b.type = 'submit';
    function partir() {
      var texte = zone.value.replace(/\s+$/, '');
      if (!texte.trim()) return;
      envoyer(rapide, texte);
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      partir();
    });
    zone.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      partir();
    });
    f.appendChild(label);
    f.appendChild(zone);
    f.appendChild(b);
    var fil = doc.querySelector('.fal-messages');
    fil.parentNode.insertBefore(f, fil.nextSibling);
    return f;
  }

  function monter(doc, type, o) {
    var liste = messages(doc);
    doc.documentElement.classList.add('bts-ondes--' + type);
    if (type === 'sms') monterSms(doc, liste, (o && o.moi) || '');
    else monterChat(doc, liste);
    zoneEnvoi(doc, type);
    return true;
  }

  function demarrer(o) {
    var fil = [].map.call(document.querySelectorAll('.fal-fil a[href]'), function (a) { return a.getAttribute('href'); });
    var type = typeDuSujet(fil, o && o.config);
    if (!type || !document.querySelector('.fal-messages')) return false;
    var u = window._userdata;
    return monter(document, type, { moi: u && Number(u.session_logged_in) ? u.username : '' });
  }

  window.BTSOndes = { lignes: lignes, typeDuSujet: typeDuSujet, monter: monter, demarrer: demarrer };
})(window, document);
