# Tradecraft MA Dashboard

A professional, latency-optimized, multi-timeframe Moving Average (MA) dashboard for Bitcoin futures (BTC/USD). Designed for institutional traders to execute structural analysis.

## Features

### 1. Live Data Pipeline
* **Node.js Proxy Architecture**: Maintains a single persistent WebSocket connection to Delta Exchange and caches historical data in memory.
* **Cost Efficiency**: Drops API calls from 17,000/day to nearly 10/day, avoiding rate limits.
* **Client-side Resampling**: Synthetically constructs intermediate timeframes (e.g., 10m, 45m, 6h) from native 1m candles.

### 2. The Ladder View (Support & Resistance Map)
Visualizes MA levels relative to the current live price.
* **Green Bars (Support) / Red Bars (Resistance)**.
* **Display Toggles**: Choose between showing distance to price (in bps), or the momentum difference from the previous MA candle in absolute points (pts) or percentage (%).

### 3. The Matrix Heatmap
A 180-cell confluence map (10 MA periods × 18 timeframes) that allows rapid identification of macroeconomic alignment and trend reversals.

### 4. MA Crossover Scanner
Continuously monitors 810 possible MA relationships in real-time.
* **Golden Cross (Bullish) / Death Cross (Bearish)**.
* **Timeframe Filter**: Isolate crossovers for specific timeframes (e.g., 1h chart).
* **Spread & Momentum Metrics**: Displays the spread between the two MAs and the momentum difference (Δ) of the fast MA.

## Running Locally

1. **Start the Proxy Server:**
   ```bash
   cd server
   npm install
   npm start
   ```
2. **Access the Dashboard:**
   Open a browser and navigate to `http://localhost:3000/index.html`.

## Next Steps (Roadmap)
* Azure Orchestrator / n8n integration for automated alerts.
