async function run() {
  const res = await fetch('https://api.delta.exchange/v2/products', { headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  const json = JSON.parse(text);
  const perps = json.result.filter(p => p.contract_type === 'perpetual_futures' && p.symbol.includes('BTC'));
  console.log(perps.map(p => ({ symbol: p.symbol })));
}
run();
