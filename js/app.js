// ─────────────────────────────────────────────────────────────
//  app.js — Main application orchestrator
// ─────────────────────────────────────────────────────────────

class TradecraftApp {
  constructor() {
    this.api = null;
    this.engine = new MAEngine();
    this.renderer = new DashboardRenderer();
    this._refreshTimer = null;
    this._bootstrapped = false;
    this._mode = 'live'; // 'live' or 'simulated'
  }

  // ── Initialize ───────────────────────────────────────────
  async init() {
    console.log('[App] Initializing Tradecraft MA Dashboard');

    // Init renderer
    this.renderer.init();
    this.renderer.onTimeframeChange((i) => this._onTimeframeChange(i));

    // With the local proxy server, we assume the proxy handles the live connection
    this.api = new DeltaAPI();
    this._mode = 'proxy';

    // Wire up API events
    this.api.on('price', (price) => this._onPrice(price));
    this.api.on('candle', (res, candle) => this._onCandle(res, candle));
    this.api.on('status', (status) => this.renderer.renderStatus(status));

    // Connect WebSocket for live updates (proxy sends initial state too)
    this.api.connect();

    // Bootstrap historical data from the proxy cache
    await this._bootstrap();

    // Start UI refresh loop
    this._startRefreshLoop();
  }

  // ── Bootstrap historical data for all timeframes ─────────
  async _bootstrap() {
    const longestPeriod = PERIODS[PERIODS.length - 1]; // 100

    // Group timeframes by resolution to avoid duplicate fetches
    const resolutionGroups = {};
    TIMEFRAMES.forEach((tf, i) => {
      const res = tf.resolution;
      if (!resolutionGroups[res]) resolutionGroups[res] = [];
      resolutionGroups[res].push({ tf, index: i });
    });

    let anySuccess = false;

    // Fetch candles per resolution
    for (const [resolution, group] of Object.entries(resolutionGroups)) {
      try {
        const candles = await this.api.bootstrapFromProxyCache(resolution);

        if (candles.length > 0) {
          anySuccess = true;
          group.forEach(({ tf, index }) => {
            let tfCandles = candles;

            // Resample if this timeframe is non-native
            if (!tf.native && tf.resampleFactor) {
              tfCandles = MAEngine.resampleCandles(candles, tf.resampleFactor);
            }

            if (tfCandles.length > 0) {
              this.engine.bootstrapTimeframe(index, tfCandles);

              // Set initial price from most recent candle
              if (this.engine.currentPrice === 0) {
                this.engine.updatePrice(tfCandles[tfCandles.length - 1].close);
              }
            }
          });
        }
      } catch (err) {
        console.warn(`[App] Bootstrap failed for ${resolution}:`, err);
      }
    }

    this._bootstrapped = true;
    console.log(`[App] Bootstrap complete (${this._mode} mode, data: ${anySuccess})`);
    this._render();
  }

  // ── Handle live price update ─────────────────────────────
  _onPrice(price) {
    this.engine.updatePrice(price);
  }

  // ── Handle candle close ──────────────────────────────────
  _onCandle(resolution, candle) {
    // Find all timeframes that use this resolution
    TIMEFRAMES.forEach((tf, i) => {
      if (tf.resolution === resolution) {
        if (tf.native) {
          this.engine.updateTimeframeMA(i, candle);
        }
        // For non-native, we'd need to buffer candles and resample
        // This is handled by the bootstrap; live updates come via
        // the base resolution candles that feed native timeframes
      }
    });
  }

  // ── Timeframe tab change ─────────────────────────────────
  _onTimeframeChange(index) {
    this.renderer.activeTimeframe = index;
    this._render();
  }

  // ── Render everything ────────────────────────────────────
  _render() {
    if (!this._bootstrapped) return;

    const tfIdx = this.renderer.activeTimeframe;

    // Price header
    const ladderData = this.engine.getLadderData(tfIdx, this.renderer.sortMode);
    this.renderer.renderPrice(
      this.engine.currentPrice,
      ladderData.changePercent
    );

    // Ladder view
    this.renderer.renderLadder(ladderData);

    // Heatmap view
    const heatmapData = this.engine.getHeatmapData();
    this.renderer.renderHeatmap(heatmapData);

    // Crossovers
    const crossovers = this.engine.getCrossovers();
    this.renderer.renderCrossovers(crossovers);
  }

  // ── Start UI refresh loop ────────────────────────────────
  _startRefreshLoop() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => {
      if (this._bootstrapped) {
        this._render();
      }
    }, CONFIG.UI_REFRESH_INTERVAL);
  }

  // ── Cleanup ──────────────────────────────────────────────
  destroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    if (this.api) this.api.disconnect();
  }
}

// ── Launch ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.app = new TradecraftApp();
  window.app.init();
});
