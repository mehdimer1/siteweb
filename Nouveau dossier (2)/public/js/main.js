(function () {
  'use strict';

  var config = null;
  var slots = [];
  var selectedTime = null;
  var selectedDate = null;

  var $ = function (id) { return document.getElementById(id); };

  var WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function prettyDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatPrice(amount, currency) {
    return amount.toLocaleString('fr-FR') + ' ' + currency;
  }

  function formatDuration(d) {
    if (d === 1) return '1 heure';
    if (d === 1.5) return '1h30';
    return d + ' heures';
  }

  function formatDurationShort(d) {
    if (d === 1) return '1h';
    if (d === 1.5) return '1h30';
    return d + 'h';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showToast(message, ok) {
    var toast = $('toast');
    toast.textContent = message;
    toast.className = 'toast' + (ok ? ' ok' : '');
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 4500);
  }

  function showClubToast(message, ok) {
    var toast = $('club-toast');
    toast.textContent = message;
    toast.className = 'toast' + (ok ? ' ok' : '');
    toast.hidden = false;
    clearTimeout(showClubToast._t);
    showClubToast._t = setTimeout(function () { toast.hidden = true; }, 4500);
    window.scrollTo({ top: $('club').offsetTop - 80, behavior: 'smooth' });
  }

  function showClubToastHtml(html, ok) {
    var toast = $('club-toast');
    toast.innerHTML = html;
    toast.className = 'toast' + (ok ? ' ok' : '');
    toast.hidden = false;
    clearTimeout(showClubToast._t);
    showClubToast._t = setTimeout(function () { toast.hidden = true; }, 12000);
    window.scrollTo({ top: $('club').offsetTop - 80, behavior: 'smooth' });
  }

  function init() {
    config = Store.getPublicConfig();

    $('year').textContent = new Date().getFullYear();
    $('hero-address').textContent = config.address;
    $('contact-line').textContent = config.phone + ' \u00b7 ' + config.address;
    $('price-line').textContent = 'De 160 \u00e0 270 DH / heure selon le cr\u00e9neau';

    var dateInput = $('date-input');
    dateInput.min = Store.todayStr();
    dateInput.max = Store.addDays(Store.todayStr(), config.maxAdvanceDays);
    dateInput.value = Store.todayStr();
    dateInput.addEventListener('change', function () { loadSlots(dateInput.value); });

    $('terrain-select').addEventListener('change', updateSummary);
    $('duration-select').addEventListener('change', updateSummary);

    $('submit-btn').addEventListener('click', submitReservation);
    $('modal-close').addEventListener('click', function () {
      $('success-modal').hidden = true;
    });

    /* ---- Club Tabs ---- */
    document.querySelectorAll('.club-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.club-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.club-panel').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        $(tab.dataset.tab).classList.add('active');
      });
    });

    /* ---- Joueur payment toggle ---- */
    document.querySelectorAll('input[name="joueur-payment"]').forEach(function (r) {
      r.addEventListener('change', function () {
        $('joueur-price-field').classList.toggle('hidden', r.value !== 'Oui');
      });
    });

    var minDate = Store.todayStr();
    $('match-date').min = minDate;
    $('joueur-date').min = minDate;

    /* ---- Form: Inscription enfant ---- */
    $('form-inscription').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('insc-name').value.trim();
      var dob = $('insc-dob').value;
      var parent = $('insc-parent').value.trim();
      var phone = $('insc-phone').value.trim();
      var email = $('insc-email').value.trim();

      if (!name || name.length < 2) return showClubToast('Veuillez saisir le nom de l\u2019enfant.', false);
      if (!dob) return showClubToast('Veuillez saisir la date de naissance.', false);
      if (!parent || parent.length < 2) return showClubToast('Veuillez saisir le nom du parent.', false);
      if (!phone || phone.replace(/[\s\-().+]/g, '').length < 8) return showClubToast('Num\u00e9ro de t\u00e9l\u00e9phone invalide.', false);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showClubToast('Adresse email invalide.', false);

      var btn = $('insc-submit');
      btn.disabled = true;
      btn.textContent = 'Envoi\u2026';

      var result = Store.submitClubForm('inscription', {
        childName: name,
        dateOfBirth: dob,
        categorie: $('insc-categorie').value,
        parentName: parent,
        phone: phone,
        email: email,
        notes: $('insc-notes').value.trim()
      });

      btn.disabled = false;
      btn.textContent = 'Envoyer l\u2019inscription';

      if (result.error) return showClubToast(result.error, false);
      $('form-inscription').reset();
      showClubToast('Inscription envoy\u00e9e avec succ\u00e8s ! Vous serez contact\u00e9 par le club.', true);
    });

    /* ---- Form: Trouver equipe adverse ---- */
    $('form-match').addEventListener('submit', function (e) {
      e.preventDefault();
      var team = $('match-team').value.trim();
      var categorie = $('match-categorie').value;
      var date = $('match-date').value;
      var hour = $('match-hour').value;
      var matchType = $('match-type').value;
      var contact = $('match-contact').value.trim();

      if (!team || team.length < 2) return showClubToast('Veuillez saisir le nom de l\u2019\u00e9quipe.', false);
      if (!categorie) return showClubToast('Veuillez choisir la cat\u00e9gorie / niveau.', false);
      if (!date) return showClubToast('Veuillez choisir une date.', false);
      if (!hour) return showClubToast('Veuillez choisir une heure.', false);
      if (!matchType) return showClubToast('Veuillez choisir le type de match.', false);
      if (!contact || contact.replace(/[\s\-().+]/g, '').length < 8) return showClubToast('Num\u00e9ro WhatsApp / t\u00e9l\u00e9phone invalide.', false);

      var btn = $('match-submit');
      btn.disabled = true;
      btn.textContent = 'Envoi\u2026';

      var result = Store.submitClubForm('match', {
        teamName: team,
        categorie: categorie,
        date: date,
        hour: hour,
        matchType: matchType,
        notes: $('match-notes').value.trim(),
        contact: contact,
        ville: 'Oujda'
      });

      btn.disabled = false;
      btn.textContent = 'Publier ma demande';

      if (result.error) return showClubToast(result.error, false);
      $('form-match').reset();

      var phone = config.phone.replace(/[^0-9]/g, '');
      var msg = 'Bonjour, je cherche une \u00e9quipe adverse. \u00c9quipe : ' + team +
        ', cat\u00e9gorie : ' + categorie +
        ', date : ' + prettyDate(date) +
        ', heure : ' + hour +
        ', type : ' + matchType + '.';
      showClubToastHtml(
        '<strong>Demande envoy\u00e9e !</strong><br>' +
        'Votre demande a bien \u00e9t\u00e9 re\u00e7ue. Le club va v\u00e9rifier les possibilit\u00e9s et vous contacter pour la suite.<br>' +
        '<a href="https://wa.me/' + phone + '?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener" class="btn btn-whatsapp" style="margin-top:12px;display:inline-flex;">Contacter le club</a>',
        true
      );
    });

    /* ---- Form: Je cherche un joueur ---- */
    $('form-joueur').addEventListener('submit', function (e) {
      e.preventDefault();
      var team = $('joueur-team').value.trim();
      var categorie = $('joueur-categorie').value;
      var type = $('joueur-type').value;
      var count = $('joueur-count').value;
      var date = $('joueur-date').value;
      var hour = $('joueur-hour').value;
      var payment = document.querySelector('input[name="joueur-payment"]:checked').value;
      var price = payment === 'Oui' ? $('joueur-price').value.trim() : '';
      var contact = $('joueur-contact').value.trim();

      if (!team || team.length < 2) return showClubToast('Veuillez saisir le nom de l\u2019\u00e9quipe.', false);
      if (!categorie) return showClubToast('Veuillez choisir la cat\u00e9gorie / niveau.', false);
      if (!type) return showClubToast('Veuillez choisir le type de joueur recherch\u00e9.', false);
      if (!count || parseInt(count, 10) < 1) return showClubToast('Veuillez saisir le nombre de joueurs recherch\u00e9s.', false);
      if (!date) return showClubToast('Veuillez choisir la date du match.', false);
      if (!hour) return showClubToast('Veuillez choisir l\u2019heure du match.', false);
      if (payment === 'Oui' && !price) return showClubToast('Veuillez saisir le montant demand\u00e9.', false);
      if (!contact || contact.replace(/[\s\-().+]/g, '').length < 8) return showClubToast('Num\u00e9ro WhatsApp / t\u00e9l\u00e9phone invalide.', false);

      var btn = $('joueur-submit');
      btn.disabled = true;
      btn.textContent = 'Envoi\u2026';

      var result = Store.submitClubForm('joueur', {
        teamName: team,
        categorie: categorie,
        playerType: type,
        count: count,
        date: date,
        hour: hour,
        payment: payment,
        price: price,
        notes: $('joueur-notes').value.trim(),
        contact: contact,
        ville: 'Oujda'
      });

      btn.disabled = false;
      btn.textContent = 'Publier ma recherche';

      if (result.error) return showClubToast(result.error, false);
      $('form-joueur').reset();
      $('joueur-price-field').classList.add('hidden');

      var phone = config.phone.replace(/[^0-9]/g, '');
      var msg = 'Bonjour, je cherche un joueur. \u00c9quipe : ' + team +
        ', cat\u00e9gorie : ' + categorie +
        ', recherche : ' + type +
        ', date : ' + prettyDate(date) +
        ', heure : ' + hour + '.';
      showClubToastHtml(
        '<strong>Recherche envoy\u00e9e !</strong><br>' +
        'Votre recherche a bien \u00e9t\u00e9 re\u00e7ue. Le club va prendre connaissance de votre demande et vous contacter pour la suite.<br>' +
        '<a href="https://wa.me/' + phone + '?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener" class="btn btn-whatsapp" style="margin-top:12px;display:inline-flex;">Contacter le club</a>',
        true
      );
    });

    loadSlots(dateInput.value);

    /* ---- Hamburger menu ---- */
    var navToggle = $('nav-toggle');
    var navMenu = $('nav-menu');
    if (navToggle && navMenu) {
      navToggle.addEventListener('click', function () {
        var open = navMenu.classList.toggle('open');
        navToggle.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', open);
      });
      navMenu.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          navMenu.classList.remove('open');
          navToggle.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  function loadSlots(date) {
    selectedDate = date;
    selectedTime = null;
    $('date-label').textContent = prettyDate(date);
    $('date-label').textContent += date === Store.todayStr() ? ' (aujourd\u2019hui)' : '';
    $('sum-slot').textContent = '\u2014';
    $('sum-terrain').textContent = '\u2014';
    $('sum-price').textContent = '\u2014';
    $('submit-btn').disabled = true;

    var grid = $('slot-grid');
    grid.innerHTML = '<div class="slot-loading">Chargement des cr\u00e9neaux\u2026</div>';
    $('slot-hint').textContent = '';

    var data = Store.getSlots(date);
    if (data.error) {
      grid.innerHTML = '';
      showToast(data.error, false);
      return;
    }
    slots = data.slots;
    renderSlots(slots);
  }

  function renderSlots(list) {
    var grid = $('slot-grid');
    grid.innerHTML = '';
    var available = list.filter(function (s) { return s.available; }).length;

    list.forEach(function (slot) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot';
      btn.dataset.time = slot.time;

      var state = 'Disponible';
      if (slot.reserved) {
        btn.disabled = true;
        btn.classList.add('reserved');
        state = 'R\u00e9serv\u00e9';
      } else if (slot.past) {
        btn.disabled = true;
        btn.classList.add('past');
        state = 'Pass\u00e9';
      }

      var labelSpan = document.createElement('span');
      labelSpan.textContent = slot.label;
      var subSpan = document.createElement('span');
      subSpan.className = 'slot-sub';
      subSpan.textContent = slot.available ? slot.price + ' ' + config.currency : state;
      btn.appendChild(labelSpan);
      btn.appendChild(subSpan);
      btn.addEventListener('click', function () { selectSlot(slot.time); });
      grid.appendChild(btn);
    });

    $('slot-hint').textContent = available > 0
      ? available + ' cr\u00e9neau' + (available > 1 ? 'x' : '') + ' disponible' + (available > 1 ? 's' : '') + ' pour cette journ\u00e9e.'
      : 'Aucun cr\u00e9neau disponible pour cette journ\u00e9e.';
  }

  function selectSlot(time) {
    if (time === selectedTime) return;
    selectedTime = time;
    document.querySelectorAll('.slot.selected').forEach(function (el) { el.classList.remove('selected'); });
    var btn = document.querySelector('.slot[data-time="' + parseInt(time, 10) + '"]');
    if (btn) btn.classList.add('selected');
    updateSummary();
    $('submit-btn').disabled = false;
    window.scrollTo({ top: $('summary').offsetTop - 160, behavior: 'smooth' });
  }

  function updateSummary() {
    if (selectedTime === null) return;
    var slot = slots.find(function (s) { return s.time === selectedTime; });
    if (!slot) return;

    var terrain = $('terrain-select').value;
    var duration = parseFloat($('duration-select').value) || 1;
    var totalPrice = slot.price * duration;

    $('sum-slot').textContent = prettyDate(selectedDate) + ' \u00b7 ' + slot.label;
    $('sum-terrain').textContent = terrain + ' \u00b7 ' + formatDuration(duration);
    $('sum-price').textContent = formatPrice(totalPrice, config.currency);
  }

  function validateForm() {
    var name = $('name').value.trim();
    var phone = $('phone').value.trim();

    if (name.length < 2) return 'Veuillez saisir votre nom complet.';
    if (!phone) return 'Veuillez saisir votre num\u00e9ro de t\u00e9l\u00e9phone.';
    if (phone.replace(/[\s\-().+]/g, '').length < 8) return 'Le num\u00e9ro de t\u00e9l\u00e9phone semble invalide.';
    return null;
  }

  function submitReservation() {
    if (selectedTime === null) return;

    var error = validateForm();
    if (error) {
      showToast(error, false);
      return;
    }

    var btn = $('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Enregistrement\u2026';

    var result = Store.createReservation({
      date: selectedDate,
      time: selectedTime,
      terrain: $('terrain-select').value,
      duration: $('duration-select').value,
      name: $('name').value.trim(),
      phone: $('phone').value.trim(),
      notes: $('notes').value.trim()
    });

    if (result.error) {
      showToast(result.error, false);
      btn.disabled = false;
      btn.textContent = 'Demander cette r\u00e9servation';
      loadSlots(selectedDate);
      return;
    }

    var r = result.reservation;
    var slot = slots.find(function (s) { return s.time === selectedTime; });
    var price = slot ? slot.price * r.duration : r.totalPrice;

    $('res-recap').innerHTML =
      '<div class="modal-recap-grid">' +
        '<div><strong>Date :</strong> ' + escapeHtml(prettyDate(r.date)) + '</div>' +
        '<div><strong>Heure :</strong> ' + Store.pad(r.time) + ':00 \u2013 ' + Store.pad(r.time + 1) + ':00</div>' +
        '<div><strong>Terrain :</strong> ' + escapeHtml(r.terrain) + '</div>' +
        '<div><strong>Dur\u00e9e :</strong> ' + formatDuration(r.duration) + '</div>' +
        '<div><strong>Prix estim\u00e9 :</strong> ' + formatPrice(r.totalPrice, r.currency) + '</div>' +
        '<div><strong>Statut :</strong> <span class="badge badge-pending">En attente de confirmation</span></div>' +
      '</div>';

    var phone = config.phone.replace(/[^0-9]/g, '');
    var msg = 'Bonjour, je souhaite r\u00e9server le terrain ' + r.terrain +
      ' le ' + prettyDate(r.date) +
      ' \u00e0 ' + Store.pad(r.time) + ':00' +
      ' pour ' + formatDuration(r.duration) +
      '. Le montant indiqu\u00e9 est de ' + r.totalPrice + ' ' + r.currency +
      '. Pouvez-vous confirmer la disponibilit\u00e9 ?';
    $('whatsapp-btn').href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);

    $('success-modal').hidden = false;
    btn.textContent = 'Demander cette r\u00e9servation';
  }

  init();
})();
