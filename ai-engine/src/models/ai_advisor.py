"""
AI 策略顾问 - 基于 DeepSeek LLM 的智能决策层

职责：
1. 分析当前市场环境（牛/熊/震荡）
2. 评估池子组合的风险回报
3. 生成入场/退出/调仓的自然语言建议
4. 动态调整策略参数（如风险阈值、复投频率）

支持的 LLM 后端：
- DeepSeek V3 (推荐，成本最低)
- DeepSeek R1 (深度推理)
- OpenAI GPT-4o (备用)
"""

import os
import json
import logging
import asyncio
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class MarketContext:
    """当前市场环境快照"""
    total_pools: int = 0
    avg_apr: float = 0
    median_apr: float = 0
    total_tvl_usd: float = 0
    top_pools: list[dict] = field(default_factory=list)
    active_positions: list[dict] = field(default_factory=list)
    recent_signals: list[dict] = field(default_factory=list)
    portfolio_value_usd: float = 0
    portfolio_pnl_usd: float = 0


@dataclass
class AIAdvice:
    """AI 顾问输出"""
    market_regime: str  # "bull", "bear", "sideways", "volatile"
    risk_level: str  # "conservative", "moderate", "aggressive"
    confidence: float  # 0-1
    summary: str  # 一句话总结
    analysis: str  # 详细分析
    recommendations: list[dict] = field(default_factory=list)  # 具体操作建议
    parameter_adjustments: dict = field(default_factory=dict)  # 建议调整的系统参数
    timestamp: str = ""


