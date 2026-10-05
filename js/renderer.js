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
    this.dataMode = 'price';
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
      historyView: document.getElementById('historyView'),
      docView: document.getElementById('docView'),
      crossoverPanel: document.getElementById('crossoverPanel'),
      crossoverList: document.getElementById('crossoverList'),
      viewToggle: document.getElementById('viewToggle'),
      docToggle: document.getElementById('docToggle'),
      historyToggle: document.getElementById('historyToggle'),
      dataToggle: document.getElementById('dataToggle'),
      sortSelect: document.getElementById('sortSelect'),
      ladderBody: document.getElementById('ladderBody'),
      heatmapGrid: document.getElementById('heatmapGrid'),
      xoTimeframeFilter: document.getElementById('xoTimeframeFilter'),
      xoDisplayMode: document.getElementById('xoDisplayMode'),
      ladderDisplayMode: document.getElementById('ladderDisplayMode'),
      historyTableBody: document.getElementById('historyTableBody'),
      historyLookupContent: document.getElementById('historyLookupContent'),
      historySortBtn: document.getElementById('historySortBtn'),
      historyModeToggleBtn: document.getElementById('historyModeToggleBtn'),
      historyTableWrapper: document.getElementById('historyTableWrapper'),
      historyGridWrapper: document.getElementById('historyGridWrapper'),
      historyGridBody: document.getElementById('historyGridBody'),
      historyPrevBtn: document.getElementById('historyPrevBtn'),
      historyNextBtn: document.getElementById('historyNextBtn'),
      historyPageLabel: document.getElementById('historyPageLabel'),
    };

    this.xoTfFilterVal = 'ALL';
    this.xoDispModeVal = 'pct';
    this.ladderDisplayMode = 'distance';
    this.selectedHistoryTime = null;
    this.historySortDesc = true;
    this.historyPage = 1;
    this.historyViewMode = 'table'; // 'table' or 'grid'

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
    const historyToggle = this.els.historyToggle;
    const docToggle = this.els.docToggle;
    
    if (viewToggle) {
      viewToggle.addEventListener('click', () => {
        const next = this.currentView === VIEW_MODES.LADDER ? VIEW_MODES.HEATMAP : VIEW_MODES.LADDER;
        this.setView(next);
      });
    }

    if (historyToggle) {
      historyToggle.addEventListener('click', () => {
        const next = this.currentView === VIEW_MODES.HISTORY ? VIEW_MODES.LADDER : VIEW_MODES.HISTORY;
        this.setView(next);
      });
    }

    const historySortBtn = this.els.historySortBtn;
    if (historySortBtn) {
      historySortBtn.addEventListener('click', () => {
        this.historySortDesc = !this.historySortDesc;
        historySortBtn.textContent = this.historySortDesc ? 'Sort: Descending ↓' : 'Sort: Ascending ↑';
        if (window.app) window.app._render();
      });
    }

    const modeBtn = this.els.historyModeToggleBtn;
    if (modeBtn) {
      modeBtn.addEventListener('click', () => {
        this.historyViewMode = this.historyViewMode === 'table' ? 'grid' : 'table';
        modeBtn.textContent = this.historyViewMode === 'table' ? 'Mode: Table' : 'Mode: Matrix';
        this.els.historyTableWrapper.style.display = this.historyViewMode === 'table' ? 'flex' : 'none';
        this.els.historyGridWrapper.style.display = this.historyViewMode === 'grid' ? 'block' : 'none';
        if (window.app) window.app._render();
      });
    }

    if (this.els.historyPrevBtn) {
      this.els.historyPrevBtn.addEventListener('click', () => {
        if (this.historyPage > 1) {
          this.historyPage--;
          if (window.app) window.app._render();
        }
      });
    }
    
    if (this.els.historyNextBtn) {
      this.els.historyNextBtn.addEventListener('click', () => {
        // max 10 pages for 100 candles
        if (this.historyPage < 10) {
          this.historyPage++;
          if (window.app) window.app._render();
        }
      });
    }

    const dataToggle = this.els.dataToggle;
    if (dataToggle) {
      dataToggle.addEventListener('click', () => {
        this.dataMode = this.dataMode === 'price' ? 'momentum' : 'price';
        dataToggle.textContent = this.dataMode === 'price' ? '📊 Mode: Price' : '📊 Mode: MA Change';
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
    const historyView = this.els.historyView;
    const docView = this.els.docView;
    const toggle = this.els.viewToggle;
    const historyToggle = this.els.historyToggle;
    const docToggle = this.els.docToggle;
    const sortWrap = document.getElementById('sortWrap');

    if (ladder) ladder.style.display = mode === VIEW_MODES.LADDER ? '' : 'none';
    if (heatmap) heatmap.style.display = mode === VIEW_MODES.HEATMAP ? '' : 'none';
    if (historyView) historyView.style.display = mode === VIEW_MODES.HISTORY ? '' : 'none';
    if (docView) docView.style.display = mode === VIEW_MODES.DOC ? '' : 'none';

    if (toggle) toggle.textContent = mode === VIEW_MODES.HEATMAP ? '☰ Ladder' : '⊞ Matrix';
    if (historyToggle) historyToggle.textContent = mode === VIEW_MODES.HISTORY ? '✕ Close History' : '🕒 History';
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
    let maxDist = 1;
    if (this.dataMode === 'momentum') {
      maxDist = Math.max(...allRows.map(r => Math.abs(r.rateOfChange)), 0.0001);
    } else {
      maxDist = Math.max(...allRows.map(r => r.distance), 1);
    }

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

        // Color intensity based on distance (capped at 2%) or momentum (capped at 0.5%)
        let intensity = 0;
        let isBullish = cell.bullish;
        let displayVal = '';
        let tooltipVal = '';

        if (this.dataMode === 'momentum') {
          intensity = Math.min(Math.abs(cell.rateOfChange) / 0.5, 1);
          isBullish = cell.momentumBullish;
          const sign = cell.rateOfChange > 0 ? '+' : '';
          displayVal = `${sign}${cell.rateOfChange.toFixed(3)}%`;
          tooltipVal = `MA Change: ${sign}${cell.diffPts.toFixed(1)} pts (${displayVal})`;
        } else {
          intensity = Math.min(Math.abs(cell.distancePct) / 2, 1);
          isBullish = cell.bullish;
          const sign = cell.distancePct > 0 ? '+' : '';
          displayVal = `${sign}${cell.distancePct.toFixed(2)}%`;
          tooltipVal = `Dist: ${sign}${cell.distancePct.toFixed(3)}%`;
        }

        const alpha = 0.15 + intensity * 0.55;
        const bgColor = isBullish
          ? `rgba(35,192,122,${alpha})`
          : `rgba(238,79,90,${alpha})`;
        const textColor = isBullish ? 'var(--up)' : 'var(--down)';

        // Tooltip content
        const tooltip = `MA${period} @ ${tf.label}\\n$${this._fmt(cell.value)}\\n${tooltipVal}`;

        html += `<div class="hm-cell" style="background:${bgColor};color:${textColor}" title="${tooltip}">
          ${displayVal}
        </div>`;
      });

      html += '</div>';
    });

    grid.innerHTML = html;
  }

  // ── Render history view ──────────────────────────────────
  renderHistory(historyData) {
    if (this.currentView !== VIEW_MODES.HISTORY) return;
    const tbody = this.els.historyTableBody;
    const lookup = this.els.historyLookupContent;
    if (!tbody || !lookup) return;

    let tableHtml = '';
    
    // Set default selected to the most recent candle if not selected or if time no longer exists
    if (!this.selectedHistoryTime || !historyData.find(c => c.time === this.selectedHistoryTime)) {
      this.selectedHistoryTime = historyData.length > 0 ? historyData[0].time : null;
    }

    // historyData is [newest, ..., oldest]
    // Add an index property where oldest is 1, newest is N
    const indexedData = historyData.map((c, idx) => {
      return { ...c, candleIndex: historyData.length - idx };
    });

    let displayData = indexedData;
    if (!this.historySortDesc) {
      displayData = [...indexedData].reverse();
    }

    if (this.historyViewMode === 'table') {
      // Pagination logic
      const itemsPerPage = 10;
      const totalPages = Math.ceil(displayData.length / itemsPerPage) || 1;
      if (this.historyPage > totalPages) this.historyPage = totalPages;
      
      this.els.historyPageLabel.textContent = `Page ${this.historyPage} of ${totalPages}`;
      
      const startIndex = (this.historyPage - 1) * itemsPerPage;
      const pageData = displayData.slice(startIndex, startIndex + itemsPerPage);

      pageData.forEach((candle) => {
        const isSelected = candle.time === this.selectedHistoryTime;
        const d = new Date(candle.time * 1000);
        const timeStr = d.toLocaleTimeString('en-US', { hour12: false }) + ' ' + d.toLocaleDateString();
        
        const trClass = isSelected ? 'background: var(--bg-hover); font-weight: bold; cursor: pointer;' : 'cursor: pointer; border-bottom: 1px solid var(--border);';
        
        tableHtml += `<tr style="${trClass}" onclick="window.app.renderer.selectHistoryCandle(${candle.time})">
          <td style="padding: 10px; color: var(--text-muted);">${candle.candleIndex}</td>
          <td style="padding: 10px; color: var(--text-muted);">${timeStr}</td>
          <td style="padding: 10px; text-align: right;">${this._fmt(candle.open)}</td>
          <td style="padding: 10px; text-align: right; color: var(--up);">${this._fmt(candle.high)}</td>
          <td style="padding: 10px; text-align: right; color: var(--down);">${this._fmt(candle.low)}</td>
          <td style="padding: 10px; text-align: right;">${this._fmt(candle.close)}</td>
        </tr>`;
      });
      tbody.innerHTML = tableHtml;
    } else {
      // Grid mode (Matrix)
      let gridHtml = '';
      displayData.forEach(candle => {
        const isSelected = candle.time === this.selectedHistoryTime;
        const isBullish = candle.close >= candle.open;
        const bgColor = isBullish ? 'var(--up-bg)' : 'var(--down-bg)';
        const borderColor = isSelected ? 'var(--amber)' : (isBullish ? 'var(--up)' : 'var(--down)');
        const opacity = isSelected ? '1' : '0.6';
        const color = isBullish ? 'var(--up)' : 'var(--down)';
        
        gridHtml += `
          <div onclick="window.app.renderer.selectHistoryCandle(${candle.time})" 
               style="background: ${bgColor}; border: 1px solid ${borderColor}; opacity: ${opacity}; 
                      border-radius: var(--radius-sm); padding: 8px 4px; text-align: center; cursor: pointer;
                      color: ${color}; font-family: var(--font-mono); font-size: 10px;"
               title="Candle #${candle.candleIndex}">
            #${candle.candleIndex}<br>
            <span style="font-size: 8px; color: var(--text-faint);">${(new Date(candle.time * 1000)).toLocaleTimeString('en-US', {hour12: false}).slice(0, 5)}</span>
          </div>
        `;
      });
      if (this.els.historyGridBody) this.els.historyGridBody.innerHTML = gridHtml;
    }

    // Render lookup pane
    const selectedCandle = historyData.find(c => c.time === this.selectedHistoryTime);
    if (selectedCandle) {
      const d = new Date(selectedCandle.time * 1000);
      const timeStr = d.toLocaleTimeString('en-US', { hour12: false }) + ' ' + d.toLocaleDateString();
      
      let lookupHtml = `<div style="margin-bottom: 16px;">
        <div style="color: var(--text-muted); margin-bottom: 8px;">Time: ${timeStr}</div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
          <span>Price (Close)</span> <span>$${this._fmt(selectedCandle.close)}</span>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      `;
      
      PERIODS.forEach(period => {
        const val = selectedCandle.mas[period];
        const dist = val - selectedCandle.close;
        const color = dist > 0 ? 'var(--down)' : 'var(--up)';
        lookupHtml += `
          <div style="background: var(--bg-body); padding: 8px; border-radius: 4px; border: 1px solid var(--border);">
            <div style="color: var(--text-muted); font-size: 12px;">MA ${period}</div>
            <div style="color: ${color}; font-size: 15px; margin-top: 4px;">$${this._fmt(val)}</div>
          </div>
        `;
      });
      lookupHtml += '</div>';
      lookup.innerHTML = lookupHtml;
    } else {
      lookup.innerHTML = 'Select a candle from the table to view its detailed Moving Averages and data.';
    }
  }

  selectHistoryCandle(time) {
    this.selectedHistoryTime = time;
    if (window.app) window.app._render(); // Force re-render
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
      const isBootstrapping = window.app && window.app.status === 'bootstrapping';
      if (isBootstrapping) {
        list.innerHTML = `<div class="xo-empty">Searching for crossovers...</div>`;
      } else {
        list.innerHTML = `<div class="xo-empty">No crossover present right now.</div>`;
      }
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
    let barPct = 0;
    let isPositive = true;
    if (this.dataMode === 'momentum') {
      barPct = Math.min(100, (Math.abs(r.rateOfChange) / maxDist) * 100);
      isPositive = r.rateOfChange >= 0;
    } else {
      barPct = Math.min(100, (r.distance / maxDist) * 100);
      isPositive = side === 'below';
    }

    // Trend arrow
    const trendMap = {
      'up': '↑', 'rising': '↗', 'flat': '─', 'falling': '↘', 'down': '↓'
    };
    const trendArrow = trendMap[r.trend] || '─';
    const trendClass = r.trend === 'up' || r.trend === 'rising' ? 'trend-up'
      : r.trend === 'down' || r.trend === 'falling' ? 'trend-down' : 'trend-flat';

    // Format delta column based on display mode
    let deltaHtml = '';
    if (this.dataMode === 'momentum') {
      const sign = r.diffPts > 0 ? '+' : '';
      deltaHtml = `${sign}${r.diffPts.toFixed(1)} pts (${sign}${r.rateOfChange.toFixed(3)}%)`;
    } else {
      if (this.ladderDisplayMode === 'diff_pts') {
        const sign = r.diffPts > 0 ? '+' : '';
        deltaHtml = `${sign}${r.diffPts.toFixed(1)} pts`;
      } else if (this.ladderDisplayMode === 'diff_pct') {
        const sign = r.diffPct > 0 ? '+' : '';
        deltaHtml = `${sign}${r.diffPct.toFixed(3)}%`;
      } else {
        deltaHtml = `${r.distanceBps.toFixed(0)} bps`;
      }
    }

    let barStyle = `width:${barPct}%;`;
    if (this.dataMode === 'momentum') {
      barStyle += isPositive ? 'background:var(--up); margin-left:0; margin-right:auto;' : 'background:var(--down); margin-left:auto; margin-right:0;';
    }

    return `
      <div class="row ${side}">
        <div class="label mono">MA ${r.period}</div>
        <div class="trend-col ${trendClass}">${trendArrow}</div>
        <div class="bar-track"><div class="bar" style="${barStyle}"></div></div>
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
