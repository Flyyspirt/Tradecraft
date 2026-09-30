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

## Deployment Guide — Railway

We deploy the **Tradecraft dashboard** and the **n8n automation engine** as separate services inside a single [Railway](https://railway.com) project. Railway provides automatic CI/CD from GitHub, zero-downtime deploys, built-in HTTPS, and private internal networking between services.

### Architecture Overview

```
┌─────────────────── Railway Project ───────────────────┐
│                                                       │
│  ┌──────────────┐     internal      ┌──────────────┐  │
│  │  Tradecraft   │ ──── webhook ──→ │     n8n      │  │
│  │  Node.js      │    (private)     │  Automation  │  │
│  │  Proxy +      │                  │  Engine      │  │
│  │  Dashboard    │                  │  + Postgres  │  │
│  └──────┬───────┘                  └──────────────┘  │
│         │                                             │
│         ├── REST API  (/api/candles, /api/alerts)     │
│         ├── WebSocket (/ws) — live price + candles    │
│         └── Static UI (index.html, css/, js/)         │
│                                                       │
└───────────────────────────────────────────────────────┘
          ↕ wss://                    ↕ External APIs
   Delta Exchange API            (OpenAI, Telegram, etc.)
```

### Prerequisites
- A [Railway account](https://railway.com) (Hobby plan: $5/mo, includes $5 usage credit)
- This repository pushed to GitHub

### Step 1 — Deploy n8n (Orchestration Engine)
1. Log into Railway and click **New Project** → **Deploy from Template**.
2. Search for **"n8n"** and select the official community template.
3. Railway will automatically provision a **PostgreSQL** database and deploy n8n.
4. Click the n8n service → **Settings → Networking → Generate Domain** to get a public URL.
5. Open the n8n URL in your browser and create your admin account.

### Step 2 — Deploy Tradecraft (Dashboard + Proxy)
1. Inside the same Railway project, click **New** → **GitHub Repo** → select `Flyyspirt/Tradecraft`.
2. Railway will auto-detect the `railway.json` configuration file which handles:
   - **Build**: `cd server && npm install`
   - **Start**: `cd server && npm start`
   - **Restart Policy**: Auto-restart on failure (max 10 retries)
3. Click the Tradecraft service → **Settings → Networking → Generate Domain**.
4. Your live dashboard URL will be something like: `https://tradecraft-production-XXXX.up.railway.app`

> **Note:** No manual configuration is needed for API endpoints. The frontend (`js/config.js`) auto-detects whether it's running on `localhost` or a production domain and configures `API_BASE` and `WS_URL` accordingly.

### Step 3 — Domain Configuration (Optional)
1. Purchase `tradecraftai.com` from any registrar (Namecheap, Cloudflare, etc.).
2. In Railway, go to the Tradecraft service → **Settings → Networking → Custom Domains** → add `tradecraftai.com`.
3. Add the provided CNAME record to your domain registrar's DNS settings.
4. Railway will automatically provision and renew SSL certificates.

### Step 4 — Connect Tradecraft Alerts to n8n
Both services live in the same Railway project, so they can communicate via Railway's private internal network with zero latency.

1. In n8n, create a new workflow with a **Webhook** trigger node (method: POST). Copy the webhook URL.
2. In `server/proxy.js`, locate `app.post('/api/alerts')` and add a `fetch()` call to forward the alert payload to your n8n webhook URL.
3. n8n can now process real-time MA crossover signals to trigger:
   - Telegram/Discord/Slack notifications
   - Trade execution via exchange APIs
   - Data logging to Google Sheets or a database

### Environment Variables (Auto-Set by Railway)
| Variable | Description |
|---|---|
| `PORT` | Injected by Railway — the proxy server binds to this automatically |
| `RAILWAY_PUBLIC_DOMAIN` | Your service's public URL |
| `RAILWAY_PRIVATE_DOMAIN` | Internal URL for service-to-service communication |

### Project Structure
```
Tradecraft/
├── index.html              # Dashboard UI entry point
├── css/dashboard.css       # Styling
├── js/
│   ├── config.js           # Auto-detecting API/WS endpoints
│   ├── engine.js           # SMA calculation, crossover detection
│   ├── api.js              # WebSocket + REST client
│   ├── renderer.js         # DOM rendering (ladder, heatmap, crossovers)
│   └── app.js              # Main orchestrator
├── server/
│   ├── proxy.js            # Node.js proxy (Express + WS bridge to Delta Exchange)
│   └── package.json        # Server dependencies (express, ws)
├── railway.json            # Railway build + deploy configuration
└── README.md               # This file
```