class AIAdvisor:
    """
    LLM 驱动的策略顾问。

    调用链路：
    Scanner 数据 + 持仓数据 → 构建 Prompt → DeepSeek API → 解析建议 → 返回结构化决策
    """

    def __init__(
        self,
        api_key: str = "",
        model: str = "deepseek-chat",
        base_url: str = "https://api.deepseek.com",
        temperature: float = 0.3,
        max_tokens: int = 2000,
    ):
        self.api_key = api_key or os.getenv("DEEPSEEK_API_KEY", "") or os.getenv("GLM_API_KEY", "") or os.getenv("ANTHROPIC_API_KEY", "")
        self.model = model or os.getenv("AI_MODEL", "deepseek-chat")
        self.base_url = base_url or os.getenv("AI_BASE_URL", "https://api.deepseek.com")
        
        # 优先从数据库读取 AI 参数，回退到环境变量
        try:
            import psycopg2
            host = os.getenv("POSTGRES_HOST", "localhost")
            conn = psycopg2.connect(
                host=host,
                port=int(os.getenv("POSTGRES_PORT", "5432")),
                dbname=os.getenv("POSTGRES_DB", "postgres"),
                user=os.getenv("POSTGRES_USER", ""),
                password=os.getenv("POSTGRES_PASSWORD", ""),
                sslmode="require" if "supabase" in host else "prefer",
            )
            cur = conn.cursor()
            cur.execute("SELECT key, value FROM system_config WHERE key IN ('ai_temperature', 'ai_max_tokens', 'ai_model', 'ai_base_url')")
            db_config = {k: v for k, v in cur.fetchall()}
            cur.close()
            conn.close()
            
            # 数据库配置覆盖环境变量
            if "ai_temperature" in db_config and db_config["ai_temperature"]:
                temperature = float(db_config["ai_temperature"])
            if "ai_max_tokens" in db_config and db_config["ai_max_tokens"]:
                max_tokens = int(db_config["ai_max_tokens"])
            if "ai_model" in db_config and db_config["ai_model"]:
                self.model = db_config["ai_model"]
            if "ai_base_url" in db_config and db_config["ai_base_url"]:
                self.base_url = db_config["ai_base_url"]
        except Exception as e:
            # 回退到环境变量
            pass
        
        self.temperature = temperature or float(os.getenv("AI_TEMPERATURE", "0.3"))
        self.max_tokens = max_tokens or int(os.getenv("AI_MAX_TOKENS", "2000"))

        # Normalize base URL
        self.base_url = self.base_url.rstrip("/")
        
        # Build endpoint URL
        # 2026 升级：支持多种模型
        if "glm" in self.model.lower():
            # GLM 模型 (智谱AI)
            self.endpoint = f"{self.base_url}/chat/completions"
            self.auth_header = "Authorization"
            self.auth_token = f"Bearer {self.api_key}" if self.api_key else ""
        elif "claude" in self.model.lower():
            # Claude 模型 (Anthropic)
            self.endpoint = f"{self.base_url}/messages"
            self.auth_header = "x-api-key"
            self.auth_token = self.api_key
            self.claude_version = "2023-06-01"  # Claude API version
        elif self.base_url.endswith("/v1"):
            # Already has /v1 suffix (e.g. OpenAI)
            self.endpoint = f"{self.base_url}/chat/completions"
            self.auth_header = "Authorization"
            self.auth_token = f"Bearer {self.api_key}" if self.api_key else ""
        else:
            # DeepSeek, or generic OpenAI-compatible API
            self.endpoint = f"{self.base_url}/chat/completions"
            self.auth_header = "Authorization"
            self.auth_token = f"Bearer {self.api_key}" if self.api_key else ""

    def _build_system_prompt(self) -> str:
        return """你是一个专业的 DeFi 量化策略顾问 AI。你的职责是分析链上数据并给出精准的投资建议。

你必须严格以 JSON 格式输出，结构如下：
{
  "market_regime": "bull|bear|sideways|volatile",
  "risk_level": "conservative|moderate|aggressive",
  "confidence": 0.0-1.0,
  "summary": "一句话中文总结当前市场和建议",
  "analysis": "详细的中文分析（2-3段）",
  "recommendations": [
    {
      "action": "enter|exit|hold|increase|decrease|compound",
      "pool_id": "池子ID（如有）",
      "symbol": "交易对",
      "reason": "中文原因",
      "urgency": "high|medium|low",
      "amount_pct": 0-100
    }
  ],
  "parameter_adjustments": {
    "max_risk_score": 60,
    "min_health_score": 60,
    "compound_interval_hr": 6,
    "stop_loss_pct": 10,
    "rebalance_threshold_pct": 20
  }
}

分析原则：
1. 安全第一：宁可错过机会，不可损失本金
2. 优先选择高健康分（≥70）的池子
3. 注意 APR 异常高（>200%）通常意味着高风险或即将结束的激励
4. TVL 持续下降的池子应该避免或减仓
5. 稳定币池子适合作为资金安全垫
6. 分散投资：不要把超过 25% 资金放在单一池子
7. 跨链分散：不要把超过 50% 资金放在单一链上
8. 在市场不确定时，建议增加稳定币池子的配置比例"""

    def _multifactor_score_pools(self, pools: list[dict]) -> list[dict]:
        """2026 升级：多因子综合评分
        
        综合得分 = APR得分(40%) + 健康分(30%) + TVL得分(20%) + 稳定性得分(10%)
        
        APR得分: 归一化到 0-100，>100% 按 100 计算
        健康分: 原始分数
        TVL得分: log10(TVL) 归一化，>1B 按 100 计算
        稳定性得分: 基于 TVL 变化趋势（简化版）
        """
        if not pools:
            return pools
        
        # 计算 TVL 对数用于归一化
        max_tvl = max((p.get("tvlUsd", 0) or 0) for p in pools)
        max_tvl = max(max_tvl, 1)  # 避免除零
        
        for pool in pools:
            apr = float(pool.get("aprTotal", 0) or 0)
            health = float(pool.get("healthScore", 50) or 50)
            tvl = float(pool.get("tvlUsd", 0) or 0)
            
            # APR 得分 (0-100, 线性归一化，100% = 100分)
            apr_score = min(apr, 100)  # 超过100%按100算
            
            # TVL 得分 (0-100, log归一化)
            import math
            tvl_score = min(math.log10(tvl + 1) / math.log10(max_tvl + 1) * 100, 100) if max_tvl > 0 else 0
            
            # 健康分得分 (0-100)
            health_score = min(health, 100)
            
            # 稳定性得分：TVL 越大越稳定 (简化版)
            stability_score = min(tvl_score, 100)
            
            # 综合得分
            score = (
                apr_score * 0.4 +       # APR 权重 40%
                health_score * 0.3 +    # 健康分权重 30%
                tvl_score * 0.2 +       # TVL 权重 20%
                stability_score * 0.1   # 稳定性权重 10%
            )
            
            pool["_score"] = round(score, 1)
            pool["_apr_score"] = round(apr_score, 1)
            pool["_health_score"] = round(health_score, 1)
            pool["_tvl_score"] = round(tvl_score, 1)
        
        # 按综合得分降序排列
        return sorted(pools, key=lambda p: p.get("_score", 0), reverse=True)

    def _build_analysis_prompt(self, context: MarketContext) -> str:
        # 2026 升级：多因子综合评分排序
        scored_pools = self._multifactor_score_pools(context.top_pools)
        
        top_pools_str = ""
        for i, p in enumerate(scored_pools[:15], 1):
            score = p.get("_score", 0)
            top_pools_str += (
                f"  {i}. {p.get('symbol','?')} | {p.get('protocolId','?')} | "
                f"{p.get('chain','?')} | APR: {p.get('aprTotal', 0):.1f}% | "
                f"TVL: ${p.get('tvlUsd', 0)/1e6:.1f}M | "
                f"健康分: {p.get('healthScore', '-')} | 综合分: {score:.1f}\n"
            )

        positions_str = ""
        for p in context.active_positions[:10]:
            positions_str += (
                f"  - {p.get('symbol', p.get('poolId','?'))} | "
                f"价值: ${p.get('valueUsd', 0):,.0f} | "
                f"盈亏: ${p.get('unrealizedPnlUsd', 0):,.0f} | "
                f"APR: {p.get('apr', 0):.1f}%\n"
            )

        return f"""请分析以下 DeFi 市场数据并给出投资建议：

## 市场概览
- 追踪池子数: {context.total_pools}
- 平均年化率: {context.avg_apr:.1f}%
- 中位年化率: {context.median_apr:.1f}%
- 总锁仓量: ${context.total_tvl_usd/1e9:.2f}B

## 当前投资组合
- 总价值: ${context.portfolio_value_usd:,.0f}
- 总盈亏: ${context.portfolio_pnl_usd:,.0f}
- 持仓明细:
{positions_str if positions_str else "  （暂无持仓）"}

## 排名前 15 的收益池
{top_pools_str}

请基于以上数据，输出你的分析和建议（严格 JSON 格式）。"""

    async def analyze(
        self,
        context: MarketContext,
        user_prompt_override: Optional[str] = None,
    ) -> AIAdvice:
        """调用 LLM 分析市场并返回结构化建议。
        user_prompt_override: 若提供则替代默认 user prompt（用于 Think Loop 注入情绪/Alpha/记忆）。"""
        if not self.api_key:
            logger.warning("AI API Key 未配置，使用规则引擎兜底")
            return self._fallback_analysis(context)

        system_prompt = self._build_system_prompt()
        user_prompt = (
            user_prompt_override
            if user_prompt_override is not None
            else self._build_analysis_prompt(context)
        )

        try:
            async with aiohttp.ClientSession() as session:
                # 2026 升级：支持多种模型的请求格式
                headers = {
                    "Content-Type": "application/json",
                    self.auth_header: self.auth_token,
                }
                
                # Claude 需要额外 header
                if hasattr(self, 'claude_version'):
                    headers["anthropic-version"] = self.claude_version
                
                # 构建请求体
                if hasattr(self, 'claude_version'):
                    # Claude 格式
                    body = {
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": self.temperature,
                        "max_tokens": self.max_tokens,
                        "system": system_prompt,  # Claude 用 system 而非 messages
                    }
                    # 移除重复的 system
                    body["messages"] = [{"role": "user", "content": user_prompt}]
                else:
                    # OpenAI/DeepSeek/GLM 格式
                    body = {
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": self.temperature,
                        "max_tokens": self.max_tokens,
                        "response_format": {"type": "json_object"},
                    }

                async with session.post(
                    self.endpoint,
                    headers=headers,
                    json=body,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        logger.error(f"AI API 调用失败 ({resp.status}): {error_text}")
                        return self._fallback_analysis(context)

                    data = await resp.json()
                    
                    # 2026 升级：兼容不同模型的响应格式
                    if hasattr(self, 'claude_version'):
                        # Claude 响应格式
                        content = data["content"][0]["text"]
                    else:
                        # OpenAI/DeepSeek/GLM 响应格式
                        content = data["choices"][0]["message"]["content"]
                    result = json.loads(content)

                    advice = AIAdvice(
                        market_regime=result.get("market_regime", "sideways"),
                        risk_level=result.get("risk_level", "moderate"),
                        confidence=float(result.get("confidence", 0.5)),
                        summary=result.get("summary", "分析完成"),
                        analysis=result.get("analysis", ""),
                        recommendations=result.get("recommendations", []),
                        parameter_adjustments=result.get("parameter_adjustments", {}),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    )

                    logger.info(
                        f"AI 分析完成: regime={advice.market_regime}, "
                        f"confidence={advice.confidence:.0%}, "
                        f"recommendations={len(advice.recommendations)}"
                    )
                    return advice

        except Exception as e:
            logger.error(f"AI 顾问调用异常: {e}")
            return self._fallback_analysis(context)

    def _fallback_analysis(self, context: MarketContext) -> AIAdvice:
        """增强版规则引擎兜底（当 LLM 不可用时）
        
        多维度分析:
        1. 市场状态判断: avg_apr + median_apr + TVL 综合判断
        2. 已持仓处理: 对低收益/高风险持仓给出 exit/decrease 建议
        3. 新入场推荐: 稳定币优先 + 高健康分 + 风险分散
        4. 集中度检查: 单池≤25%, 单链≤50%
        5. 参数动态调整: 根据市场状态调整风控参数
        """
        # ── 1. 多因子市场状态判断 ──
        avg_apr = context.avg_apr
        median_apr = context.median_apr
        total_tvl = context.total_tvl_usd

        # TVL 级别判断（简易替代趋势）
        tvl_healthy = total_tvl > 1e9  # TVL > $1B 认为健康

        if avg_apr > 30 and median_apr > 15 and tvl_healthy:
            regime = "bull"
            risk = "moderate"
        elif avg_apr > 30 and not tvl_healthy:
            regime = "volatile"  # 高 APR 但 TVL 低 → 不稳定
            risk = "conservative"
        elif avg_apr < 5 or (avg_apr < 10 and not tvl_healthy):
            regime = "bear"
            risk = "conservative"
        elif avg_apr > 15:
            regime = "sideways"
            risk = "moderate"
        else:
            regime = "sideways"
            risk = "conservative"

        recs = []
        analysis_parts = []

        # ── 2. 已持仓智能处理 ──
        active_positions = context.active_positions or []
        held_pool_ids = set()
        position_by_chain: dict[str, float] = {}
        total_position_value = context.portfolio_value_usd or 0

        for pos in active_positions:
            pool_id = pos.get("poolId", pos.get("pool_id", ""))
            held_pool_ids.add(pool_id)
            chain = pos.get("chain", "unknown")
            value = float(pos.get("valueUsd", pos.get("value_usd", 0)))
            position_by_chain[chain] = position_by_chain.get(chain, 0) + value
            pos_apr = float(pos.get("apr", pos.get("aprTotal", 0)))
            pnl = float(pos.get("unrealizedPnlUsd", pos.get("unrealized_pnl_usd", 0)))
            health = float(pos.get("healthScore", pos.get("health_score", 50)))

            # 退出条件: 健康分<40 或 (APR<3% 且亏损)
            if health < 40:
                recs.append({
                    "action": "exit",
                    "pool_id": pool_id,
                    "symbol": pos.get("symbol", ""),
                    "reason": f"健康分过低({health:.0f}), 风险过高, 建议退出",
                    "urgency": "high",
                    "amount_pct": 100,
                })
            elif pos_apr < 3 and pnl < 0:
                recs.append({
                    "action": "exit",
                    "pool_id": pool_id,
                    "symbol": pos.get("symbol", ""),
                    "reason": f"APR仅{pos_apr:.1f}%且亏损${abs(pnl):.0f}, 资金效率低",
                    "urgency": "medium",
                    "amount_pct": 100,
                })
            elif pos_apr < 5 and regime == "bull":
                recs.append({
                    "action": "decrease",
                    "pool_id": pool_id,
                    "symbol": pos.get("symbol", ""),
                    "reason": f"牛市中APR仅{pos_apr:.1f}%, 可转移至更高收益池",
                    "urgency": "low",
                    "amount_pct": 50,
                })
            elif pos_apr > 10 and pnl >= 0:
                recs.append({
                    "action": "compound",
                    "pool_id": pool_id,
                    "symbol": pos.get("symbol", ""),
                    "reason": f"APR {pos_apr:.1f}%表现良好, 建议复投收益",
                    "urgency": "low",
                    "amount_pct": 0,
                })
            else:
                recs.append({
                    "action": "hold",
                    "pool_id": pool_id,
                    "symbol": pos.get("symbol", ""),
                    "reason": f"APR {pos_apr:.1f}%, PnL ${pnl:+.0f}, 维持现有仓位",
                    "urgency": "low",
                    "amount_pct": 0,
                })

        if active_positions:
            analysis_parts.append(
                f"当前持有 {len(active_positions)} 个仓位, "
                f"组合价值 ${total_position_value:,.0f}, PnL ${context.portfolio_pnl_usd:+,.0f}。"
            )

        # ── 3. 集中度检查 ──
        if total_position_value > 0:
            for chain, chain_val in position_by_chain.items():
                pct = chain_val / total_position_value * 100
                if pct > 50:
                    analysis_parts.append(
                        f"⚠ {chain} 链集中度 {pct:.0f}% 超过50%, 建议跨链分散。"
                    )

        # ── 4. 新入场推荐（排除已持仓、考虑稳定币偏好）──
        is_stablecoin = lambda sym: any(
            s in (sym or "").upper()
            for s in ["USDC", "USDT", "DAI", "FRAX", "LUSD", "BUSD", "TUSD", "GUSD"]
        )

        # 复合得分排序: 健康分*0.4 + min(APR,100)*0.6，兼顾安全与收益
        def _pool_score(p):
            h = p.get("healthScore") or 0
            a = min(float(p.get("aprTotal", 0) or 0), 100)
            return h * 0.4 + a * 0.6

        sorted_pools = sorted(
            context.top_pools,
            key=_pool_score,
            reverse=True,
        )

        # 熊市/震荡: 优先推荐稳定币池
        stablecoin_recs = 0
        non_stable_recs = 0
        max_new_recs = 3 if not active_positions else 2

        # 熊市至少 60% 稳定币配置
        want_stable = regime in ("bear", "volatile")

        # 动态门槛: 无高健康分池时放宽至 40
        min_health = 60
        if sorted_pools and all((p.get("healthScore") or 0) < 60 for p in sorted_pools):
            min_health = 40

        for p in sorted_pools:
            if len([r for r in recs if r["action"] == "enter"]) >= max_new_recs:
                break
            pool_id = p.get("poolId", "")
            if pool_id in held_pool_ids:
                continue
            health = p.get("healthScore") or 0
            apr = p.get("aprTotal", 0)
            symbol = p.get("symbol", "")
            tvl = p.get("tvlUsd", 0)

            # 基础门槛: 健康分≥min_health(60/40), TVL≥$100K
            if health < min_health or tvl < 100_000:
                continue

            # APR 合理性: >200% 标注高风险，兜底不碰
            if apr > 200:
                continue

            is_stable = is_stablecoin(symbol)

            # 熊市优先稳定币
            if want_stable and not is_stable and stablecoin_recs < 2:
                continue

            alloc_pct = 15 if not want_stable else (20 if is_stable else 10)

            reason = f"健康分{health:.0f}, APR {apr:.1f}%, TVL ${tvl/1e6:.1f}M"
            if is_stable:
                reason += ", 稳定币池低风险"
                stablecoin_recs += 1
            else:
                non_stable_recs += 1

            recs.append({
                "action": "enter",
                "pool_id": pool_id,
                "symbol": symbol,
                "reason": reason,
                "urgency": "medium" if regime == "bull" else "low",
                "amount_pct": alloc_pct,
            })

        # ── 5. 市场分析文本 ──
        regime_names = {"bull": "牛市", "bear": "熊市", "sideways": "震荡", "volatile": "高波动"}
        risk_names = {"conservative": "保守", "moderate": "均衡", "aggressive": "激进"}
        regime_cn = regime_names.get(regime, "未知")
        risk_cn = risk_names.get(risk, "均衡")

        analysis_parts.insert(0,
            f"【规则引擎兜底分析】市场状态: {regime_cn}（平均APR {avg_apr:.1f}%, "
            f"中位APR {median_apr:.1f}%, TVL ${total_tvl/1e9:.2f}B）。"
            f"策略倾向: {risk_cn}。"
        )

        if want_stable:
            analysis_parts.append("当前市场偏弱, 建议提高稳定币池配置比例至60%以上, 降低波动风险。")
        else:
            analysis_parts.append("市场活跃, 可适当配置中高收益池, 但需注意分散风险。")

        analysis_parts.append("⚠ 本分析由规则引擎生成（AI API Key 未配置）, 建议配置 DeepSeek API 获取更精准洞察。")

        # ── 6. 动态参数调整 ──
        if regime == "bear":
            param_adj = {
                "max_risk_score": 40,
                "min_health_score": 70,
                "compound_interval_hr": 12,
                "stop_loss_pct": 5,
                "rebalance_threshold_pct": 15,
            }
        elif regime == "volatile":
            param_adj = {
                "max_risk_score": 45,
                "min_health_score": 65,
                "compound_interval_hr": 8,
                "stop_loss_pct": 7,
                "rebalance_threshold_pct": 15,
            }
        elif regime == "bull":
            param_adj = {
                "max_risk_score": 65,
                "min_health_score": 55,
                "compound_interval_hr": 4,
                "stop_loss_pct": 15,
                "rebalance_threshold_pct": 25,
            }
        else:  # sideways
            param_adj = {
                "max_risk_score": 55,
                "min_health_score": 60,
                "compound_interval_hr": 6,
                "stop_loss_pct": 10,
                "rebalance_threshold_pct": 20,
            }

        enter_count = len([r for r in recs if r["action"] == "enter"])
        exit_count = len([r for r in recs if r["action"] in ("exit", "decrease")])
        hold_count = len([r for r in recs if r["action"] in ("hold", "compound")])

        return AIAdvice(
            market_regime=regime,
            risk_level=risk,
            confidence=0.5,  # 规则引擎比纯随机高，但不如 AI
            summary=(
                f"规则引擎: 市场偏{regime_cn}, {risk_cn}策略。"
                f"建议入场{enter_count}池, 退出/减仓{exit_count}池, 持有{hold_count}池。"
            ),
            analysis="\n".join(analysis_parts),
            recommendations=recs,
            parameter_adjustments=param_adj,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    async def evaluate_signal(self, signal: dict, context: MarketContext) -> dict:
        """评估单个交易信号是否应该执行"""
        if not self.api_key:
            return {"approved": True, "reason": "AI 未配置，默认通过", "confidence": 0.5}

        prompt = f"""请评估以下交易信号是否应该执行：

信号详情：
- 操作: {signal.get('action', '?')}
- 池子: {signal.get('poolId', '?')}
- 金额: ${signal.get('amountUsd', 0):,.0f}
- 链: {signal.get('chain', '?')}
- 协议: {signal.get('protocolId', '?')}

当前组合价值: ${context.portfolio_value_usd:,.0f}

请输出 JSON：{{"approved": true/false, "reason": "中文原因", "confidence": 0.0-1.0}}"""

        try:
            async with aiohttp.ClientSession() as session:
                resp = await session.post(
                    self.endpoint,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": "你是 DeFi 风控 AI，负责审批交易信号。输出严格 JSON。"},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 300,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=aiohttp.ClientTimeout(total=15),
                )
                if resp.status != 200:
                    error_text = await resp.text()
                    logger.error(f"信号评估 API 返回 {resp.status}: {error_text}")
                    return {"approved": False, "reason": f"AI API 返回错误 ({resp.status})", "confidence": 0}
                data = await resp.json()
                return json.loads(data["choices"][0]["message"]["content"])
        except Exception as e:
            logger.error(f"信号评估失败: {e}")
            return {"approved": False, "reason": "AI 评估异常，默认拒绝", "confidence": 0}
