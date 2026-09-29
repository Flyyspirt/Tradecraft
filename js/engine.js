// ─────────────────────────────────────────────────────────────
//  engine.js — Simple Moving Average (SMA/MA) calculation engine,
//              crossover detection, and candle resampling
// ─────────────────────────────────────────────────────────────

class MAEngine {
  constructor() {
    // Per-timeframe state
    // state[tfIndex] = {
    //   candles: [],          // array of { time, open, high, low, close, volume }
    //   mas: { 10: value, 20: value, ... },
    //   prevMAs: { 10: value, ... },   // previous tick's values (for rate-of-change)
    //   crossovers: [],       // recent crossover events
    //   initialized: false
    // }
    this.state = TIMEFRAMES.map(() => ({
      candles: [],
      mas: {},
      prevMAs: {},
      crossovers: [],
      initialized: false,
    }));

    this.currentPrice = 0;
    this.prevPrice = 0;
    this.openPrice = 0;          // for 24h change calculation
    this.crossoverLog = [];      // global crossover log (all timeframes)
    this.lastUpdate = Date.now();
  }

  // ── Bootstrap from historical candles ────────────────────
  // Called per timeframe after REST fetch
  bootstrapTimeframe(tfIndex, candles) {
    const s = this.state[tfIndex];
    s.candles = candles.slice(); // copy

    // Compute MA for each period from historical candles
    PERIODS.forEach(period => {
      s.mas[period] = this._computeSMA(s.candles, period);
    });

    // Set prevMAs to current (no rate-of-change on first tick)
    s.prevMAs = { ...s.mas };
    s.initialized = true;
  }

  // ── Update with new live price ───────────────────────────
  updatePrice(price) {
    this.prevPrice = this.currentPrice;
    this.currentPrice = price;
    if (this.openPrice === 0) this.openPrice = price;
    this.lastUpdate = Date.now();
  }

  // ── Update MA for a timeframe on new candle close ────────
  updateTimeframeMA(tfIndex, newCandle) {
    const s = this.state[tfIndex];

    // Save previous values for rate-of-change
    s.prevMAs = { ...s.mas };

    // Append candle
    s.candles.push(newCandle);
    // Keep buffer at longest period + margin
    const maxKeep = PERIODS[PERIODS.length - 1] + 10;
    if (s.candles.length > maxKeep) {
      s.candles = s.candles.slice(-maxKeep);
    }

    // Detect crossovers (compare before/after)
    const prevPositions = this._getRelativePositions(s.prevMAs);

    // Recalculate each MA (simple average of last N closes)
    PERIODS.forEach(period => {
      s.mas[period] = this._computeSMA(s.candles, period);
    });

    const newPositions = this._getRelativePositions(s.mas);
    this._detectCrossovers(tfIndex, prevPositions, newPositions);

    s.initialized = true;
  }


  // ── Get full state for a timeframe ───────────────────────
  getTimeframeState(tfIndex) {
    const s = this.state[tfIndex];
    return {
      mas: { ...s.mas },
      prevMAs: { ...s.prevMAs },
      initialized: s.initialized,
      crossovers: s.crossovers.slice(-10), // last 10
    };
  }

  // ── Get heatmap data (all timeframes, all periods) ───────
  getHeatmapData() {
    return TIMEFRAMES.map((tf, tfIdx) => {
      const s = this.state[tfIdx];
      if (!s.initialized) return null;

      return PERIODS.map(period => {
        const maVal = s.mas[period];
        if (maVal === undefined || maVal === 0) return null;

        const distance = this.currentPrice - maVal;
        const distancePct = (distance / this.currentPrice) * 100;
        const rateOfChange = s.prevMAs[period]
          ? ((maVal - s.prevMAs[period]) / s.prevMAs[period]) * 100
          : 0;

        return {
          period,
          value: maVal,
          distance,
          distancePct,
          rateOfChange,
          bullish: distance > 0,  // price above MA = bullish
        };
      });
    });
  }

