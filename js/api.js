// ─────────────────────────────────────────────────────────────
//  api.js — Delta Exchange WebSocket + REST client
// ─────────────────────────────────────────────────────────────

class DeltaAPI {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.reconnecting = false;
    this.listeners = {
      price: [],      // (price) => void
      candle: [],     // (resolution, candle) => void
      status: [],     // (status) => void
    };
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
  }

  // ── Event subscription ───────────────────────────────────
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  _emit(event, ...args) {
    (this.listeners[event] || []).forEach(cb => cb(...args));
  }

  // ── REST: Fetch historical candles ───────────────────────
  async fetchCandles(resolution, startTime, endTime) {
    const url = `${CONFIG.API_BASE}/candles?resolution=${resolution}&start=${startTime}&end=${endTime}`;

    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Delta returns { success: true, result: [...] } or just an array
      let candles = Array.isArray(data) ? data : (data.result || []);

      // Normalize and sort by time ascending
      candles = candles.map(c => ({
        time: c.time || c.t,
        open: parseFloat(c.open || c.o),
        high: parseFloat(c.high || c.h),
        low: parseFloat(c.low || c.l),
        close: parseFloat(c.close || c.c),
        volume: parseFloat(c.volume || c.v || 0),
      })).sort((a, b) => a.time - b.time);

      return candles;
    } catch (err) {
      console.warn(`[API] Failed to fetch candles (${resolution}):`, err.message);
      return [];
    }
  }

  // ── REST: Fetch enough candles to bootstrap MAs ──────────
  async bootstrapCandles(resolution, periodsNeeded) {
    const now = Math.floor(Date.now() / 1000);
    // Determine minutes per candle for this resolution
    const resMinutes = this._resolutionToMinutes(resolution);
    // Need at least `periodsNeeded` candles
    const candlesNeeded = Math.ceil(periodsNeeded * CONFIG.BOOTSTRAP_MULTIPLIER);
    const secondsBack = candlesNeeded * resMinutes * 60;
    const start = now - secondsBack;

    console.log(`[API] Bootstrapping ${resolution}: fetching ${candlesNeeded} candles (${Math.round(secondsBack/3600)}h back)`);

    // May need multiple requests if > MAX_CANDLES_PER_REQUEST
    let allCandles = [];
    let fetchStart = start;

    while (fetchStart < now) {
      const fetchEnd = Math.min(fetchStart + CONFIG.MAX_CANDLES_PER_REQUEST * resMinutes * 60, now);
      const batch = await this.fetchCandles(resolution, fetchStart, fetchEnd);
      if (batch.length === 0) break;
      allCandles = allCandles.concat(batch);
      fetchStart = fetchEnd + 1;

      // Rate limit courtesy
      await new Promise(r => setTimeout(r, 200));
    }

    // The proxy already deduplicates, but we do it here too just in case
    const seen = new Set();
    allCandles = allCandles.filter(c => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    }).sort((a, b) => a.time - b.time);

    console.log(`[API] Got ${allCandles.length} candles for ${resolution}`);
    return allCandles;
  }

  // ── REST: Fetch from Proxy Cache directly ──────────────────
  async bootstrapFromProxyCache(resolution) {
    const url = `${CONFIG.API_BASE}/cache/${resolution}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.cached && data.result) {
        return data.result;
      }
    } catch(err) {
      console.warn(`[API] Cache fetch failed for ${resolution}:`, err.message);
    }
    return [];
  }

  // ── WebSocket: Connect and subscribe ─────────────────────
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this._emit('status', 'connecting');
    console.log('[WS] Connecting to', CONFIG.WS_URL);

    try {
      this.ws = new WebSocket(CONFIG.WS_URL);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this._emit('status', 'error');
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.connected = true;
      this.reconnecting = false;
      this._emit('status', 'connected');

      // Note: No need to send subscribe messages to the proxy!
      // The proxy handles subscription to Delta Exchange itself.
      
      // Start heartbeat
      this._startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      } catch (err) {
        // ignore non-JSON messages
      }
    };

    this.ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
      this._emit('status', 'error');
    };

    this.ws.onclose = (event) => {
      console.log('[WS] Closed:', event.code, event.reason);
      this.connected = false;
      this._stopHeartbeat();
      this._emit('status', 'disconnected');
      this._scheduleReconnect();
    };
  }

  // ── WebSocket: Disconnect ────────────────────────────────
  disconnect() {
    this.reconnecting = false;
    clearTimeout(this._reconnectTimer);
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this._emit('status', 'disconnected');
  }

  // ── Internal: send message ───────────────────────────────
  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // ── Internal: handle incoming WS message ─────────────────
  _handleMessage(msg) {
    // Initial state from proxy
    if (msg.type === 'init' && msg.data) {
      if (msg.data.price) {
        this._emit('price', msg.data.price);
      }
      return;
    }

    // Proxy format: { type: 'price', data: 12345 }
    if (msg.type === 'price') {
      this._emit('price', msg.data);
      return;
    }

    // Proxy format: { type: 'candle', data: { resolution: '1m', candle: {...} } }
    if (msg.type === 'candle' && msg.data) {
      this._emit('candle', msg.data.resolution, msg.data.candle);
      return;
    }

    // Proxy format: { type: 'status', data: 'connected' }
    if (msg.type === 'status') {
      this._emit('status', msg.data);
      return;
    }
  }

  // ── Internal: heartbeat ──────────────────────────────────
  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      this._send({ type: 'ping' });
    }, CONFIG.WS_HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // ── Internal: reconnect ──────────────────────────────────
  _scheduleReconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    console.log(`[WS] Reconnecting in ${CONFIG.WS_RECONNECT_DELAY}ms...`);
    this._reconnectTimer = setTimeout(() => {
      this.reconnecting = false;
      this.connect();
    }, CONFIG.WS_RECONNECT_DELAY);
  }

  // ── Internal: resolution string to minutes ───────────────
  _resolutionToMinutes(res) {
    const map = {
      '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30,
      '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720,
      '1d': 1440, '1w': 10080, '2w': 20160,
    };
    return map[res] || 1;
  }
}

// ── Simulation fallback ────────────────────────────────────
// Used when Delta Exchange API is unreachable (CORS, network, etc.)
class SimulatedAPI {
  constructor() {
    this.listeners = { price: [], candle: [], status: [] };
    this.price = 67420.00;
    this.startPrice = this.price;
    this._tickTimer = null;
    this.connected = false;
  }

  on(event, callback) {
    if (this.listeners[event]) this.listeners[event].push(callback);
  }

  _emit(event, ...args) {
    (this.listeners[event] || []).forEach(cb => cb(...args));
  }

  async fetchCandles(resolution, startTime, endTime) {
    // Generate synthetic historical candles
    const resMinutes = this._resolutionToMinutes(resolution);
    const candleSeconds = resMinutes * 60;
    const candles = [];
    let p = this.price - (Math.random() * 2000 - 1000);

    for (let t = startTime; t < endTime; t += candleSeconds) {
      const vol = p * 0.003;
      const open = p;
      const moves = [
        open + (Math.random() - 0.48) * vol,
        open + (Math.random() - 0.48) * vol,
        open + (Math.random() - 0.48) * vol,
      ];
      const high = Math.max(open, ...moves);
      const low = Math.min(open, ...moves);
      const close = moves[moves.length - 1];
      candles.push({ time: t, open, high, low, close, volume: Math.random() * 500 });
      p = close;
    }
    this.price = p;
    return candles;
  }

  async bootstrapCandles(resolution, periodsNeeded) {
    const now = Math.floor(Date.now() / 1000);
    const resMinutes = this._resolutionToMinutes(resolution);
    const candlesNeeded = Math.ceil(periodsNeeded * CONFIG.BOOTSTRAP_MULTIPLIER);
    const secondsBack = candlesNeeded * resMinutes * 60;
    return this.fetchCandles(resolution, now - secondsBack, now);
  }

  connect() {
    this.connected = true;
    this._emit('status', 'simulated');

    this._tickTimer = setInterval(() => {
      const vol = this.price * 0.0006;
      this.price += (Math.random() - 0.5) * vol * 2;
      this._emit('price', this.price);

      // Emit a 1m candle every ~60 ticks (simulated)
      if (Math.random() < 0.02) {
        this._emit('candle', '1m', {
          time: Math.floor(Date.now() / 1000),
          open: this.price,
          high: this.price + Math.random() * 20,
          low: this.price - Math.random() * 20,
          close: this.price,
          volume: Math.random() * 100,
        });
      }
    }, CONFIG.SIMULATION_TICK_MS);
  }

  disconnect() {
    clearInterval(this._tickTimer);
    this.connected = false;
    this._emit('status', 'disconnected');
  }

  _resolutionToMinutes(res) {
    const map = {
      '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30,
      '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720,
      '1d': 1440, '1w': 10080, '2w': 20160,
    };
    return map[res] || 1;
  }
}
