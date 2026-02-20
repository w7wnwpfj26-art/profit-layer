import pg from 'pg';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 手动加载 .env
const envPath = join(__dirname, '../.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      process.env[key] = value;
    }
  }
}

// 从私钥推算地址
function getAddressFromPrivateKey(privateKey) {
  // 使用 keccak256 和 secp256k1 推算（简化版）
  // 实际需要 viem 或 ethers
  return null; // 需要依赖库
}

// 链配置
const CHAINS = {
  arbitrum: { rpc: 'https://1rpc.io/arb', chainId: 42161 },
  base: { rpc: 'https://1rpc.io/base', chainId: 8453 },
  ethereum: { rpc: 'https://1rpc.io/eth', chainId: 1 },
  optimism: { rpc: 'https://1rpc.io/op', chainId: 10 },
  polygon: { rpc: 'https://1rpc.io/matic', chainId: 137 },
};

// 常见代币合约
const TOKENS = {
  arbitrum: {
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
  },
  base: {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  },
  ethereum: {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  },
};

// Aave V3 aToken 合约
const AAVE_ATOKENS = {
  arbitrum: {
    aUSDC: { address: '0x724dc807b04555b71ed48a6896b6F41593b8C637', underlying: 'USDC', decimals: 6 },
    aWETH: { address: '0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8', underlying: 'WETH', decimals: 18 },
    aUSDT: { address: '0x6ab707Aca953eDAeFBc4fD23bA73294241490620', underlying: 'USDT', decimals: 6 },
    aDAI: { address: '0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE', underlying: 'DAI', decimals: 18 },
  },
  base: {
    aUSDC: { address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', underlying: 'USDC', decimals: 6 },
    aWETH: { address: '0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7', underlying: 'WETH', decimals: 18 },
  },
};

// 查询 ERC20 余额
async function getBalance(rpcUrl, tokenAddress, walletAddress, decimals) {
  const data = '0x70a08231' + walletAddress.replace('0x', '').padStart(64, '0');
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: tokenAddress, data }, 'latest'],
      id: 1,
    }),
  });
  const json = await res.json();
  if (json.error || !json.result || json.result === '0x') return 0;
  const balance = BigInt(json.result);
  return Number(balance) / Math.pow(10, decimals);
}

// 查询原生代币余额
async function getNativeBalance(rpcUrl, walletAddress) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [walletAddress, 'latest'],
      id: 1,
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return 0;
  return Number(BigInt(json.result)) / 1e18;
}

// 代币价格（简化，使用固定值）
const PRICES = {
  ETH: 2500,
  WETH: 2500,
  USDC: 1,
  USDT: 1,
  DAI: 1,
};

