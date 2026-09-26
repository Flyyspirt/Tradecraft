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

## Deployment Guide

The dashboard is composed of two parts: the Frontend UI (static files) and the Backend Proxy (Node.js/Express). 

### 1. Azure App Service (Backend Proxy)
Since the proxy maintains a persistent WebSocket connection to Delta Exchange and holds memory state for historical caching, it must run on a persistent server (not a serverless function).
1. Connect your Azure account to this GitHub repository.
2. Create a new **Azure App Service (Node.js 20.x)**.
3. Set the startup command to `npm start` and root directory to `/server`.
4. The proxy will now listen and broadcast at your Azure URL (e.g., `https://tradecraft-proxy.azurewebsites.net`).

### 2. Vercel (Frontend Dashboard)
Vercel is optimal for the extremely fast delivery of our static frontend assets.
1. Import this GitHub repository into Vercel.
2. Override the Build Command to empty (it's static) and set Output Directory to the root.
3. In `js/config.js`, update `API_BASE` and `WS_URL` to point to your new Azure App Service URL instead of `localhost:3000`.
4. Vercel will deploy your dashboard.

### 3. Domain Configuration (tradecraftai.com)
1. Purchase `tradecraftai.com` (via Vercel, GoDaddy, Namecheap, etc.).
2. In Vercel, go to **Settings > Domains** and add `tradecraftai.com`.
3. Add the provided CNAME/A records to your domain registrar's DNS settings.

## Integrating with n8n / Orchestrators
The dashboard engine will automatically push crossover alerts to the proxy's webhook ingestion endpoint. 
To route these to **n8n**:
1. Open `server/proxy.js` and locate `app.post('/api/alerts')`.
2. Add an HTTP POST payload forwarding the `alert` JSON to your n8n Catch Hook URL.
3. Your Azure orchestrator / n8n workflow can now trigger email alerts, SMS, or automated trades using these real-time signals.