  // ── Get sorted ladder data for a single timeframe ────────
  getLadderData(tfIndex, sortMode = SORT_MODES.DISTANCE) {
    const s = this.state[tfIndex];
    if (!s.initialized) return { above: [], below: [], price: this.currentPrice };

    const rows = PERIODS.map(period => {
      const value = s.mas[period] || 0;
      const distance = value - this.currentPrice;
      const distancePct = this.currentPrice ? (distance / this.currentPrice) * 100 : 0;
      const distanceBps = distancePct * 100; // basis points
      const prevVal = s.prevMAs[period] || value;
      const diffPts = value - prevVal;
      const diffPct = prevVal ? (diffPts / prevVal) * 100 : 0;
      const rateOfChange = diffPct * 100; // bps per update

      // Determine trend direction
      let trend = 'flat'; // ─
      if (rateOfChange > 2) trend = 'up';        // ↑
      else if (rateOfChange > 0.5) trend = 'rising'; // ↗
      else if (rateOfChange < -2) trend = 'down';    // ↓
      else if (rateOfChange < -0.5) trend = 'falling'; // ↘

      return {
        period,
        value,
        distance: Math.abs(distance),
        distancePct: Math.abs(distancePct),
        distanceBps: Math.abs(distanceBps),
        rawDistance: distance,
        diffPts,
        diffPct,
        rateOfChange,
        trend,
        side: distance >= 0 ? 'above' : 'below',
      };
    });

    const above = rows.filter(r => r.side === 'above').sort((a, b) => a.value - b.value);
    const below = rows.filter(r => r.side === 'below').sort((a, b) => b.value - a.value);

    return {
      above,
      below,
      price: this.currentPrice,
      prevPrice: this.prevPrice,
      changePercent: this.openPrice ? ((this.currentPrice - this.openPrice) / this.openPrice) * 100 : 0,
    };
  }

  // ── Get global crossover log ─────────────────────────────
  getCrossovers() {
    return this.crossoverLog.slice(-50); // last 50
  }

  // ── Resample candles from smaller timeframe ──────────────
  static resampleCandles(candles, factor) {
    const resampled = [];
    for (let i = 0; i < candles.length; i += factor) {
      const chunk = candles.slice(i, i + factor);
      if (chunk.length < factor) break; // skip incomplete
      resampled.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map(c => c.high)),
        low: Math.min(...chunk.map(c => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      });
    }
    return resampled;
  }

  // ── Internal: compute Simple Moving Average ──────────────
  // SMA = sum of last `period` closes / period
  _computeSMA(candles, period) {
    if (candles.length === 0) return 0;
    const slice = candles.slice(-period);
    const sum = slice.reduce((acc, c) => acc + c.close, 0);
    return sum / slice.length;
  }

  // ── Internal: get relative positions (short vs long) ─────
  _getRelativePositions(mas) {
    const positions = {};
    for (let i = 0; i < PERIODS.length; i++) {
      for (let j = i + 1; j < PERIODS.length; j++) {
        const key = `${PERIODS[i]}_${PERIODS[j]}`;
        const shortVal = mas[PERIODS[i]] || 0;
        const longVal = mas[PERIODS[j]] || 0;
        positions[key] = {
          status: shortVal > longVal ? 'above' : 'below',
          shortVal,
          longVal
        };
      }
    }
    return positions;
  }

  // ── Internal: detect crossovers between ticks ────────────
  _detectCrossovers(tfIndex, prevPositions, newPositions) {
    const tf = TIMEFRAMES[tfIndex];
    const s = this.state[tfIndex];

    Object.keys(newPositions).forEach(key => {
      if (prevPositions[key] && prevPositions[key].status !== newPositions[key].status) {
        const [shortPeriod, longPeriod] = key.split('_').map(Number);
        
        const currShortVal = newPositions[key].shortVal;
        const currLongVal = newPositions[key].longVal;
        const prevShortVal = prevPositions[key].shortVal;
        const prevLongVal = prevPositions[key].longVal;

        const type = newPositions[key].status === 'above' ? 'bullish' : 'bearish';
        const event = {
          time: Date.now(),
          timeframe: tf.label,
          tfIndex,
          shortPeriod,
          longPeriod,
          type,
          price: this.currentPrice,
          currShortVal,
          currLongVal,
          prevShortVal,
          prevLongVal
        };
        s.crossovers.push(event);
        this.crossoverLog.push(event);

        // Emit to proxy server for n8n/Azure orchestration
        fetch(CONFIG.API_BASE.replace('/candles', '') + '/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        }).catch(err => console.error('Alert emit failed', err));

        // Keep logs bounded
        if (s.crossovers.length > 50) s.crossovers = s.crossovers.slice(-50);
        if (this.crossoverLog.length > 200) this.crossoverLog = this.crossoverLog.slice(-200);
      }
    });
  }
}