async function main() {
  // 使用 viem 从私钥获取地址
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ 未找到 EVM_PRIVATE_KEY');
    process.exit(1);
  }

  // 动态导入 viem
  const { privateKeyToAccount } = await import('viem/accounts');
  const account = privateKeyToAccount(privateKey);
  const walletAddress = account.address;
  
  console.log(`\n🔍 扫描钱包: ${walletAddress}\n`);
  console.log('='.repeat(60));

  const positions = [];

  // 扫描各链
  for (const [chainId, config] of Object.entries(CHAINS)) {
    console.log(`\n📍 ${chainId.toUpperCase()}`);
    
    // 原生代币余额
    const nativeBalance = await getNativeBalance(config.rpc, walletAddress);
    if (nativeBalance > 0.001) {
      const symbol = chainId === 'ethereum' || chainId === 'arbitrum' || chainId === 'base' || chainId === 'optimism' ? 'ETH' : 
                     chainId === 'polygon' ? 'MATIC' : 'ETH';
      const valueUsd = nativeBalance * (PRICES[symbol] || 0);
      console.log(`  💰 ${symbol}: ${nativeBalance.toFixed(6)} ($${valueUsd.toFixed(2)})`);
      if (valueUsd > 1) {
        positions.push({
          chain: chainId,
          protocol: 'wallet',
          symbol,
          amount: nativeBalance,
          valueUsd,
          type: 'native',
        });
      }
    }

    // ERC20 代币余额
    const tokens = TOKENS[chainId];
    if (tokens) {
      for (const [symbol, token] of Object.entries(tokens)) {
        const balance = await getBalance(config.rpc, token.address, walletAddress, token.decimals);
        if (balance > 0.01) {
          const valueUsd = balance * (PRICES[symbol] || 1);
          console.log(`  💵 ${symbol}: ${balance.toFixed(6)} ($${valueUsd.toFixed(2)})`);
          if (valueUsd > 1) {
            positions.push({
              chain: chainId,
              protocol: 'wallet',
              symbol,
              amount: balance,
              valueUsd,
              type: 'erc20',
            });
          }
        }
      }
    }

    // Aave V3 aToken 余额
    const aTokens = AAVE_ATOKENS[chainId];
    if (aTokens) {
      for (const [aSymbol, aToken] of Object.entries(aTokens)) {
        const balance = await getBalance(config.rpc, aToken.address, walletAddress, aToken.decimals);
        if (balance > 0.01) {
          const valueUsd = balance * (PRICES[aToken.underlying] || 1);
          console.log(`  🏦 Aave ${aToken.underlying}: ${balance.toFixed(6)} ($${valueUsd.toFixed(2)})`);
          if (valueUsd > 1) {
            positions.push({
              chain: chainId,
              protocol: 'aave-v3',
              symbol: aToken.underlying,
              amount: balance,
              valueUsd,
              type: 'aave',
            });
          }
        }
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ 发现 ${positions.length} 个持仓\n`);

  if (positions.length === 0) {
    console.log('💡 钱包余额较少，无需同步');
    return;
  }

  // 写入数据库
  console.log('📝 写入 Supabase...\n');
  
  const client = new pg.Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'defi_yield',
    user: process.env.POSTGRES_USER || 'defi',
    password: process.env.POSTGRES_PASSWORD || 'change_me_in_production',
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  // 先确保有对应的 protocol 记录
  for (const pos of positions) {
    if (pos.protocol !== 'wallet') {
      await client.query(`
        INSERT INTO protocols (protocol_id, name, category, chain_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (protocol_id) DO NOTHING
      `, [pos.protocol, pos.protocol.toUpperCase(), 'lending', pos.chain]);
    }

    // 创建 pool 记录
    const poolId = `${pos.protocol}-${pos.chain}-${pos.symbol}`;
    await client.query(`
      INSERT INTO pools (pool_id, protocol_id, chain_id, symbol, tvl_usd, apr_total)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (pool_id) DO NOTHING
    `, [poolId, pos.protocol === 'wallet' ? null : pos.protocol, pos.chain, pos.symbol, 0, pos.protocol === 'aave-v3' ? 3.5 : 0]);

    // 创建持仓记录
    const positionId = `${walletAddress}-${poolId}`;
    await client.query(`
      INSERT INTO positions (position_id, pool_id, wallet_address, chain_id, strategy_id, value_usd, amount_token0, status, opened_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
      ON CONFLICT (position_id) DO UPDATE SET
        value_usd = EXCLUDED.value_usd,
        amount_token0 = EXCLUDED.amount_token0,
        updated_at = NOW()
    `, [positionId, poolId, walletAddress, pos.chain, pos.protocol === 'aave-v3' ? 'lending_arb_v1' : null, pos.valueUsd, pos.amount]);

    console.log(`  ✓ ${pos.chain}/${pos.protocol}/${pos.symbol}: $${pos.valueUsd.toFixed(2)}`);
  }

  // 更新钱包地址配置
  await client.query(`
    INSERT INTO system_config (key, value, description, category)
    VALUES ('evm_wallet_address', $1, 'EVM 钱包地址', 'wallet')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `, [walletAddress]);

  await client.end();

  console.log('\n✅ 持仓数据已同步到 Supabase！');
  console.log(`\n🔗 访问 http://localhost:3002/positions 查看\n`);
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
