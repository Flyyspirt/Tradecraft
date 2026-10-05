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

    // Check if this is an update to an existing candle or a new candle
    const existingIdx = s.candles.findIndex(c => c.time === newCandle.time);

    if (existingIdx !== -1) {
      // Update in-place
      s.candles[existingIdx] = newCandle;
    } else {
      // Only save prevMAs when a new candle actually closes/forms
      s.prevMAs = { ...s.mas };
      s.candles.push(newCandle);
      s.candles.sort((a, b) => a.time - b.time);
    }
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
        const prevVal = s.prevMAs[period] || maVal;
        const diffPts = maVal - prevVal;
        const rateOfChange = prevVal ? (diffPts / prevVal) * 100 : 0;

        return {
          period,
          value: maVal,
          distance,
          distancePct,
          diffPts,
          rateOfChange,
          bullish: distance > 0,  // price above MA = bullish
          momentumBullish: diffPts >= 0 // MA is rising = bullish
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

  // ── Get Historical Data for a timeframe (1-100 candles) ──
  getHistoryData(tfIndex) {
    const s = this.state[tfIndex];
    if (!s.initialized || s.candles.length === 0) return [];

    // We want the last up to 100 candles.
    const count = Math.min(100, s.candles.length);
    const result = [];

    // For each of the last 100 candles, compute the SMA exactly at that point in time
    const startIndex = s.candles.length - count;

    for (let i = startIndex; i < s.candles.length; i++) {
      const candle = s.candles[i];
      const sliceBefore = s.candles.slice(0, i + 1); // Candles up to this one

      const mas = {};
      PERIODS.forEach(period => {
        mas[period] = this._computeSMA(sliceBefore, period);
      });

      result.push({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        mas
      });
    }

    return result.reverse(); // Most recent first
  }

  // ── Get global crossover log ─────────────────────────────
  getCrossovers() {
    return this.crossoverLog.slice(-50); // last 50
  }

  // ── Resample candles from smaller timeframe ──────────────
  static resampleCandles(candles, factor, targetMinutes) {
    if (candles.length === 0) return [];
    
    // Group candles by the target timeframe's absolute time bucket
    const targetSeconds = targetMinutes * 60;
    const groups = {};
    const orderedTimes = [];
    
    for (const c of candles) {
      const bucket = Math.floor(c.time / targetSeconds) * targetSeconds;
      if (!groups[bucket]) {
        groups[bucket] = [];
        orderedTimes.push(bucket);
      }
      groups[bucket].push(c);
    }
    
    const resampled = [];
    for (const bucket of orderedTimes) {
      const chunk = groups[bucket];
      // Note: we can allow incomplete current forming candle, but for historical ones we might 
      // just include them anyway to have the most recent data.
      resampled.push({
        time: bucket,
        open: chunk[0].open,
        high: Math.max(...chunk.map(c => c.high)),
        low: Math.min(...chunk.map(c => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      });
    }
    return resampled;
  }

  // ── Update MA for a non-native resampled timeframe ────────
  updateResampledTimeframeMA(tfIndex, newCandle, targetMinutes) {
    const s = this.state[tfIndex];
    if (s.candles.length === 0) return;

    const targetSeconds = targetMinutes * 60;
    const bucket = Math.floor(newCandle.time / targetSeconds) * targetSeconds;
    
    const lastCandle = s.candles[s.candles.length - 1];
    const isUpdate = lastCandle && lastCandle.time === bucket;

    if (!isUpdate) {
      // New resampled candle
      s.prevMAs = { ...s.mas };
      s.candles.push({
        time: bucket,
        open: newCandle.open,
        high: newCandle.high,
        low: newCandle.low,
        close: newCandle.close,
        volume: newCandle.volume,
      });
    } else {
      // Update existing resampled candle
      lastCandle.high = Math.max(lastCandle.high, newCandle.high);
      lastCandle.low = Math.min(lastCandle.low, newCandle.low);
      lastCandle.close = newCandle.close;
      lastCandle.volume += newCandle.volume; // Approximation for live updates
    }

    // Keep buffer at longest period + margin
    const maxKeep = PERIODS[PERIODS.length - 1] + 10;
    if (s.candles.length > maxKeep) {
      s.candles = s.candles.slice(-maxKeep);
    }

    // Recalculate MAs
    const prevPositions = this._getRelativePositions(s.prevMAs);
    PERIODS.forEach(period => {
      s.mas[period] = this._computeSMA(s.candles, period);
    });

    const newPositions = this._getRelativePositions(s.mas);
    this._detectCrossovers(tfIndex, prevPositions, newPositions);
    
    s.initialized = true;
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

        // Frontend no longer pushes to the server; the server detects crossovers itself 24/7.
        // We only maintain the local log for UI rendering.

        // Keep logs bounded
        if (s.crossovers.length > 50) s.crossovers = s.crossovers.slice(-50);
        if (this.crossoverLog.length > 200) this.crossoverLog = this.crossoverLog.slice(-200);
      }
    });
  }
}
