// ─────────────────────────────────────────────────────────────
//  renderer.js — DOM rendering for ladder, heatmap, crossovers
// ─────────────────────────────────────────────────────────────

class DashboardRenderer {
  constructor() {
    // Cache DOM refs
    this.els = {};
    this.currentView = VIEW_MODES.LADDER;
    this.activeTimeframe = 0;
    this.sortMode = SORT_MODES.DISTANCE;
    this._flashTimers = [];
  }

  // ── Initialize: bind DOM elements ────────────────────────
  init() {
    this.els = {
      priceEl: document.getElementById('priceEl'),
      changeEl: document.getElementById('changeEl'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      tabs: document.getElementById('tabs'),
      ladderView: document.getElementById('ladderView'),
      heatmapView: document.getElementById('heatmapView'),
      docView: document.getElementById('docView'),
      crossoverPanel: document.getElementById('crossoverPanel'),
      crossoverList: document.getElementById('crossoverList'),
      viewToggle: document.getElementById('viewToggle'),
      docToggle: document.getElementById('docToggle'),
      sortSelect: document.getElementById('sortSelect'),
      ladderBody: document.getElementById('ladderBody'),
      heatmapGrid: document.getElementById('heatmapGrid'),
      xoTimeframeFilter: document.getElementById('xoTimeframeFilter'),
      xoDisplayMode: document.getElementById('xoDisplayMode'),
      ladderDisplayMode: document.getElementById('ladderDisplayMode'),
    };

    this.xoTfFilterVal = 'ALL';
    this.xoDispModeVal = 'pct';
    this.ladderDisplayMode = 'distance';

    this.buildTabs();
    this.bindControls();
    this.setView(VIEW_MODES.LADDER);
  }

  // ── Build timeframe tabs ─────────────────────────────────
  buildTabs() {
    const container = this.els.tabs;
    if (!container) return;
    container.innerHTML = '';

    TIMEFRAMES.forEach((tf, i) => {
      const el = document.createElement('button');
      el.className = 'tab' + (tf.native ? ' native' : '') + (i === this.activeTimeframe ? ' active' : '');
      el.innerHTML = `<span class="dot"></span>${tf.label}`;
      el.addEventListener('click', () => {
        this.activeTimeframe = i;
        this.buildTabs();
        if (this._onTimeframeChange) this._onTimeframeChange(i);
      });
      container.appendChild(el);
    });
  }

  // ── Bind view/sort controls ──────────────────────────────
  bindControls() {
    const viewToggle = this.els.viewToggle;
    const docToggle = this.els.docToggle;
    if (viewToggle) {
      viewToggle.addEventListener('click', () => {
        const next = this.currentView === VIEW_MODES.LADDER ? VIEW_MODES.HEATMAP : VIEW_MODES.LADDER;
        this.setView(next);
      });
    }

    if (docToggle) {
      docToggle.addEventListener('click', () => {
        const next = this.currentView === VIEW_MODES.DOC ? VIEW_MODES.LADDER : VIEW_MODES.DOC;
        this.setView(next);
      });
    }

    const sortSelect = this.els.sortSelect;
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortMode = e.target.value;
      });
    }

    const ladderDisplay = this.els.ladderDisplayMode;
    if (ladderDisplay) {
      ladderDisplay.addEventListener('change', (e) => {
        this.ladderDisplayMode = e.target.value;
        // The render tick runs often, but we can trigger it immediately if we wanted to.
        // For simplicity, it will pick it up on the next tick (1 second max).
      });
    }

    const xoTf = this.els.xoTimeframeFilter;
    if (xoTf) {
      // Populate timeframe options
      TIMEFRAMES.forEach(tf => {
        const opt = document.createElement('option');
        opt.value = tf.label;
        opt.textContent = tf.label;
        xoTf.appendChild(opt);
      });
      xoTf.addEventListener('change', (e) => {
        this.xoTfFilterVal = e.target.value;
        this.renderCrossovers(); // Re-render with new filter
      });
    }

    const xoDisp = this.els.xoDisplayMode;
    if (xoDisp) {
      xoDisp.addEventListener('change', (e) => {
        this.xoDispModeVal = e.target.value;
        this.renderCrossovers(); // Re-render with new display mode
      });
    }
  }

  // ── Set active view ──────────────────────────────────────
  setView(mode) {
    this.currentView = mode;
    const ladder = this.els.ladderView;
    const heatmap = this.els.heatmapView;
    const docView = this.els.docView;
    const toggle = this.els.viewToggle;
    const docToggle = this.els.docToggle;
    const sortWrap = document.getElementById('sortWrap');

    if (ladder) ladder.style.display = mode === VIEW_MODES.LADDER ? '' : 'none';
    if (heatmap) heatmap.style.display = mode === VIEW_MODES.HEATMAP ? '' : 'none';
    if (docView) docView.style.display = mode === VIEW_MODES.DOC ? '' : 'none';

    if (toggle) toggle.textContent = mode === VIEW_MODES.HEATMAP ? '☰ Ladder' : '⊞ Matrix';
    if (docToggle) docToggle.textContent = mode === VIEW_MODES.DOC ? '✕ Close Guide' : '📖 Documentation';
    if (sortWrap) sortWrap.style.display = mode === VIEW_MODES.LADDER ? '' : 'none';
  }

  // ── Callback setter ──────────────────────────────────────
  onTimeframeChange(cb) {
    this._onTimeframeChange = cb;
  }

  // ── Render price header ──────────────────────────────────
  renderPrice(price, changePercent) {
    if (this.els.priceEl) {
      this.els.priceEl.textContent = '$' + this._fmt(price);
    }
    if (this.els.changeEl) {
      const pct = changePercent || 0;
      const sign = pct >= 0 ? '+' : '';
      this.els.changeEl.textContent = sign + pct.toFixed(2) + '%';
      this.els.changeEl.className = 'change mono ' + (pct >= 0 ? 'up' : 'down');
    }
  }

  // ── Render connection status ─────────────────────────────
  renderStatus(status) {
    const dot = this.els.statusDot;
    const text = this.els.statusText;
    if (!dot || !text) return;

    const map = {
      'connected':    { color: 'var(--up)',    label: 'Delta Exchange · futures · live' },
      'connecting':   { color: 'var(--amber)', label: 'connecting…' },
      'disconnected': { color: 'var(--down)',  label: 'disconnected' },
      'error':        { color: 'var(--down)',  label: 'connection error' },
      'simulated':    { color: 'var(--amber)', label: 'Delta Exchange · futures · simulated' },
      'bootstrapping':{ color: 'var(--amber)', label: 'loading historical data…' },
    };

    const info = map[status] || map['disconnected'];
    dot.style.background = info.color;
    text.textContent = info.label;

    // Pulse animation only when connected
    dot.style.animation = status === 'connected' ? 'pulse 1.8s infinite' : 'none';
  }

  // ── Render ladder view ───────────────────────────────────
  renderLadder(ladderData) {
    if (this.currentView !== VIEW_MODES.LADDER) return;
    const body = this.els.ladderBody;
    if (!body) return;

    const { above, below, price } = ladderData;
    const allRows = [...above, ...below];
    const maxDist = Math.max(...allRows.map(r => r.distance), 1);

    let html = '';

    // Resistance (above price) — show furthest at top, nearest at bottom
    above.slice().reverse().forEach(r => {
      html += this._makeLadderRow(r, maxDist, 'above');
    });

    // Center price row
    html += `
      <div class="center-row">
        <div class="line"></div>
        <div class="last mono">$${this._fmt(price)} last</div>
        <div class="line"></div>
      </div>
    `;

    // Support (below price) — show nearest at top, furthest at bottom
    below.forEach(r => {
      html += this._makeLadderRow(r, maxDist, 'below');
    });

    body.innerHTML = html;
  }

  // ── Render heatmap matrix ────────────────────────────────
  renderHeatmap(heatmapData) {
    if (this.currentView !== VIEW_MODES.HEATMAP) return;
    const grid = this.els.heatmapGrid;
    if (!grid) return;

    let html = '';

    // Header row: timeframe labels
    html += '<div class="hm-row hm-header">';
    html += '<div class="hm-cell hm-corner mono">MA ╲ TF</div>';
    TIMEFRAMES.forEach((tf, i) => {
      html += `<div class="hm-cell hm-tf-label mono ${i === this.activeTimeframe ? 'hm-active-tf' : ''}">${tf.label}</div>`;
    });
    html += '</div>';

    // Data rows: one per MA period
    PERIODS.forEach((period, pIdx) => {
      html += '<div class="hm-row">';
      html += `<div class="hm-cell hm-period-label mono">MA ${period}</div>`;

      TIMEFRAMES.forEach((tf, tfIdx) => {
        const tfData = heatmapData[tfIdx];
        if (!tfData) {
          html += '<div class="hm-cell hm-empty">—</div>';
          return;
        }

        const cell = tfData[pIdx];
        if (!cell) {
          html += '<div class="hm-cell hm-empty">—</div>';
          return;
        }

        // Color intensity based on distance (capped at 2%)
        const intensity = Math.min(Math.abs(cell.distancePct) / 2, 1);
        const alpha = 0.15 + intensity * 0.55;
        const bgColor = cell.bullish
          ? `rgba(35,192,122,${alpha})`
          : `rgba(238,79,90,${alpha})`;
        const textColor = cell.bullish ? 'var(--up)' : 'var(--down)';

        // Tooltip content
        const tooltip = `MA${period} @ ${tf.label}\\n$${this._fmt(cell.value)}\\n${cell.distancePct > 0 ? '+' : ''}${cell.distancePct.toFixed(3)}%`;

        html += `<div class="hm-cell" style="background:${bgColor};color:${textColor}" title="${tooltip}">
          ${cell.distancePct > 0 ? '+' : ''}${cell.distancePct.toFixed(2)}%
        </div>`;
      });

      html += '</div>';
    });

    grid.innerHTML = html;
  }

  // ── Render crossover panel ───────────────────────────────
  renderCrossovers(crossovers) {
    if (crossovers) this.lastCrossovers = crossovers;
    const dataToRender = this.lastCrossovers || [];

    const list = this.els.crossoverList;
    if (!list) return;

    let filtered = dataToRender;
    if (this.xoTfFilterVal !== 'ALL') {
      filtered = dataToRender.filter(xo => xo.timeframe === this.xoTfFilterVal);
    }

    if (filtered.length === 0) {
      list.innerHTML = `<div class="xo-empty">No crossovers detected yet for ${this.xoTfFilterVal === 'ALL' ? 'any timeframe' : this.xoTfFilterVal}</div>`;
      return;
    }

    // Show most recent first
    const recent = filtered.slice().reverse().slice(0, 12);
    let html = '';

    recent.forEach(xo => {
      const icon = xo.type === 'bullish' ? '▲' : '▼';
      const colorClass = xo.type === 'bullish' ? 'xo-bull' : 'xo-bear';
      const ago = this._timeAgo(xo.time);
      
      // Calculate spread and change if data is available
      let detailHtml = `MA${xo.shortPeriod} × MA${xo.longPeriod}`;
      if (xo.currShortVal) {
        const spreadPts = Math.abs(xo.currShortVal - xo.currLongVal);
        const spreadPct = (spreadPts / xo.currLongVal) * 100;
        const diffShortPts = xo.currShortVal - xo.prevShortVal;
        const diffShortPct = (diffShortPts / xo.prevShortVal) * 100;
        
        const spreadStr = this.xoDispModeVal === 'pct' ? `${spreadPct.toFixed(3)}%` : `${spreadPts.toFixed(1)} pts`;
        const diffStr = this.xoDispModeVal === 'pct' ? `${diffShortPct > 0 ? '+' : ''}${diffShortPct.toFixed(3)}%` : `${diffShortPts > 0 ? '+' : ''}${diffShortPts.toFixed(1)} pts`;

        detailHtml += ` <span style="opacity:0.6;font-size:10.5px;margin-left:8px;">Spread: ${spreadStr} | Δ(MA${xo.shortPeriod}): ${diffStr}</span>`;
      }

      html += `
        <div class="xo-item ${colorClass}">
          <span class="xo-icon">${icon}</span>
          <span class="xo-label mono" style="min-width:35px">${xo.timeframe}</span>
          <span class="xo-detail">${detailHtml}</span>
          <span class="xo-time">${ago}</span>
        </div>
      `;
    });

    list.innerHTML = html;
  }

  // ── Internal: make a single ladder row ───────────────────
  _makeLadderRow(r, maxDist, side) {
    const barPct = Math.min(100, (r.distance / maxDist) * 100);

    // Trend arrow
    const trendMap = {
      'up': '↑', 'rising': '↗', 'flat': '─', 'falling': '↘', 'down': '↓'
    };
    const trendArrow = trendMap[r.trend] || '─';
    const trendClass = r.trend === 'up' || r.trend === 'rising' ? 'trend-up'
      : r.trend === 'down' || r.trend === 'falling' ? 'trend-down' : 'trend-flat';

    // Format delta column based on display mode
    let deltaHtml = '';
    if (this.ladderDisplayMode === 'diff_pts') {
      const sign = r.diffPts > 0 ? '+' : '';
      deltaHtml = `${sign}${r.diffPts.toFixed(1)} pts`;
    } else if (this.ladderDisplayMode === 'diff_pct') {
      const sign = r.diffPct > 0 ? '+' : '';
      deltaHtml = `${sign}${r.diffPct.toFixed(3)}%`;
    } else {
      deltaHtml = `${r.distanceBps.toFixed(0)} bps`;
    }

    return `
      <div class="row ${side}">
        <div class="label mono">MA ${r.period}</div>
        <div class="trend-col ${trendClass}">${trendArrow}</div>
        <div class="bar-track"><div class="bar" style="width:${barPct}%"></div></div>
        <div class="delta mono">${deltaHtml}</div>
        <div class="val mono">${this._fmt(r.value)}</div>
      </div>
    `;
  }

  // ── Internal: format number ──────────────────────────────
  _fmt(n) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Internal: time ago ───────────────────────────────────
  _timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }
}
