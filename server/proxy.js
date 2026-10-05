// ─────────────────────────────────────────────────────────────
//  proxy.js — Tradecraft MA Dashboard Proxy Server
//
//  Bridges Delta Exchange API to the browser:
//  1. REST proxy   → fixes CORS for historical candle fetches
//  2. WS bridge    → maintains 1 persistent Delta WS, fans out to browsers
//  3. Candle cache → serves bootstrap data without re-fetching
//
//  Usage:  npm install && node proxy.js
//  Runs on port 3000 (configurable via PORT env var)
// ─────────────────────────────────────────────────────────────

const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const path = require('path');

// ── Config ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const DELTA_API = 'https://api.delta.exchange/v2';
const DELTA_WS = 'wss://socket.delta.exchange';
const SYMBOL = 'BTCUSDT';

// Native resolutions to subscribe for live candle updates
const WS_CANDLE_RESOLUTIONS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

// Resolutions to bootstrap via REST (fetch historical data on startup)
const BOOTSTRAP_RESOLUTIONS = {
  '1m':  { candles: 200, minutesPerCandle: 1 },
  '3m':  { candles: 200, minutesPerCandle: 3 },
  '5m':  { candles: 200, minutesPerCandle: 5 },
  '15m': { candles: 200, minutesPerCandle: 15 },
  '30m': { candles: 200, minutesPerCandle: 30 },
  '1h':  { candles: 200, minutesPerCandle: 60 },
  '2h':  { candles: 200, minutesPerCandle: 120 },
  '4h':  { candles: 200, minutesPerCandle: 240 },
  '1d':  { candles: 200, minutesPerCandle: 1440 },
  '1w':  { candles: 150, minutesPerCandle: 10080 },
};

// ── State ──────────────────────────────────────────────────
const candleCache = {};          // { '1m': [...candles], '5m': [...], ... }
let deltaWS = null;              // single connection to Delta Exchange
let reconnectTimer = null;
let heartbeatTimer = null;
let currentPrice = 0;
let wsConnected = false;
let recentAlerts = []; // Store recent crossovers for n8n/Azure to fetch

// All connected browser clients
const browserClients = new Set();

// ── Express App ────────────────────────────────────────────
const app = express();

// CORS middleware — allow all origins (this is a local proxy)
app.use(express.json()); // Added for parsing JSON POST requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve the frontend static files
app.use(express.static(path.join(__dirname, '..')));

// ── REST Proxy: Forward candle requests to Delta ───────────
app.get('/api/candles', async (req, res) => {
  const { resolution, start, end } = req.query;
  if (!resolution || !start || !end) {
    return res.status(400).json({ error: 'Missing resolution, start, or end' });
  }

  const url = `${DELTA_API}/history/candles?resolution=${resolution}&symbol=${SYMBOL}&start=${start}&end=${end}`;
  log(`REST proxy → ${resolution} (${start}→${end})`);

  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    log(`REST proxy error: ${err.message}`);
    res.status(502).json({ error: 'Failed to fetch from Delta Exchange', detail: err.message });
  }
});

// ── Cache endpoint: serve cached candles ───────────────────
app.get('/api/cache/:resolution', (req, res) => {
  const { resolution } = req.params;
  const cached = candleCache[resolution];
  if (!cached || cached.length === 0) {
    return res.json({ result: [], cached: false });
  }
  res.json({ result: cached, cached: true, count: cached.length });
});

// ── Cache status endpoint ──────────────────────────────────
app.get('/api/status', (req, res) => {
  const cacheStatus = {};
  for (const [resolution, candles] of Object.entries(candleCache)) {
    cacheStatus[resolution] = candles.length;
  }
  res.json({
    wsConnected,
    currentPrice,
    browserClients: browserClients.size,
    cache: cacheStatus,
    uptime: process.uptime(),
  });
});

// ── Webhook / Alert Endpoints (for n8n & Azure) ────────────

// Endpoint for external orchestrators (n8n/Azure) to fetch recent alerts
app.get('/api/alerts', (req, res) => {
  const authHeader = req.headers['x-tradecraft-auth'];
  const expectedSecret = process.env.TRADECRAFT_SECRET;

  // If a secret is configured on the server, require it
  if (expectedSecret && authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({
    success: true,
    count: recentAlerts.length,
    alerts: recentAlerts
  });
});

// ── HTTP Server ────────────────────────────────────────────
const server = http.createServer(app);

// ── WebSocket Server (browser-facing) ──────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  browserClients.add(ws);
  log(`Browser connected (${browserClients.size} total)`);

  // Send current state immediately
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      price: currentPrice,
      wsConnected,
      cache: Object.keys(candleCache).reduce((acc, res) => {
        acc[res] = candleCache[res]?.length || 0;
        return acc;
      }, {}),
    },
  }));

  ws.on('close', () => {
    browserClients.delete(ws);
    log(`Browser disconnected (${browserClients.size} total)`);
  });

  ws.on('error', () => browserClients.delete(ws));
});

