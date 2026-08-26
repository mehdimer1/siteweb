(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var allReservations = [];

  var WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  function prettyDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateTime(iso) {
    if (!iso) return '\u2014';
    var d = new Date(iso);
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16).replace('T', ' ');
  }

  function formatPrice(amount, currency) {
    return (amount || 0).toLocaleString('fr-FR') + ' ' + (currency || '');
  }

  function formatDuration(d) {
    if (d === 1) return '1h';
    if (d === 1.5) return '1h30';
    return d + 'h';
  }

  function showToast(message, ok) {
    var toast = $('toast');
    toast.textContent = message;
    toast.className = 'toast' + (ok ? ' ok' : '');
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 4000);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function login() {
    var password = $('login-password').value;
    var btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = 'Connexion\u2026';

    var result = Store.login(password);
    if (result.error) {
      showToast(result.error, false);
    } else {
      showDashboard();
    }

    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }

  function logout(showMsg) {
    Store.logout();
    $('login-view').classList.remove('hidden');
    $('dashboard-view').classList.add('hidden');
    $('logout-btn').classList.add('hidden');
    $('login-password').value = '';
    if (showMsg !== false) showToast('Vous \u00eates d\u00e9connect\u00e9.', true);
  }

  function showDashboard() {
    $('login-view').classList.add('hidden');
    $('dashboard-view').classList.remove('hidden');
    $('logout-btn').classList.remove('hidden');
    $('filter-date').value = '';
    $('filter-status').value = '';
    $('search-input').value = '';
    loadAll();
  }

  function loadAll() {
    allReservations = Store.getAdminReservations();
    renderStats(Store.getStats());
    renderTable();
    renderInscriptions();
    renderMatchs();
    renderJoueurs();
  }

  function renderStats(stats) {
    var club = Store.getClubStats();
    var grid = $('stats-grid');
    var cards = [
      { num: stats.total, label: 'Confirm\u00e9es' },
      { num: stats.pending, label: 'En attente' },
      { num: stats.today, label: 'Aujourd\u2019hui' },
      { num: stats.thisWeek, label: 'Prochains 7 jours' },
      { num: formatPrice(stats.revenue, stats.currency), label: 'Revenus estim\u00e9s' },
      { num: club.inscriptions, label: 'Inscriptions enfants' },
      { num: club.matchs, label: 'Demandes de match' },
      { num: club.joueurs, label: 'Recherche joueurs' }
    ];
    grid.innerHTML = cards.map(function (c) {
      return '<div class="stat-card"><div class="stat-num">' + c.num + '</div><div class="stat-label">' + c.label + '</div></div>';
    }).join('');
  }

  function filtered() {
    var dateFilter = $('filter-date').value;
    var statusFilter = $('filter-status').value;
    var search = $('search-input').value.trim().toLowerCase();
    var list = allReservations;
    if (dateFilter) list = list.filter(function (r) { return r.date === dateFilter; });
    if (statusFilter) list = list.filter(function (r) { return r.status === statusFilter; });
    if (search) {
      list = list.filter(function (r) {
        return (r.name || '').toLowerCase().includes(search) ||
          (r.phone || '').toLowerCase().includes(search);
      });
    }
    return list;
  }

  function statusBadge(status) {
    if (status === 'pending') return '<span class="badge badge-pending">En attente</span>';
    if (status === 'confirmed') return '<span class="badge badge-confirmed">Confirm\u00e9e</span>';
    if (status === 'rejected') return '<span class="badge badge-rejected">Refus\u00e9e</span>';
    return escapeHtml(status);
  }

  function renderTable() {
    var tbody = $('res-tbody');
    var list = filtered();

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12"><div class="empty-state">Aucune r\u00e9servation trouv\u00e9e.</div></td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function (r) {
      var actions = '';
      if (r.status === 'pending') {
        actions =
          '<button class="btn btn-confirm btn-sm" data-action="confirm" data-id="' + escapeAttr(r.id) + '">Accepter</button> ' +
          '<button class="btn btn-danger btn-sm" data-action="reject" data-id="' + escapeAttr(r.id) + '">Refuser</button>';
      } else {
        actions = '\u2014';
      }
      return '<tr>' +
        '<td><strong style="color:var(--lime);">' + escapeHtml(r.id) + '</strong></td>' +
        '<td>' + statusBadge(r.status) + '</td>' +
        '<td>' + prettyDate(r.date) + '</td>' +
        '<td>' + Store.pad(r.time) + ':00 - ' + Store.pad(r.time + 1) + ':00</td>' +
        '<td>' + escapeHtml(r.terrain || '\u2014') + '</td>' +
        '<td>' + formatDuration(r.duration || 1) + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td>' + escapeHtml(r.phone) + '</td>' +
        '<td>' + formatPrice(r.totalPrice || r.pricePerHour, r.currency) + '</td>' +
        '<td class="notes-cell">' + (r.notes ? escapeHtml(r.notes) : '\u2014') + '</td>' +
        '<td>' + fmtDateTime(r.createdAt) + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.dataset.action;
        var id = btn.dataset.id;
        if (action === 'confirm') confirmRes(id);
        else if (action === 'reject') rejectRes(id);
      });
    });
  }

  function confirmRes(id) {
    var r = allReservations.find(function (r) { return r.id === id; });
    if (!r) return;
    if (!confirm('Confirmer la r\u00e9servation de "' + r.name + '" (' + id + ') ?')) return;
    var result = Store.confirmReservation(id);
    if (result.error) return showToast(result.error, false);
    showToast('R\u00e9servation ' + id + ' confirm\u00e9e.', true);
    loadAll();
  }

  function rejectRes(id) {
    var r = allReservations.find(function (r) { return r.id === id; });
    if (!r) return;
    if (!confirm('Refuser la r\u00e9servation de "' + r.name + '" (' + id + ') ?')) return;
    var result = Store.rejectReservation(id);
    if (result.error) return showToast(result.error, false);
    showToast('R\u00e9servation ' + id + ' refus\u00e9e.', true);
    loadAll();
  }

  function renderInscriptions() {
    var tbody = $('insc-tbody');
    var list = Store.getClubForms('inscription');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state">Aucune inscription.</div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (r) {
      return '<tr>' +
        '<td><strong style="color:var(--lime);">' + escapeHtml(r.id) + '</strong></td>' +
        '<td>' + escapeHtml(r.childName) + '</td>' +
        '<td>' + escapeHtml(r.dateOfBirth) + '</td>' +
        '<td>' + escapeHtml(r.categorie) + '</td>' +
        '<td>' + escapeHtml(r.parentName) + '</td>' +
        '<td>' + escapeHtml(r.phone) + '</td>' +
        '<td>' + escapeHtml(r.email) + '</td>' +
        '<td class="notes-cell">' + (r.notes ? escapeHtml(r.notes) : '\u2014') + '</td>' +
        '<td>' + fmtDateTime(r.createdAt) + '</td>' +
        '<td><button class="btn btn-danger btn-sm" data-type="inscription" data-id="' + escapeAttr(r.id) + '" data-name="' + escapeAttr(r.childName) + '">Supprimer</button></td>' +
        '</tr>';
    }).join('');
    tbody.querySelectorAll('[data-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeItem(btn.dataset.type, btn.dataset.id, btn.dataset.name); });
    });
  }

  function renderMatchs() {
    var tbody = $('match-tbody');
    var list = Store.getClubForms('match');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state">Aucune demande de match.</div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (r) {
      return '<tr>' +
        '<td><strong style="color:var(--lime);">' + escapeHtml(r.id) + '</strong></td>' +
        '<td>' + escapeHtml(r.teamName) + '</td>' +
        '<td>' + escapeHtml(r.categorie || '\u2014') + '</td>' +
        '<td>' + escapeHtml(r.date) + '</td>' +
        '<td>' + escapeHtml(r.hour || '\u2014') + '</td>' +
        '<td>' + escapeHtml(r.matchType || '\u2014') + '</td>' +
        '<td>' + escapeHtml(r.contact) + '</td>' +
        '<td class="notes-cell">' + (r.notes ? escapeHtml(r.notes) : '\u2014') + '</td>' +
        '<td>' + fmtDateTime(r.createdAt) + '</td>' +
        '<td><button class="btn btn-danger btn-sm" data-type="match" data-id="' + escapeAttr(r.id) + '" data-name="' + escapeAttr(r.teamName) + '">Supprimer</button></td>' +
        '</tr>';
    }).join('');
    tbody.querySelectorAll('[data-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeItem(btn.dataset.type, btn.dataset.id, btn.dataset.name); });
    });
  }

  function renderJoueurs() {
    var tbody = $('joueur-tbody');
    var list = Store.getClubForms('joueur');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13"><div class="empty-state">Aucune annonce de recherche joueur.</div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (r) {
      return '<tr>' +
        '<td><strong style="color:var(--lime);">' + escapeHtml(r.id) + '</strong></td>' +
        '<td>' + escapeHtml(r.teamName) + '</td>' +
        '<td>' + escapeHtml(r.categorie || '\u2014') + '</td>' +
        '<td>' + escapeHtml(r.playerType) + '</td>' +
        '<td>' + escapeHtml(r.count) + '</td>' +
        '<td>' + escapeHtml(r.date) + '</td>' +
        '<td>' + escapeHtml(r.hour || '\u2014') + '</td>' +
        '<td>' + escapeHtml(r.payment) + '</td>' +
        '<td>' + (r.price ? escapeHtml(r.price) + ' DH' : '\u2014') + '</td>' +
        '<td>' + escapeHtml(r.contact) + '</td>' +
        '<td class="notes-cell">' + (r.notes ? escapeHtml(r.notes) : '\u2014') + '</td>' +
        '<td>' + fmtDateTime(r.createdAt) + '</td>' +
        '<td><button class="btn btn-danger btn-sm" data-type="joueur" data-id="' + escapeAttr(r.id) + '" data-name="' + escapeAttr(r.teamName) + '">Supprimer</button></td>' +
        '</tr>';
    }).join('');
    tbody.querySelectorAll('[data-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeItem(btn.dataset.type, btn.dataset.id, btn.dataset.name); });
    });
  }

  function removeItem(type, id, name) {
    if (!confirm('Supprimer cette entr\u00e9e de "' + name + '" (' + id + ') ?')) return;
    var result;
    if (type === 'res') {
      result = Store.deleteReservation(id);
    } else {
      result = Store.deleteClubForm(type, id);
    }
    if (result.error) {
      showToast(result.error, false);
    } else {
      showToast('Entr\u00e9e ' + id + ' supprim\u00e9e.', true);
      loadAll();
    }
  }

  function exportPDF() {
    var list = filtered();
    if (list.length === 0) {
      showToast('Rien \u00e0 exporter.', false);
      return;
    }

    var now = new Date();
    var exportDate = prettyDate(Store.todayStr()) + ' \u00e0 ' + Store.pad(now.getHours()) + ':' + Store.pad(now.getMinutes());
    var totalSlots = list.length;
    var totalPrice = 0;
    list.forEach(function (r) { totalPrice += (r.totalPrice || r.pricePerHour || 0); });
    var priceLabel = list[0] && list[0].currency ? list[0].currency : '';

    var rows = list.map(function (r) {
      var statusText = r.status === 'pending' ? 'En attente' : r.status === 'confirmed' ? 'Confirm\u00e9e' : 'Refus\u00e9e';
      return '<tr>' +
        '<td>' + escapeHtml(r.id) + '</td>' +
        '<td>' + statusText + '</td>' +
        '<td>' + prettyDate(r.date) + '</td>' +
        '<td>' + Store.pad(r.time) + ':00 - ' + Store.pad(r.time + 1) + ':00</td>' +
        '<td>' + escapeHtml(r.terrain || '\u2014') + '</td>' +
        '<td>' + formatDuration(r.duration || 1) + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td>' + escapeHtml(r.phone) + '</td>' +
        '<td>' + formatPrice(r.totalPrice || r.pricePerHour, r.currency) + '</td>' +
        '<td>' + (r.notes ? escapeHtml(r.notes) : '\u2014') + '</td>' +
        '</tr>';
    }).join('');

    var html = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Foothakimi - R\u00e9servations</title>' +
      '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12px;padding:24px}' +
      '.header{border-bottom:3px solid #16a34a;padding-bottom:12px;margin-bottom:16px}.header h1{font-size:22px;color:#16a34a}' +
      '.header p{color:#555;margin-top:4px;font-size:12px}.count{font-weight:bold;margin-bottom:12px}' +
      'table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;font-size:11px}' +
      'th{background:#eaf5ee}tbody tr:nth-child(even){background:#f7faf8}' +
      '.footer{margin-top:16px;font-size:11px;color:#777;text-align:center}' +
      '@media print{body{padding:0}.no-print{display:none}}</style></head><body>' +
      '<div class="no-print" style="margin-bottom:12px;text-align:right;">' +
      '<button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer;">\ud83d\udda8 Imprimer / Enregistrer en PDF</button></div>' +
      '<div class="header"><h1>\u26bd Foothakimi \u2014 Liste des r\u00e9servations</h1>' +
      '<p>Export\u00e9 le ' + exportDate + '</p></div>' +
      '<p class="count">Total : <span style="color:#16a34a;">' + totalSlots + ' r\u00e9servation(s)</span> \u00b7 ' + formatPrice(totalPrice, priceLabel) + '</p>' +
      '<table><thead><tr><th>Code</th><th>Statut</th><th>Date</th><th>Heure</th><th>Terrain</th><th>Dur\u00e9e</th><th>Nom</th><th>T\u00e9l\u00e9phone</th><th>Tarif</th><th>Remarques</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<div class="footer">Document g\u00e9n\u00e9r\u00e9 par Foothakimi \u2014 le ' + exportDate + '</div>' +
      '<script>window.print();<\/script></body></html>';

    var win = window.open('', '_blank', 'width=900,height=650');
    if (!win) {
      showToast('Autorisez les fen\u00eAtres pop-up pour exporter.', false);
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  function init() {
    $('login-btn').addEventListener('click', login);
    $('login-password').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
    $('logout-btn').addEventListener('click', function () { logout(); });
    $('filter-date').addEventListener('change', renderTable);
    $('filter-status').addEventListener('change', renderTable);
    $('search-input').addEventListener('input', renderTable);
    $('clear-filter-btn').addEventListener('click', function () {
      $('filter-date').value = '';
      $('filter-status').value = '';
      $('search-input').value = '';
      renderTable();
    });
    $('export-btn').addEventListener('click', exportPDF);

    document.querySelectorAll('.admin-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.admin-panel').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        $(tab.dataset.tab).classList.add('active');
      });
    });

    if (Store.isLoggedIn()) {
      showDashboard();
    }

    /* ---- Hamburger menu ---- */
    var navToggle = $('nav-toggle');
    var navMenu = $('nav-menu');
    if (navToggle && navMenu) {
      navToggle.addEventListener('click', function () {
        var open = navMenu.classList.toggle('open');
        navToggle.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', open);
      });
      navMenu.querySelectorAll('a, button').forEach(function (link) {
        link.addEventListener('click', function () {
          navMenu.classList.remove('open');
          navToggle.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  init();
})();
