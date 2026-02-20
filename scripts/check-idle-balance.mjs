const wallet = '0x41f74B75de939692191f87C3E671052Eaa956677';
const padded = wallet.slice(2).toLowerCase().padStart(64, '0');

async function q(to, data) {
  const body = {
    jsonrpc: '2.0',
    method: data ? 'eth_call' : 'eth_getBalance',
    params: data ? [{ to, data }, 'latest'] : [wallet, 'latest'],
    id: 1,
  };
  const r = await fetch('https://1rpc.io/arb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await r.json()).result;
}

const eth = parseInt(await q(), 16) / 1e18;
const weth = parseInt(await q('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', '0x70a08231' + '0'.repeat(24) + padded), 16) / 1e18;
const usdc = parseInt(await q('0xaf88d065e77c8cC2239327C5EDb3A432268e5831', '0x70a08231' + '0'.repeat(24) + padded), 16) / 1e6;
const usdt = parseInt(await q('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', '0x70a08231' + '0'.repeat(24) + padded), 16) / 1e6;

const lines = [];
lines.push(`ETH: ${eth.toFixed(6)} ($${(eth * 2800).toFixed(2)})`);
lines.push(`WETH: ${weth.toFixed(6)} ($${(weth * 2800).toFixed(2)})`);
lines.push(`USDC: ${usdc.toFixed(2)}`);
lines.push(`USDT: ${usdt.toFixed(2)}`);
lines.push(`Idle total: $${(eth * 2800 + weth * 2800 + usdc + usdt).toFixed(2)}`);

const { writeFileSync } = await import('fs');
writeFileSync('/Users/wangqi/Documents/ai/dapp/idle_balance.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));
