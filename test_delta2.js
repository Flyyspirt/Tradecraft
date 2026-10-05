async function run() {
  const res = await fetch('https://api.delta.exchange/v2/products', { headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const btcProducts = json.result.filter(p => p.symbol.includes('BTC'));
    console.log(btcProducts.map(p => ({ symbol: p.symbol, contract_type: p.contract_type })));
  } catch (e) {
    console.error('Error parsing JSON:', text.substring(0, 100));
  }
}
run();
