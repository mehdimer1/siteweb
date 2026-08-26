const Store = (() => {
  'use strict';

  const KEYS = {
    config: 'foothakimi_config',
    reservations: 'foothakimi_reservations',
    adminSession: 'foothakimi_admin_session',
    formRate: 'foothakimi_form_rate'
  };

  const DEFAULT_CONFIG = {
    siteName: 'Foothakimi',
    siteSlogan: 'Réservez votre terrain en quelques secondes',
    currency: 'DH',
    pricePerHour: 200,
    openHour: 10,
    closeHour: 23,
    maxAdvanceDays: 30,
    adminPassword: 'admin123',
    phone: '+212 665-871468',
    address: 'Oujda, Maroc'
  };

  const PRICE_TIERS = [
    { minHour: 10, maxHour: 14, price: 160 },
    { minHour: 15, maxHour: 17, price: 200 },
    { minHour: 18, maxHour: 23, price: 270 }
  ];

  const SESSION_TTL = 2 * 3600 * 1000;
  const FORM_RATE_LIMIT = 5;
  const FORM_RATE_WINDOW = 15 * 60 * 1000;

  /* ---- Helpers ---- */

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayStr() {
    var d = new Date();
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function addDays(dateStr, days) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function isValidDateStr(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime());
  }

  function makeCode() {
    var bytes = new Uint8Array(3);
    crypto.getRandomValues(bytes);
    return 'FH-' + Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('').toUpperCase();
  }

  function sanitizeInput(s, maxLen) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, maxLen);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isValidEmail(s) {
    if (!s) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function getPriceForHour(hour) {
    for (var i = 0; i < PRICE_TIERS.length; i++) {
      if (hour >= PRICE_TIERS[i].minHour && hour <= PRICE_TIERS[i].maxHour) {
        return PRICE_TIERS[i].price;
      }
    }
    return 160;
  }

  function isAllowedClubs() {
    try {
      var raw = localStorage.getItem(KEYS.formRate);
      if (!raw) return true;
      var data = JSON.parse(raw);
      if (Date.now() > data.ts + FORM_RATE_WINDOW) return true;
      return data.count < FORM_RATE_LIMIT;
    } catch {
      return true;
    }
  }

  function recordFormRate() {
    try {
      var raw = localStorage.getItem(KEYS.formRate);
      var data = raw ? JSON.parse(raw) : { count: 0, ts: Date.now() };
      if (Date.now() > data.ts + FORM_RATE_WINDOW) {
        data = { count: 1, ts: Date.now() };
      } else {
        data.count++;
      }
      localStorage.setItem(KEYS.formRate, JSON.stringify(data));
    } catch {}
  }

  /* ---- Config ---- */

  function getConfig() {
    try {
      var raw = localStorage.getItem(KEYS.config);
      return Object.assign({}, DEFAULT_CONFIG, raw ? JSON.parse(raw) : {});
    } catch {
      return Object.assign({}, DEFAULT_CONFIG);
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(KEYS.config, JSON.stringify(cfg));
  }

  function getPublicConfig() {
    var c = getConfig();
    return {
      siteName: c.siteName,
      siteSlogan: c.siteSlogan,
      currency: c.currency,
      pricePerHour: c.pricePerHour,
      openHour: c.openHour,
      closeHour: c.closeHour,
      maxAdvanceDays: c.maxAdvanceDays,
      phone: c.phone,
      address: c.address,
      priceTiers: PRICE_TIERS
    };
  }

  /* ---- Reservations ---- */

  function loadReservations() {
    try {
      var raw = localStorage.getItem(KEYS.reservations);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveReservations(list) {
    localStorage.setItem(KEYS.reservations, JSON.stringify(list));
  }

  function getSlots(date, terrain) {
    var config = getConfig();
    if (!isValidDateStr(date)) return { error: 'Date invalide' };
    terrain = terrain || 'Terrain A';

    var reservations = loadReservations().filter(
      function(r) { return r.date === date && r.terrain === terrain && (r.status === 'confirmed' || r.status === 'pending'); }
    );
    var now = todayStr();
    var nowHour = new Date().getHours();
    var slots = [];
    for (var h = config.openHour; h < config.closeHour; h++) {
      var booked = reservations.find(function(r) { return r.time === h; });
      var isPast = date === now && h <= nowHour;
      slots.push({
        time: h,
        label: pad(h) + ':00 - ' + pad(h + 1),
        price: getPriceForHour(h),
        available: !booked && !isPast,
        reserved: !!booked,
        past: isPast
      });
    }
    return { date: date, slots: slots, pricePerHour: config.pricePerHour, currency: config.currency };
  }

  function createReservation(data) {
    var config = getConfig();
    var date = sanitizeInput(data.date, 10);
    var time = parseInt(data.time, 10);
    var name = sanitizeInput(data.name, 100);
    var phone = sanitizeInput(data.phone, 20);
    var notes = sanitizeInput(data.notes, 500);
    var terrain = sanitizeInput(data.terrain, 100) || 'Terrain Principal';
    var duration = parseFloat(data.duration) || 1;

    if (!isValidDateStr(date)) return { error: 'La date choisie est invalide.' };
    if (date < todayStr() || date > addDays(todayStr(), config.maxAdvanceDays)) {
      return { error: 'La date doit être comprise entre aujourd\'hui et ' + config.maxAdvanceDays + ' jours.' };
    }
    if (!Number.isInteger(time) || time < config.openHour || time >= config.closeHour) {
      return { error: 'L\'heure choisie est invalide.' };
    }
    if (date === todayStr() && time <= new Date().getHours()) {
      return { error: 'Cette heure est déjà passée. Choisissez une heure future.' };
    }
    if (duration !== 1 && duration !== 1.5 && duration !== 2) {
      return { error: 'La durée choisie est invalide.' };
    }
    if (!name || name.length < 2) {
      return { error: 'Veuillez saisir votre nom complet.' };
    }
    if (!/^[a-zA-Z\u00C0-\u024F\s\-']+$/.test(name)) {
      return { error: 'Le nom ne doit contenir que des lettres, espaces, tirets ou apostrophes.' };
    }
    if (!phone) {
      return { error: 'Veuillez saisir votre numéro de téléphone.' };
    }
    if (phone.replace(/[\s\-().+]/g, '').length < 8) {
      return { error: 'Le numéro de téléphone semble invalide.' };
    }

    var reservations = loadReservations();
    var conflict = reservations.find(
      function(r) {
        return r.date === date && r.time === time && r.terrain === terrain &&
          (r.status === 'confirmed' || r.status === 'pending');
      }
    );
    if (conflict) {
      return { error: 'Cet horaire vient d\'être réservé par un autre client. Choisissez un autre créneau.' };
    }

    var pricePerHour = getPriceForHour(time);
    var reservation = {
      id: makeCode(),
      date: date,
      time: time,
      terrain: terrain,
      duration: duration,
      name: name,
      phone: phone,
      notes: notes || null,
      pricePerHour: pricePerHour,
      totalPrice: pricePerHour * duration,
      currency: config.currency,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    reservations.push(reservation);
    saveReservations(reservations);
    return { ok: true, reservation: reservation };
  }

  function confirmReservation(id) {
    var reservations = loadReservations();
    var r = reservations.find(function(r) { return r.id === id; });
    if (!r) return { error: 'Réservation introuvable.' };
    if (r.status !== 'pending') return { error: 'Cette réservation ne peut plus être modifiée.' };
    r.status = 'confirmed';
    r.confirmedAt = new Date().toISOString();
    saveReservations(reservations);
    return { ok: true, reservation: r };
  }

  function rejectReservation(id) {
    var reservations = loadReservations();
    var r = reservations.find(function(r) { return r.id === id; });
    if (!r) return { error: 'Réservation introuvable.' };
    if (r.status !== 'pending') return { error: 'Cette réservation ne peut plus être modifiée.' };
    r.status = 'rejected';
    r.rejectedAt = new Date().toISOString();
    saveReservations(reservations);
    return { ok: true, reservation: r };
  }

  function deleteReservation(id) {
    var reservations = loadReservations();
    var index = reservations.findIndex(function(r) { return r.id === id; });
    if (index === -1) return { error: 'Réservation introuvable.' };
    var removed = reservations.splice(index, 1)[0];
    saveReservations(reservations);
    return { ok: true, removed: removed };
  }

  function getAdminReservations(filters) {
    var list = loadReservations();
    if (filters && filters.date) list = list.filter(function(r) { return r.date === filters.date; });
    if (filters && filters.status) list = list.filter(function(r) { return r.status === filters.status; });
    list.sort(function(a, b) { return (a.date + String(a.time)).localeCompare(b.date + String(b.time)); });
    return list;
  }

  function getStats() {
    var config = getConfig();
    var reservations = loadReservations();
    var now = todayStr();
    var tomorrow = addDays(now, 1);
    var weekEnd = addDays(now, 7);
    var confirmed = reservations.filter(function(r) { return r.status === 'confirmed'; });
    var pending = reservations.filter(function(r) { return r.status === 'pending'; });
    return {
      total: confirmed.length,
      pending: pending.length,
      today: confirmed.filter(function(r) { return r.date === now; }).length,
      tomorrow: confirmed.filter(function(r) { return r.date === tomorrow; }).length,
      thisWeek: confirmed.filter(function(r) { return r.date >= now && r.date <= weekEnd; }).length,
      revenue: confirmed.reduce(function(sum, r) { return sum + (r.totalPrice || r.pricePerHour || 0); }, 0),
      currency: config.currency
    };
  }

  /* ---- Club Forms ---- */

  function loadClubForms(type) {
    try {
      var raw = localStorage.getItem('foothakimi_club_' + type);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveClubForms(type, list) {
    localStorage.setItem('foothakimi_club_' + type, JSON.stringify(list));
  }

  function submitClubForm(type, data) {
    if (!isAllowedClubs()) {
      return { error: 'Trop de soumissions. Réessayez dans 15 minutes.' };
    }
    var clean = {};
    for (var k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        clean[k] = sanitizeInput(String(data[k]), 500);
      }
    }
    if (clean.email && !isValidEmail(clean.email)) {
      return { error: 'Adresse email invalide.' };
    }
    clean.id = makeCode();
    clean.createdAt = new Date().toISOString();
    clean.type = type;
    var list = loadClubForms(type);
    list.push(clean);
    saveClubForms(type, list);
    recordFormRate();
    return { ok: true, id: clean.id };
  }

  function getClubForms(type) {
    return loadClubForms(type);
  }

  function deleteClubForm(type, id) {
    var list = loadClubForms(type);
    var idx = list.findIndex(function(f) { return f.id === id; });
    if (idx === -1) return { error: 'Introuvable.' };
    var removed = list.splice(idx, 1)[0];
    saveClubForms(type, list);
    return { ok: true, removed: removed };
  }

  function getClubStats() {
    return {
      inscriptions: loadClubForms('inscription').length,
      matchs: loadClubForms('match').length,
      joueurs: loadClubForms('joueur').length
    };
  }

  /* ---- Auth ---- */

  function login(password) {
    var config = getConfig();
    if (typeof password !== 'string' || password !== config.adminPassword) {
      return { error: 'Mot de passe incorrect.' };
    }
    var token = makeCode() + makeCode();
    var session = { token: token, expires: Date.now() + SESSION_TTL };
    localStorage.setItem(KEYS.adminSession, JSON.stringify(session));
    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(KEYS.adminSession);
  }

  function isLoggedIn() {
    try {
      var raw = localStorage.getItem(KEYS.adminSession);
      if (!raw) return false;
      var session = JSON.parse(raw);
      if (Date.now() > session.expires) {
        localStorage.removeItem(KEYS.adminSession);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  return {
    todayStr: todayStr,
    addDays: addDays,
    isValidDateStr: isValidDateStr,
    makeCode: makeCode,
    sanitizeInput: sanitizeInput,
    escapeHtml: escapeHtml,
    pad: pad,
    getPriceForHour: getPriceForHour,
    getConfig: getConfig,
    saveConfig: saveConfig,
    getPublicConfig: getPublicConfig,
    loadReservations: loadReservations,
    saveReservations: saveReservations,
    getSlots: getSlots,
    createReservation: createReservation,
    confirmReservation: confirmReservation,
    rejectReservation: rejectReservation,
    deleteReservation: deleteReservation,
    getAdminReservations: getAdminReservations,
    getStats: getStats,
    getClubStats: getClubStats,
    submitClubForm: submitClubForm,
    getClubForms: getClubForms,
    deleteClubForm: deleteClubForm,
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn
  };
})();
