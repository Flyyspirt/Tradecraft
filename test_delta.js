const https = require('https');

https.get('https://api.delta.exchange/v2/products', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const btcProducts = json.result.filter(p => p.symbol.includes('BTC'));
    console.log(btcProducts.map(p => ({ symbol: p.symbol, contract_type: p.contract_type })));
  });
});
