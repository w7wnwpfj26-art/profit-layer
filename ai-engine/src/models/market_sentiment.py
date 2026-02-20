"""
市场情绪感知模块

数据源:
1. 恐惧贪婪指数 (CoinyBubble 免费 API)
2. BTC/ETH 价格趋势 (CoinGecko 免费 API)
3. 链上 Gas 趋势 (RPC eth_gasPrice)
"""

import logging
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone

import aiohttp

logger = logging.getLogger(__name__)

FEAR_GREED_API = "https://api.alternative.me/fng/?limit=1"
COINGECKO_PRICE_API = "https://api.coingecko.com/api/v3/simple/price"
GAS_RPCS = {
    "ethereum": "https://rpc.ankr.com/eth",
    "bsc": "https://rpc.ankr.com/bsc",
    "arbitrum": "https://arb1.arbitrum.io/rpc",
    "base": "https://mainnet.base.org",
}


@dataclass
class MarketSentiment:
    """综合市场情绪快照"""
    # 恐惧贪婪
    fear_greed_index: int = 50           # 0-100
    fear_greed_label: str = "中性"       # 极度恐慌/恐慌/中性/贪婪/极度贪婪
    # BTC
    btc_price_usd: float = 0
    btc_24h_change_pct: float = 0
    eth_price_usd: float = 0
    eth_24h_change_pct: float = 0
    # Gas
    gas_gwei: dict = field(default_factory=dict)  # {"ethereum": 25.3, "bsc": 3.1, ...}
    # 综合
    composite_score: int = 50            # 0-100 综合情绪分
    market_regime: str = "震荡"          # 极度恐慌/恐慌/中性/贪婪/极度贪婪
    suggestion: str = ""                 # 一句话建议
    timestamp: str = ""


class MarketSentimentCollector:

    async def get_fear_greed(self, session: aiohttp.ClientSession) -> tuple[int, str]:
        """获取恐惧贪婪指数 (alternative.me)"""
        try:
            async with session.get(
                FEAR_GREED_API,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json(content_type=None)  # accept any content type
                    if "data" in data and len(data["data"]) > 0:
                        value = int(data["data"][0]["value"])
                        return value, self._fg_label(value)
                    # fallback format
                    value = int(data.get("value", data.get("index", 0)))
                    if value > 0:
                        return value, self._fg_label(value)
        except Exception as e:
            logger.warning(f"恐惧贪婪指数获取失败: {e}")
        return 0, "未知"

    async def get_btc_trend(self, session: aiohttp.ClientSession) -> dict:
        """获取 BTC/ETH 价格和 24h 变化"""
        try:
            params = {
                "ids": "bitcoin,ethereum",
                "vs_currencies": "usd",
                "include_24hr_change": "true",
                "include_market_cap": "true",
            }
            async with session.get(COINGECKO_PRICE_API, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {
                        "btc_price": data.get("bitcoin", {}).get("usd", 0),
                        "btc_24h_change": data.get("bitcoin", {}).get("usd_24h_change", 0),
                        "eth_price": data.get("ethereum", {}).get("usd", 0),
                        "eth_24h_change": data.get("ethereum", {}).get("usd_24h_change", 0),
                    }
        except Exception as e:
            logger.warning(f"CoinGecko 价格获取失败: {e}")
        return {"btc_price": 0, "btc_24h_change": 0, "eth_price": 0, "eth_24h_change": 0}

    async def get_gas_trend(self, session: aiohttp.ClientSession) -> dict[str, float]:
        """获取各链 Gas 价格 (Gwei)"""
        results = {}
        for chain, rpc in GAS_RPCS.items():
            try:
                async with session.post(
                    rpc,
                    json={"jsonrpc": "2.0", "method": "eth_gasPrice", "params": [], "id": 1},
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results[chain] = round(int(data["result"], 16) / 1e9, 2)
            except Exception:
                results[chain] = -1
        return results

    async def get_composite_sentiment(self) -> MarketSentiment:
        """综合采集所有情绪数据"""
        async with aiohttp.ClientSession() as session:
            fg_val, fg_label = await self.get_fear_greed(session)
            prices = await self.get_btc_trend(session)
            gas = await self.get_gas_trend(session)

        # 综合评分算法:
        # 40% 恐惧贪婪指数 + 30% BTC 24h 走势 + 15% ETH 24h 走势 + 15% Gas 水平
        btc_score = max(0, min(100, 50 + prices["btc_24h_change"] * 5))  # -10%→0, 0%→50, +10%→100
        eth_score = max(0, min(100, 50 + prices["eth_24h_change"] * 5))
        eth_gas = gas.get("ethereum", 20)
        gas_score = max(0, min(100, 100 - eth_gas * 1.5))  # Gas 越低越好

        composite = int(fg_val * 0.4 + btc_score * 0.3 + eth_score * 0.15 + gas_score * 0.15)
        composite = max(0, min(100, composite))

        regime = self._fg_label(composite)
        suggestion = self._get_suggestion(composite, prices["btc_24h_change"])

        return MarketSentiment(
            fear_greed_index=fg_val,
            fear_greed_label=fg_label,
            btc_price_usd=prices["btc_price"],
            btc_24h_change_pct=round(prices["btc_24h_change"], 2),
            eth_price_usd=prices["eth_price"],
            eth_24h_change_pct=round(prices["eth_24h_change"], 2),
            gas_gwei=gas,
            composite_score=composite,
            market_regime=regime,
            suggestion=suggestion,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def _fg_label(value: int) -> str:
        if value <= 20: return "极度恐慌"
        if value <= 40: return "恐慌"
        if value <= 60: return "中性"
        if value <= 80: return "贪婪"
        return "极度贪婪"

    @staticmethod
    def _get_suggestion(composite: int, btc_change: float) -> str:
        if composite <= 20:
            return "市场极度恐慌，建议全面防守：增加稳定币配置至 60%+，暂停新入场，关注抄底机会"
        if composite <= 35:
            return "市场偏恐慌，建议保守配置：稳定币池为主，小仓位试探优质低估池子"
        if composite <= 50:
            return "市场偏弱但尚可，建议均衡配置：50% 稳定币 + 50% 优质高健康分池子"
        if composite <= 65:
            return "市场中性偏好，适合正常运行：按健康分和净 APR 排序选池，保持分散"
        if composite <= 80:
            return "市场偏贪婪，收益机会多但注意风险：可适度激进，但严守止盈纪律"
        return "市场极度贪婪，泡沫风险高：减少高 APR 池子敞口，锁定利润，准备防守"
