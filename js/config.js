// ─────────────────────────────────────────────────────────────
//  config.js — Constants & configuration for the MA Dashboard
// ─────────────────────────────────────────────────────────────

// ── Auto-detect environment ──────────────────────────────────
// Works on both localhost:3000 and Railway production deployment
const _isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const _httpBase = _isLocal
  ? 'http://localhost:3000'
  : `${window.location.protocol}//${window.location.host}`;
const _wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const _wsBase = _isLocal
  ? 'ws://localhost:3000'
  : `${_wsProto}//${window.location.host}`;

const CONFIG = {
  // ── API Endpoints ──────────────────────────────────────────
  // Auto-detected — no manual changes needed for deployment
  API_BASE: `${_httpBase}/api`,
  WS_URL: `${_wsBase}/ws`,
  SYMBOL: 'BTCUSDT',

  // ── Candle limits ──────────────────────────────────────────
  MAX_CANDLES_PER_REQUEST: 2000,  // API limit ~4000, stay conservative
  BOOTSTRAP_MULTIPLIER: 1.5,      // fetch 1.5× longest MA period for buffer

  // ── Update intervals (ms) ─────────────────────────────────
  UI_REFRESH_INTERVAL: 1000,      // re-render UI every 1 second
  WS_HEARTBEAT_INTERVAL: 15000,   // ping every 15s to keep WS alive
  WS_RECONNECT_DELAY: 3000,       // wait 3s before reconnecting

  // ── Simulation fallback ────────────────────────────────────
  // If API is unreachable, fall back to simulated data
  ENABLE_SIMULATION_FALLBACK: true,
  SIMULATION_TICK_MS: 1400,
};

// ── Timeframes ─────────────────────────────────────────────
// `resolution` = the Delta Exchange native resolution to fetch
// `native` = whether Delta provides this candle natively
// `resampleFrom` = for non-native, which native resolution to resample from
const TIMEFRAMES = [
  { label: '1m',  minutes: 1,     resolution: '1m',  native: true  },
  { label: '3m',  minutes: 3,     resolution: '3m',  native: true  },
  { label: '5m',  minutes: 5,     resolution: '5m',  native: true  },
  { label: '10m', minutes: 10,    resolution: '5m',  native: false, resampleFrom: '5m', resampleFactor: 2 },
  { label: '15m', minutes: 15,    resolution: '15m', native: true  },
  { label: '30m', minutes: 30,    resolution: '30m', native: true  },
  { label: '45m', minutes: 45,    resolution: '15m', native: false, resampleFrom: '15m', resampleFactor: 3 },
  { label: '1h',  minutes: 60,    resolution: '1h',  native: true  },
  { label: '90m', minutes: 90,    resolution: '30m', native: false, resampleFrom: '30m', resampleFactor: 3 },
  { label: '2h',  minutes: 120,   resolution: '2h',  native: true  },
  { label: '3h',  minutes: 180,   resolution: '1h',  native: false, resampleFrom: '1h', resampleFactor: 3 },
  { label: '4h',  minutes: 240,   resolution: '4h',  native: true  },
  { label: '6h',  minutes: 360,   resolution: '2h',  native: false, resampleFrom: '2h', resampleFactor: 3 },
  { label: '12h', minutes: 720,   resolution: '4h',  native: false, resampleFrom: '4h', resampleFactor: 3 },
  { label: '1d',  minutes: 1440,  resolution: '1d',  native: true  },
  { label: '1w',  minutes: 10080, resolution: '1w',  native: true  },
  { label: '2w',  minutes: 20160, resolution: '1w',  native: false, resampleFrom: '1w', resampleFactor: 2 },
  { label: '4w',  minutes: 40320, resolution: '1w',  native: false, resampleFrom: '1w', resampleFactor: 4 },
];

// ── MA Periods ─────────────────────────────────────────────
const PERIODS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// ── View modes ─────────────────────────────────────────────
const VIEW_MODES = {
  LADDER: 'ladder',
  HEATMAP: 'heatmap',
  DOC: 'doc'
};

// ── Sort modes ─────────────────────────────────────────────
const SORT_MODES = {
  DISTANCE: 'distance',    // default: distance from current price
  VALUE: 'value',          // raw MA value
  RATE: 'rate',            // rate of change (momentum)
};
