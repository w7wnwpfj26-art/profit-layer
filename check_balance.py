#!/usr/bin/env python3
"""
钱包余额检查脚本
动态获取 CoinGecko 价格，计算各链资产总值
"""

import urllib.request
import json
import os

# 钱包地址
WALLET = os.environ.get('WALLET_ADDRESS', '0x41f74B75de939692191f87C3E671052Eaa956677')
PADDED = WALLET[2:].lower().rjust(64, '0')

# RPC 端点
RPC_URLS = {
    'arbitrum': 'https://1rpc.io/arb',
    'ethereum': 'https://1rpc.io/eth',
    'base': 'https://1rpc.io/base',
}

# CoinGecko ID 映射
COINGECKO_IDS = {
    'ETH': 'ethereum',
    'WETH': 'ethereum',
    'ARB': 'arbitrum',
    'USDC': 'usd-coin',
    'USDT': 'tether',
    'DAI': 'dai',
}

# 默认价格（API 失败时使用）
DEFAULT_PRICES = {
    'ETH': 2100,
    'WETH': 2100,
    'ARB': 0.12,
    'USDC': 1,
    'USDT': 1,
    'DAI': 1,
}


def rpc_call(rpc_url: str, data: dict) -> dict:
    """发送 RPC 请求"""
    req = urllib.request.Request(
        rpc_url,
        json.dumps(data).encode(),
        {'Content-Type': 'application/json'}
    )
    return json.loads(urllib.request.urlopen(req, timeout=10).read())


def get_prices() -> dict:
    """从 CoinGecko 获取实时价格"""
    try:
        ids = ','.join(set(COINGECKO_IDS.values()))
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req, timeout=10)
        data = json.loads(res.read())
        
        prices = {}
        for symbol, cg_id in COINGECKO_IDS.items():
            prices[symbol] = data.get(cg_id, {}).get('usd', DEFAULT_PRICES.get(symbol, 0))
        
        return prices
    except Exception as e:
        print(f"⚠️  获取价格失败，使用默认价格: {e}")
        return DEFAULT_PRICES.copy()


def get_native_balance(rpc_url: str, address: str) -> float:
    """获取原生代币余额"""
    r = rpc_call(rpc_url, {
        'jsonrpc': '2.0',
        'method': 'eth_getBalance',
        'params': [address, 'latest'],
        'id': 1
    })
    if 'result' not in r:
        return 0
    return int(r['result'], 16) / 1e18


def get_erc20_balance(rpc_url: str, token_address: str, wallet: str, decimals: int) -> float:
    """获取 ERC20 代币余额"""
    data = '0x70a08231' + '0' * 24 + wallet[2:].lower()
    r = rpc_call(rpc_url, {
        'jsonrpc': '2.0',
        'method': 'eth_call',
        'params': [{'to': token_address, 'data': data}, 'latest'],
        'id': 1
    })
    if 'result' not in r:
        return 0
    return int(r['result'], 16) / (10 ** decimals)


def main():
    print(f"\n🔍 扫描钱包: {WALLET}")
    print("=" * 50)
    
    # 获取实时价格
    prices = get_prices()
    print(f"📊 当前价格: ETH=${prices['ETH']:.2f}, ARB=${prices['ARB']:.4f}\n")
    
    total_usd = 0
    
    # Arbitrum 链
    arb_rpc = RPC_URLS['arbitrum']
    
    # ETH 余额
    eth = get_native_balance(arb_rpc, WALLET)
    eth_usd = eth * prices['ETH']
    if eth > 0.0001:
        print(f"  💎 ETH:  {eth:.6f} (${eth_usd:.2f})")
        total_usd += eth_usd
    
    # WETH 余额
    weth = get_erc20_balance(arb_rpc, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', WALLET, 18)
    weth_usd = weth * prices['WETH']
    if weth > 0.0001:
        print(f"  💎 WETH: {weth:.6f} (${weth_usd:.2f})")
        total_usd += weth_usd
    
    # USDC 余额
    usdc = get_erc20_balance(arb_rpc, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', WALLET, 6)
    usdc_usd = usdc * prices['USDC']
    if usdc > 0.01:
        print(f"  💵 USDC: {usdc:.2f} (${usdc_usd:.2f})")
        total_usd += usdc_usd
    
    # USDT 余额
    usdt = get_erc20_balance(arb_rpc, '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', WALLET, 6)
    usdt_usd = usdt * prices['USDT']
    if usdt > 0.01:
        print(f"  💵 USDT: {usdt:.2f} (${usdt_usd:.2f})")
        total_usd += usdt_usd
    
    # DAI 余额
    dai = get_erc20_balance(arb_rpc, '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', WALLET, 18)
    dai_usd = dai * prices['DAI']
    if dai > 0.01:
        print(f"  💵 DAI:  {dai:.2f} (${dai_usd:.2f})")
        total_usd += dai_usd
    
    # ARB 余额
    arb = get_erc20_balance(arb_rpc, '0x912CE59144191C1204E64559FE8253a0e49E6548', WALLET, 18)
    arb_usd = arb * prices['ARB']
    if arb > 0.01:
        print(f"  🪙  ARB:  {arb:.2f} (${arb_usd:.2f})")
        total_usd += arb_usd
    
    print("\n" + "=" * 50)
    print(f"💰 总资产: ${total_usd:.2f}")
    
    return total_usd


if __name__ == "__main__":
    main()