// ── Broadcast to all browser clients ───────────────────────
function broadcast(message) {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ── Delta Exchange WebSocket Client ────────────────────────
function connectDeltaWS() {
  if (deltaWS && (deltaWS.readyState === WebSocket.CONNECTING || deltaWS.readyState === WebSocket.OPEN)) {
    return;
  }

  log('Connecting to Delta Exchange WebSocket...');

  try {
    deltaWS = new WebSocket(DELTA_WS);
  } catch (err) {
    log(`Failed to create WS: ${err.message}`);
    scheduleReconnect();
    return;
  }

  deltaWS.on('open', () => {
    wsConnected = true;
    log('✓ Connected to Delta Exchange WebSocket');

    // Subscribe to ticker for real-time price
    const channels = [
      { name: 'v2/ticker', symbols: [SYMBOL] },
    ];

    // Subscribe to candlestick channels for all native resolutions
    WS_CANDLE_RESOLUTIONS.forEach(res => {
      channels.push({ name: `candlestick_${res}`, symbols: [SYMBOL] });
    });

    deltaWS.send(JSON.stringify({
      type: 'subscribe',
      payload: { channels },
    }));

    log(`Subscribed to ${channels.length} channels`);

    // Notify browsers
    broadcast({ type: 'status', data: 'connected' });

    // Start heartbeat
    startHeartbeat();
  });

  deltaWS.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleDeltaMessage(msg);
    } catch (err) {
      // Ignore non-JSON messages (pongs, etc.)
    }
  });

  deltaWS.on('error', (err) => {
    log(`Delta WS error: ${err.message}`);
  });

  deltaWS.on('close', (code, reason) => {
    wsConnected = false;
    log(`Delta WS closed: ${code} ${reason}`);
    stopHeartbeat();
    broadcast({ type: 'status', data: 'disconnected' });
    scheduleReconnect();
  });
}

// ── Handle incoming Delta messages ─────────────────────────
function handleDeltaMessage(msg) {
  // v2/ticker — extract mark price
  if (msg.type === 'v2/ticker' || (msg.channel === 'v2/ticker' && msg.data)) {
    const data = msg.data || msg;
    const price = parseFloat(data.mark_price || data.close || data.last_price);
    if (price && !isNaN(price) && price > 0) {
      currentPrice = price;
      broadcast({ type: 'price', data: price });
    }
    return;
  }

  // Candlestick updates
  const candleMatch = (msg.type && msg.type.match(/^candlestick_(\w+)$/)) ||
                      (msg.channel && msg.channel.match(/^candlestick_(\w+)$/));

  if (candleMatch) {
    const resolution = candleMatch[1];
    const d = msg.data || msg;
    const candle = {
      time: parseInt(d.time || d.candle_start_time),
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volume || 0),
    };

    if (candle.close && !isNaN(candle.close) && candle.time) {
      // Update cache
      updateCandleCache(resolution, candle);

      // Update price from candle close
      if (resolution === '1m') {
        currentPrice = candle.close;
      }

      // Forward to browsers
      broadcast({
        type: 'candle',
        data: { resolution, candle },
      });
    }
    return;
  }

  // Subscription confirmations
  if (msg.type === 'subscriptions' || msg.type === 'subscribe') {
    log(`Subscription confirmed: ${JSON.stringify(msg).substring(0, 200)}`);
  }
}

// ── Update candle cache ────────────────────────────────────
function updateCandleCache(resolution, candle) {
  if (!candleCache[resolution]) {
    candleCache[resolution] = [];
  }

  const cache = candleCache[resolution];

  // Check if this candle updates the last one (same timestamp) or is new
  if (cache.length > 0 && cache[cache.length - 1].time === candle.time) {
    // Update in-place (candle still forming)
    cache[cache.length - 1] = candle;
  } else {
    // New candle
    cache.push(candle);

    // Keep buffer bounded
    const maxSize = BOOTSTRAP_RESOLUTIONS[resolution]?.candles || 200;
    if (cache.length > maxSize + 50) {
      candleCache[resolution] = cache.slice(-maxSize);
    }
  }

  // Run server-side crossover detection on updated cache
  runCrossoverEngine(resolution, cache);
}

// ── Server-Side Crossover Engine ───────────────────────────
const PERIODS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const previousMAs = {}; 

function computeSMA(candles, period) {
  if (candles.length === 0) return 0;
  const slice = candles.slice(-period);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  return sum / slice.length;
}

