// Static token radar. The board, score trace, live-token sample, and farm plans all come from data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'rank', dir: 1, liveSort: 'mcap', liveDir: -1, selected: null };
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money.format(n);
  }
  function pct(n) {
    return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'unlisted';
    return days >= 365 ? (days / 365).toFixed(1) + ' years' : days + ' days';
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
      else if (value !== null && value !== undefined) node.setAttribute(key, value);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (item) { if (item) node.appendChild(item); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.selected) p.set('p', state.selected);
    var hash = p.toString();
    window.history.replaceState(null, '', hash ? '#' + hash : window.location.pathname + window.location.search);
  }
  function readHash() {
    var p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    state.q = p.get('q') || '';
    state.category = p.get('category') || 'all';
    state.selected = p.get('p') || null;
  }
  function activeRows() { return state.tab === 'pre-token' ? DATA.rows : DATA.live; }
  function filtered(source) {
    var query = state.q.trim().toLowerCase();
    return source.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!query) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(query) >= 0;
    });
  }
  function sortHeader(key, label, live) {
    var sortKey = live ? state.liveSort : state.sort;
    var direction = live ? state.liveDir : state.dir;
    return el('th', { scope: 'col', 'aria-sort': sortKey === key ? (direction < 0 ? 'descending' : 'ascending') : 'none' },
      el('button', { type: 'button', onclick: function () {
        if (live) {
          if (state.liveSort === key) state.liveDir *= -1;
          else { state.liveSort = key; state.liveDir = key === 'name' ? 1 : -1; }
        } else {
          if (state.sort === key) state.dir *= -1;
          else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        }
        render();
      } }, label, sortKey === key ? (direction < 0 ? ' ↓' : ' ↑') : '')
    );
  }
  function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function sortedBoard() {
    return filtered(DATA.rows).slice().sort(function (a, b) {
      var key = state.sort;
      var av = key === 'name' ? a.name.toLowerCase() : key === 'tvl' ? a.tvl_usd : key === 'growth' ? a.change_7d : key === 'age' ? a.age_days : key === 'implied' ? a.implied_value_usd : a.rank;
      var bv = key === 'name' ? b.name.toLowerCase() : key === 'tvl' ? b.tvl_usd : key === 'growth' ? b.change_7d : key === 'age' ? b.age_days : key === 'implied' ? b.implied_value_usd : b.rank;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (key === 'name' ? compareText(av, bv) : av - bv) * state.dir || compareText(a.slug, b.slug);
    });
  }
  function sortedLive() {
    return filtered(DATA.live).slice().sort(function (a, b) {
      var key = state.liveSort;
      var av = key === 'name' ? a.name.toLowerCase() : key === 'tvl' ? a.tvl_usd : key === 'growth' ? a.change_7d : a.mcap_usd;
      var bv = key === 'name' ? b.name.toLowerCase() : key === 'tvl' ? b.tvl_usd : key === 'growth' ? b.change_7d : b.mcap_usd;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (key === 'name' ? compareText(av, bv) : av - bv) * state.liveDir || compareText(a.slug, b.slug);
    });
  }
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
        el('div', null, el('span', { class: 'brand-title', text: 'Signal / Radar' }), el('span', { class: 'brand-sub', text: 'Token research · field note 01' }))),
      el('div', { class: 'top-meta' }, el('span', { text: 'SNAPSHOT ' + DATA.as_of }), el('span', { text: DATA.model_version.toUpperCase() + ' MODEL' }))
    );
  }
  function hero() {
    return el('section', { class: 'hero' },
      el('div', { class: 'hero-copy' },
        el('div', { class: 'eyebrow', text: 'Onchain activity · implied launch value' }),
        el('h1', { text: 'Signal before the symbol.' }),
        el('p', { text: 'A ranked read of protocols with no token recorded in this snapshot. The house watchlist is the floor; early, lower-TVL protocols stay on the radar. Every value is a model estimate, never a launch forecast.' })
      ),
      el('div', { class: 'radar-art', 'aria-hidden': 'true' },
        el('i', { class: 'radar-ring' }), el('i', { class: 'radar-ring' }), el('i', { class: 'radar-ring' }),
        el('i', { class: 'radar-cross' }), el('i', { class: 'radar-cross vertical' }), el('i', { class: 'radar-sweep' }),
        el('i', { class: 'radar-pip one' }), el('i', { class: 'radar-pip two' }), el('i', { class: 'radar-pip three' })
      )
    );
  }
  function stats() {
    return el('section', { class: 'stats', 'aria-label': 'Snapshot coverage' },
      stat('Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size),
      stat('Pre-token ranked', DATA.board_size),
      stat('Early below floor', DATA.early_size),
      stat('Live-token sample', DATA.live_size)
    );
  }
  function stat(label, value) { return el('div', { class: 'stat' }, el('span', { class: 'stat-label', text: label }), el('b', { class: 'stat-value', text: String(value) })); }
  function sectionTop() {
    var live = state.tab === 'live';
    return el('div', { class: 'section-top' },
      el('div', null, el('div', { class: 'section-kicker', text: live ? 'Market reference / set aside' : 'Ranked board / no token recorded' }), el('h2', { class: 'section-title', text: live ? 'Already trading' : 'The next-token watch' })),
      el('div', { class: 'section-note', text: live ? 'Shown separately with snapshot market caps. These records do not enter the implied-value ranking.' : 'Select any row to inspect the score inputs and its four-step protocol-specific plan.' })
    );
  }
  function controls() {
    var source = activeRows();
    var categories = Array.from(new Set(source.map(function (r) { return r.category || 'Other'; }))).sort();
    var query = el('input', { id: 'query', type: 'search', placeholder: 'Protocol, category or chain', value: state.q, 'aria-label': 'Search protocols' });
    query.addEventListener('input', function () { state.q = query.value; writeHash(); render(true); });
    var category = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    category.addEventListener('change', function () { state.category = category.value; writeHash(); render(true); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Radar', onclick: function () { state.tab = 'pre-token'; state.category = 'all'; state.sort = 'rank'; state.dir = 1; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; state.category = 'all'; state.liveSort = 'mcap'; state.liveDir = -1; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field search' }, el('label', { for: 'query', text: 'Find a protocol' }), query),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), category),
      el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'Token record' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: filtered(source).length + ' of ' + source.length + ' shown' })
    );
  }
  function boardTable() {
    var rows = sortedBoard();
    if (!rows.length) return el('div', { class: 'table-frame empty', text: 'No protocols match these filters. Clear the search or choose another category.' });
    var maxValue = Math.max(1, rows.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 0));
    var body = el('tbody');
    rows.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var row = el('tr', { tabindex: '0', 'data-selected': state.selected === r.slug ? 'true' : 'false', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num rank-cell', text: String(r.rank).padStart(2, '0') }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || 'chain unreported') }))),
        el('td', { class: 'num', text: usd(r.tvl_usd) }), el('td', { class: 'num ' + growthClass, text: pct(r.change_7d) }),
        el('td', { class: 'num', text: age(r.age_days) }),
        el('td', null, el('div', { class: 'implied' }, el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round(r.implied_value_usd / maxValue * 100)) + '%' })), el('b', { class: 'num value', text: usd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'status', text: 'no record' }))
      );
      body.appendChild(row);
    });
    return el('div', { class: 'table-frame' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { text: 'Snapshot figures · rank order is strict · choose a row for the scoring trace and farm plan' }),
      el('thead', null, el('tr', null, sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7 day'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Token record' }))), body
    )));
  }
  function liveTable() {
    var rows = sortedLive();
    if (!rows.length) return el('div', { class: 'table-frame empty', text: 'No live-token records match these filters.' });
    var body = el('tbody');
    rows.forEach(function (r) {
      body.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status', text: 'trading' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || 'chain unreported') })),
        el('td', { class: 'num', text: usd(r.tvl_usd) }), el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: pct(r.change_7d) }),
        el('td', { class: 'num', text: usd(r.mcap_usd) })
      )));
    });
    return el('div', null,
      el('div', { class: 'live-intro' }, el('strong', { text: 'Market reference' }), el('span', { text: 'This view is excluded from the pre-token score. Market cap is the recorded value, not a model output.' })),
      el('div', { class: 'table-frame' }, el('div', { class: 'table-wrap' }, el('table', null,
        el('caption', { text: 'Top recorded live-token protocols in the snapshot, sorted by market cap' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), sortHeader('name', 'Protocol', true), sortHeader('tvl', 'TVL', true), sortHeader('growth', '7 day', true), sortHeader('mcap', 'Market cap', true))), body
      )))
    );
  }
  function formulaPanel() {
    var m = DATA.model;
    var formula = 'max(1, round(TVL × ' + m.base_multiple + ' × (1 + clamp(7d change ?? 0, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(max(age ?? ' + m.unknown_age_days + ', 0), ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') × (1 + ' + m.category_breadth_weight + ' × min(category chain breadth, ' + m.breadth_cap + ') / ' + m.breadth_cap + ') × (1 + ' + m.chain_breadth_weight + ' × min(protocol chain count, ' + m.breadth_cap + ') / ' + m.breadth_cap + '))';
    return el('section', { class: 'model-card' },
      el('div', null, el('div', { class: 'eyebrow', text: 'Scoring note / ' + DATA.model_version }), el('h2', { text: 'How the signal is built' }),
        el('p', { text: 'TVL anchors the estimate. Seven-day change supplies clipped momentum; listing age adds a bounded maturity factor. Category breadth is the unique chain count across snapshot protocols with the same category; chain breadth is this protocol’s own unique chain count.' }),
        el('p', { class: 'footnote', text: 'Missing growth is 0%; missing age uses ' + m.unknown_age_days + ' days. Values are shown in whole dollars. Tied rounded scores keep model order and step down by $1 to make ranks distinct.' })),
      el('div', { class: 'formula' }, el('div', { class: 'formula-line' }, el('span', { class: 'formula-label', text: 'Raw value · exact constants' }), formula),
        el('div', { class: 'formula-line' }, el('span', { class: 'formula-label', text: 'Breadth terms' }), 'Category factor = 1 + ' + m.category_breadth_weight + ' × min(unique chains in category, ' + m.breadth_cap + ') / ' + m.breadth_cap + ' · Protocol factor = 1 + ' + m.chain_breadth_weight + ' × min(own unique chains, ' + m.breadth_cap + ') / ' + m.breadth_cap),
        el('div', { class: 'formula-line' }, el('span', { class: 'formula-label', text: 'Strict displayed ranking' }), 'Displayed value at rank r = min(raw value, displayed value at r−1 − $1). No protocol name enters the score.'))
    );
  }

  var dialog = el('dialog', { class: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = DATA.rows.find(function (r) { return r.slug === slug; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    var m = row.model;
    dialog.textContent = '';
    var steps = (row.farm_steps || []).map(function (text) {
      var match = text.match(/ Cost: (.*?)\. Time: (.*?)\. Check: (.*)$/);
      var action = match ? text.slice(0, match.index) : text;
      var meta = match ? 'Cost: ' + match[1] + ' · Time: ' + match[2] + ' · Check: ' + match[3] : '';
      return el('li', null, el('p', { text: action }), el('span', { class: 'plan-meta', text: meta }));
    });
    dialog.appendChild(el('div', { class: 'detail-inner' },
      el('header', { class: 'detail-head' }, el('div', null,
        el('span', { class: 'detail-rank', text: 'Signal rank ' + row.rank + ' / ' + DATA.board_size + ' · no token recorded' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('div', { class: 'detail-sub', text: (row.category || 'Unclassified') + ' · ' + ((row.chains || []).join(', ') || 'chain not reported') }
      )), el('button', { class: 'close', type: 'button', text: 'Close', 'aria-label': 'Close protocol detail', onclick: function () { dialog.close(); } })),
      el('div', { class: 'detail-value' }, el('div', null, el('small', { text: 'Implied value · model estimate' }), el('strong', { class: 'num', text: usd(row.implied_value_usd) })), el('span', { text: 'Rank ' + row.rank })),
      el('section', { class: 'detail-section' }, el('h3', { text: 'Snapshot inputs and score trace' }),
        el('div', { class: 'input-grid' },
          inputItem('TVL', usd(row.tvl_usd)), inputItem('7 day change', pct(row.change_7d) + ' · used ' + m.growth_pct + '%'),
          inputItem('Listed age', age(row.age_days) + ' · ' + (row.listed_at || 'date unreported')),
          inputItem('Growth factor', String(m.growth_multiplier)), inputItem('Maturity factor', String(m.maturity_multiplier)),
          inputItem('Category chain breadth', m.category_chain_breadth + ' chains · ×' + m.category_breadth_multiplier),
          inputItem('Protocol chain breadth', m.chain_count + ' chains · ×' + m.chain_breadth_multiplier),
          inputItem('Raw model value', usd(m.raw_implied_value_usd))
        ), el('p', { class: 'model-explain', text: 'The raw value is the formula output. The displayed value is lower only when whole-dollar rounding would tie the row above; the strict-order adjustment is at most $' + DATA.board_size + ' across this board.' })
      ),
      el('section', { class: 'detail-section' }, el('h3', { text: 'Protocol-specific farm plan' }), el('ol', { class: 'steps' }, steps),
        el('p', { class: 'risk-note', text: 'DefiLlama records no token identifiers for this row; that record is not proof a token does not exist. A future launch or reward is not assumed.' }))
    ));
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function inputItem(label, value) { return el('div', { class: 'input-item' }, el('span', { text: label }), el('b', { text: value })); }
  function render(preserveFocus) {
    var focused = preserveFocus && document.activeElement ? document.activeElement.id : '';
    var start = preserveFocus && document.activeElement && document.activeElement.selectionStart;
    var shell = el('div', { class: 'shell' }, header(), hero(), stats(), sectionTop(), controls(), state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(formulaPanel());
    app.textContent = '';
    app.appendChild(shell);
    app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    if (focused) {
      var next = document.getElementById(focused);
      if (next) { next.focus(); if (typeof start === 'number' && next.setSelectionRange) next.setSelectionRange(start, start); }
    }
  }
  readHash();
  render();
  if (state.selected) openDetail(state.selected);
})();
