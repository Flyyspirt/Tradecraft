# Tradecraft: The Executive Dashboard

**Welcome to Tradecraft.** 
This is not just another crypto dashboard. Tradecraft is a high-performance, precision-engineered terminal designed to give you absolute command over the markets. Built on the principles of speed, data governance, and luxury, it delivers the raw power of Wall Street directly to your screen.

## 1. The Design Philosophy: "The Wolf of Wall Street"
We understand that you will be analyzing markets for hours on end. Screen fatigue and cluttered interfaces lead to missed opportunities. That is why we architected the Tradecraft UI with a strict focus on **cognitive ease and luxury**:
- **Warm Charcoal Canvas:** We eliminated stark black backgrounds to drastically reduce eye strain, replacing them with a deep, warm espresso-charcoal base.
- **Vintage Brass Accents:** High-end gold and brass indicators intuitively guide your eyes to the most critical data points without overwhelming them.
- **Low-Fatigue Data Streams:** Moving average crossovers and price action use desaturated *Terminal Green* and *Deep Crimson* to prevent the "halo effect" that causes headaches during long sessions.
- **Executive Typography:** We utilize the elegant *Playfair Display* for authoritative headers, juxtaposed with the highly precise *IBM Plex Mono* so every single decimal perfectly aligns.

## 2. Uncompromising Data Governance & Precision
Tradecraft's pipeline is strictly governed to ensure the data you see is the exact data executing on the order books. 
- **Absolute Time-Bucketing:** Unlike amateur dashboards that guess timeframes, our engine strictly groups raw ticks into precise Unix-time intervals (e.g., locking exactly onto the `00, 10, 20...` minute marks for a 10m candle). 
- **Real-Time Forming Candles:** The exact moment a trade hits Delta Exchange, Tradecraft updates the "forming candle" in-place, giving you a microsecond advantage before the candle officially closes.
- **Zero-Null Crossover Engine:** We have strictly typed our crossover engine to initialize gracefully. When booting, it intelligently searches for crossovers and definitively states "No crossover present right now" if the market is flat, completely removing ambiguity.

## 3. The Analytics Interface
- **The Matrix (Heatmap):** A massive birds-eye view of 10 moving averages across 18 timeframes.
- **The Ladder:** An order-book style view of where the price is relative to its historical moving averages.
- **The History Grid (New):** A beautifully paginated table showing 100 historical candles, combined with a 10x10 Matrix Grid toggle. Click any candle to instantly load its 10 unique Moving Averages in the adjacent Lookup Pane.

## 4. Cross-Functional Testing & Optimization
Before this release, Tradecraft passed rigorous internal testing protocols:
* **[OK] Live Data Pipeline Validation:** WebSockets maintain a persistent heartbeat with Delta Exchange.
* **[OK] Data Governance Audit:** 3m, 10m, and 45m synthetic timeframes perfectly align mathematically. 
* **[OK] Web Demand Optimization:** The internal proxy server caches up to 2,000 candles per timeframe on boot, allowing the frontend to load instantly without hitting API rate limits.
* **[OK] Elementalist Code Structure:** The architecture relies strictly on highly optimized Vanilla JavaScript. No heavy bloated frameworks. Just pure, unadulterated speed.

## 5. Deployment Instructions
To launch your terminal:
1. Open your command line and navigate to the `server` folder.
2. Run `npm install` (only needed once).
3. Run `node proxy.js`
4. Open your browser to `http://localhost:3000/index.html`.