function getRelativePositions(mas) {
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

function runCrossoverEngine(resolution, cache) {
  if (!cache || cache.length === 0) return;

  const currentMAs = {};
  PERIODS.forEach(period => {
    currentMAs[period] = computeSMA(cache, period);
  });

  const newPositions = getRelativePositions(currentMAs);

  if (!previousMAs[resolution]) {
    previousMAs[resolution] = newPositions;
    return;
  }

  const prevPositions = previousMAs[resolution];

  Object.keys(newPositions).forEach(key => {
    if (prevPositions[key] && prevPositions[key].status !== newPositions[key].status) {
      const [shortPeriod, longPeriod] = key.split('_').map(Number);
      
      const type = newPositions[key].status === 'above' ? 'bullish' : 'bearish';
      const event = {
        time: Date.now(),
        timeframe: resolution,
        shortPeriod,
        longPeriod,
        type,
        price: currentPrice,
        currShortVal: newPositions[key].shortVal,
        currLongVal: newPositions[key].longVal,
        prevShortVal: prevPositions[key].shortVal,
        prevLongVal: prevPositions[key].longVal
      };
      
      recentAlerts.unshift(event);
      if (recentAlerts.length > 200) recentAlerts.pop();

      log(`[ALERT] ${event.timeframe} MA${event.shortPeriod}xMA${event.longPeriod} ${event.type.toUpperCase()} @ $${event.price}`);
      
      // Fire to n8n webhook securely
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
      
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Tradecraft-Auth': webhookSecret || ''
          },
          body: JSON.stringify(event)
        }).catch(err => log(`[Alert Engine] Webhook failed: ${err.message}`));
      }
    }
  });

  previousMAs[resolution] = newPositions;
}

// ── Bootstrap: Fetch historical candles on startup ─────────
async function bootstrapCandles() {
  log('Bootstrapping historical candles...');
  const now = Math.floor(Date.now() / 1000);

  for (const [resolution, config] of Object.entries(BOOTSTRAP_RESOLUTIONS)) {
    const secondsBack = config.candles * config.minutesPerCandle * 60;
    const start = now - secondsBack;
    const url = `${DELTA_API}/history/candles?resolution=${resolution}&symbol=${SYMBOL}&start=${start}&end=${now}`;

    try {
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        log(`  ✗ ${resolution}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      let candles = Array.isArray(data) ? data : (data.result || []);

      // Normalize
      candles = candles.map(c => ({
        time: parseInt(c.time || c.t),
        open: parseFloat(c.open || c.o),
        high: parseFloat(c.high || c.h),
        low: parseFloat(c.low || c.l),
        close: parseFloat(c.close || c.c),
        volume: parseFloat(c.volume || c.v || 0),
      })).filter(c => c.close && !isNaN(c.close) && c.time)
        .sort((a, b) => a.time - b.time);

      candleCache[resolution] = candles;

      // Set price from most recent candle
      if (candles.length > 0 && currentPrice === 0) {
        currentPrice = candles[candles.length - 1].close;
      }

      log(`  ✓ ${resolution}: ${candles.length} candles cached`);

      // Rate limit courtesy — 200ms between requests
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      log(`  ✗ ${resolution}: ${err.message}`);
    }
  }

  log(`Bootstrap complete. Current price: $${currentPrice.toLocaleString()}`);
}

// ── Heartbeat ──────────────────────────────────────────────
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (deltaWS && deltaWS.readyState === WebSocket.OPEN) {
      deltaWS.send(JSON.stringify({ type: 'ping' }));
    }
  }, 15000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ── Reconnect ──────────────────────────────────────────────
function scheduleReconnect() {
  if (reconnectTimer) return;
  log('Reconnecting in 5s...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectDeltaWS();
  }, 5000);
}

// ── Logging ────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

// ── Start ──────────────────────────────────────────────────
(async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   Tradecraft MA Dashboard — Proxy Server ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // 1. Bootstrap historical candles from REST API
  await bootstrapCandles();

  // 2. Connect WebSocket for live updates
  connectDeltaWS();

  // 3. Start HTTP + WS server
  server.listen(PORT, () => {
    console.log('');
    log(`Server running on http://localhost:${PORT}`);
    log(`Dashboard:  http://localhost:${PORT}/index.html`);
    log(`REST proxy: http://localhost:${PORT}/api/candles`);
    log(`WS bridge:  ws://localhost:${PORT}/ws`);
    log(`Status:     http://localhost:${PORT}/api/status`);
    console.log('');
  });
})();

// ── Graceful shutdown ──────────────────────────────────────
process.on('SIGINT', () => {
  log('Shutting down...');
  stopHeartbeat();
  if (deltaWS) deltaWS.close();
  server.close();
  process.exit(0);
});
