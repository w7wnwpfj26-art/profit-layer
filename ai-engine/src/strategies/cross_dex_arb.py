"""
Cross-DEX Arbitrage Strategy

Detects price discrepancies across DEXs for the same token pair.
Uses real price quote APIs (1inch, Jupiter, CoinGecko) where possible.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import aiohttp

logger = logging.getLogger(__name__)

# 各链 DEX 聚合器 API（免费端点，无需 API Key）
QUOTE_APIS = {
    "1inch_ethereum": "https://api.1inch.dev/swap/v6.0/1/quote",
    "1inch_arbitrum": "https://api.1inch.dev/swap/v6.0/42161/quote",
    "1inch_bsc": "https://api.1inch.dev/swap/v6.0/56/quote",
    "1inch_polygon": "https://api.1inch.dev/swap/v6.0/137/quote",
    "1inch_base": "https://api.1inch.dev/swap/v6.0/8453/quote",
    "1inch_optimism": "https://api.1inch.dev/swap/v6.0/10/quote",
    "1inch_avalanche": "https://api.1inch.dev/swap/v6.0/43114/quote",
    "jupiter_solana": "https://quote-api.jup.ag/v6/quote",
}

# 常见稳定币地址（用于报价基准）
USDC_ADDRESSES = {
    "ethereum": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "arbitrum": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "bsc": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    "polygon": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "optimism": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    "avalanche": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    "solana": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
}

# 链 → Gas 成本估算 (USD)
GAS_COST_MAP = {
    "ethereum": 15.0,
    "arbitrum": 0.3,
    "bsc": 0.2,
    "polygon": 0.05,
    "base": 0.1,
    "optimism": 0.2,
    "avalanche": 0.3,
    "solana": 0.005,
    "aptos": 0.01,
}


@dataclass
class ArbOpportunity:
    token_pair: str
    buy_dex: str
    buy_chain: str
    buy_price: float
    sell_dex: str
    sell_chain: str
    sell_price: float
    spread_pct: float
    estimated_profit_usd: float
    gas_cost_usd: float
    net_profit_usd: float
    cross_chain: bool
    confidence: float = 0.0
    timestamp: str = ""


class CrossDexArbStrategy:
    """
    Identifies arbitrage opportunities across DEXs.

    Two modes:
    1. Quote-based (real): Fetches actual quotes from DEX aggregators
    2. Pool-based (heuristic): Uses pool APR/TVL differentials as proxy signals
    """

    def __init__(
        self,
        min_spread_pct: float = 0.5,
        min_profit_usd: float = 10.0,
        api_key_1inch: str = "",
    ):
        self.min_spread = min_spread_pct
        self.min_profit = min_profit_usd
        self.api_key_1inch = api_key_1inch

    # ---------- Quote-Based Mode ----------

    async def fetch_1inch_quote(
        self,
        session: aiohttp.ClientSession,
        chain: str,
        src_token: str,
        dst_token: str,
        amount: int,
    ) -> float | None:
        """Fetch a swap quote from 1inch aggregator."""
        chain_map = {
            "ethereum": 1, "arbitrum": 42161, "bsc": 56,
            "polygon": 137, "base": 8453, "optimism": 10, "avalanche": 43114,
        }
        chain_id = chain_map.get(chain)
        if not chain_id:
            return None

        url = f"https://api.1inch.dev/swap/v6.0/{chain_id}/quote"
        params = {"src": src_token, "dst": dst_token, "amount": str(amount)}
        headers = {}
        if self.api_key_1inch:
            headers["Authorization"] = f"Bearer {self.api_key_1inch}"

        try:
            async with session.get(url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return int(data.get("dstAmount", 0)) / (10 ** 6)  # Assume 6 decimals (USDC)
                else:
                    return None
        except Exception as e:
            logger.debug(f"1inch quote failed ({chain}): {e}")
            return None

    async def fetch_jupiter_quote(
        self,
        session: aiohttp.ClientSession,
        input_mint: str,
        output_mint: str,
        amount: int,
    ) -> float | None:
        """Fetch a swap quote from Jupiter (Solana)."""
        url = "https://quote-api.jup.ag/v6/quote"
        params = {
            "inputMint": input_mint,
            "outputMint": output_mint,
            "amount": str(amount),
            "slippageBps": "50",
        }
        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return int(data.get("outAmount", 0)) / (10 ** 6)
                return None
        except Exception as e:
            logger.debug(f"Jupiter quote failed: {e}")
            return None

    async def scan_cross_chain_arb(
        self,
        token_address_map: dict[str, str],
        quote_token_map: dict[str, str],
        trade_size_usd: float = 1000,
    ) -> list[ArbOpportunity]:
        """
        Fetch real quotes across chains for the same token and find arb.

        Args:
            token_address_map: { chain: token_address } for the token to check
            quote_token_map: { chain: usdc_address } for the quote token
            trade_size_usd: Trade size in USD
        """
        quotes: dict[str, float] = {}
        amount_in = int(trade_size_usd * 1e6)  # Assume 6 decimal input

        async with aiohttp.ClientSession() as session:
            tasks = {}
            for chain, token_addr in token_address_map.items():
                usdc_addr = quote_token_map.get(chain, USDC_ADDRESSES.get(chain, ""))
                if not usdc_addr:
                    continue
                if chain == "solana":
                    tasks[chain] = self.fetch_jupiter_quote(session, usdc_addr, token_addr, amount_in)
                else:
                    tasks[chain] = self.fetch_1inch_quote(session, chain, usdc_addr, token_addr, amount_in)

            results = await asyncio.gather(*tasks.values(), return_exceptions=True)
            for chain, result in zip(tasks.keys(), results):
                if isinstance(result, (int, float)) and result > 0:
                    quotes[chain] = result

        if len(quotes) < 2:
            return []

        opportunities = []
        chains = list(quotes.keys())
        now = datetime.now(timezone.utc).isoformat()

        for i in range(len(chains)):
            for j in range(i + 1, len(chains)):
                chain_a, chain_b = chains[i], chains[j]
                qty_a, qty_b = quotes[chain_a], quotes[chain_b]

                if qty_a == 0 or qty_b == 0:
                    continue

                price_a = trade_size_usd / qty_a
                price_b = trade_size_usd / qty_b

                if price_a < price_b:
                    buy_chain, sell_chain = chain_a, chain_b
                    buy_price, sell_price = price_a, price_b
                else:
                    buy_chain, sell_chain = chain_b, chain_a
                    buy_price, sell_price = price_b, price_a

                spread_pct = ((sell_price - buy_price) / buy_price) * 100
                gross_profit = trade_size_usd * spread_pct / 100
                gas = GAS_COST_MAP.get(buy_chain, 1) + GAS_COST_MAP.get(sell_chain, 1)
                # 跨链需要桥接成本
                bridge_cost = 5.0  # 估算桥接费用
                total_cost = gas + bridge_cost
                net = gross_profit - total_cost

                if spread_pct >= self.min_spread and net >= self.min_profit:
                    opportunities.append(ArbOpportunity(
                        token_pair="custom",
                        buy_dex=f"best-{buy_chain}",
                        buy_chain=buy_chain,
                        buy_price=round(buy_price, 6),
                        sell_dex=f"best-{sell_chain}",
                        sell_chain=sell_chain,
                        sell_price=round(sell_price, 6),
                        spread_pct=round(spread_pct, 4),
                        estimated_profit_usd=round(gross_profit, 2),
                        gas_cost_usd=round(total_cost, 2),
                        net_profit_usd=round(net, 2),
                        cross_chain=True,
                        confidence=min(0.8, spread_pct / 5),
                        timestamp=now,
                    ))

        opportunities.sort(key=lambda o: o.net_profit_usd, reverse=True)
        logger.info(f"Cross-chain arb scan: {len(opportunities)} opportunities")
        return opportunities

    # ---------- Pool-Based Heuristic Mode ----------

    def scan_opportunities(
        self,
        pools: list[dict],
        trade_size_usd: float = 1000,
    ) -> list[ArbOpportunity]:
        """
        Scan pools for price discrepancies using pool data heuristics.
        Groups pools by token pair and compares APR/TVL ratios across DEXs.
        """
        by_pair: dict[str, list[dict]] = {}
        for pool in pools:
            symbol = pool.get("symbol", "")
            if not symbol:
                continue
            by_pair.setdefault(symbol, []).append(pool)

        opportunities: list[ArbOpportunity] = []
        now = datetime.now(timezone.utc).isoformat()

        for pair, pool_list in by_pair.items():
            if len(pool_list) < 2:
                continue

            # 按 TVL 排序，取最大的几个做比较（流动性充足才有意义）
            pool_list.sort(key=lambda p: p.get("tvlUsd", 0), reverse=True)
            top_pools = pool_list[:5]

            for i in range(len(top_pools)):
                for j in range(i + 1, len(top_pools)):
                    pool_a = top_pools[i]
                    pool_b = top_pools[j]

                    if pool_a.get("protocolId") == pool_b.get("protocolId"):
                        continue

                    # 用 base APR 差异作为价格效率信号
                    apr_a = pool_a.get("aprBase", 0)
                    apr_b = pool_b.get("aprBase", 0)
                    apr_diff = abs(apr_a - apr_b)

                    # TVL 加权：两个池子的 TVL 都要大于 $100k
                    tvl_a = pool_a.get("tvlUsd", 0)
                    tvl_b = pool_b.get("tvlUsd", 0)
                    if tvl_a < 100_000 or tvl_b < 100_000:
                        continue

                    if apr_diff < 3:  # 低于 3% 差异不值得
                        continue

                    cross_chain = pool_a.get("chain") != pool_b.get("chain")
                    chain_a = pool_a.get("chain", "")
                    chain_b = pool_b.get("chain", "")
                    gas_a = GAS_COST_MAP.get(chain_a, 1)
                    gas_b = GAS_COST_MAP.get(chain_b, 1)
                    bridge_cost = 5.0 if cross_chain else 0
                    total_gas = gas_a + gas_b + bridge_cost

                    # 滑点估算：根据 trade_size / TVL
                    slippage_a = min(2.0, (trade_size_usd / tvl_a) * 100 * 10)
                    slippage_b = min(2.0, (trade_size_usd / tvl_b) * 100 * 10)
                    slippage_cost = trade_size_usd * (slippage_a + slippage_b) / 100

                    gross = trade_size_usd * apr_diff / 100
                    net = gross - total_gas - slippage_cost

                    if net >= self.min_profit:
                        # 信心度：根据 TVL 深度和价差大小
                        confidence = min(0.9, (min(tvl_a, tvl_b) / 1_000_000) * (apr_diff / 20))

                        opportunities.append(ArbOpportunity(
                            token_pair=pair,
                            buy_dex=pool_a.get("protocolId", ""),
                            buy_chain=chain_a,
                            buy_price=0,
                            sell_dex=pool_b.get("protocolId", ""),
                            sell_chain=chain_b,
                            sell_price=0,
                            spread_pct=round(apr_diff, 4),
                            estimated_profit_usd=round(gross, 2),
                            gas_cost_usd=round(total_gas + slippage_cost, 2),
                            net_profit_usd=round(net, 2),
                            cross_chain=cross_chain,
                            confidence=round(confidence, 3),
                            timestamp=now,
                        ))

        opportunities = [o for o in opportunities if o.net_profit_usd >= self.min_profit]
        opportunities.sort(key=lambda o: o.net_profit_usd, reverse=True)

        logger.info(f"Pool-based arb scan: {len(opportunities)} opportunities from {len(pools)} pools")
        return opportunities[:20]  # Top 20
