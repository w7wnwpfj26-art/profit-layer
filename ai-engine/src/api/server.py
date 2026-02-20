"""
FastAPI Server - AI Engine REST API

Provides HTTP endpoints for:
- Triggering strategy computations
- Querying risk assessments
- Portfolio optimization
- Yield predictions
- System health
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ..models.yield_predictor import YieldPredictor
from ..models.risk_scorer import RiskScorer
from ..models.il_calculator import ILCalculator
from ..models.friction_calculator import FrictionCalculator, OperationType
from ..models.reward_token_analyzer import RewardTokenAnalyzer
from ..models.liquidation_monitor import LiquidationMonitor
from ..strategies.optimizer import PortfolioOptimizer, PoolCandidate
from ..strategies.yield_farming import YieldFarmingStrategy
from ..strategies.lending_arb import LendingArbStrategy
from ..strategies.staking import LiquidStakingStrategy
from ..strategies.funding_rate_arb import FundingRateArbStrategy
from ..strategies.restaking import RestakingStrategy
from ..strategies.rwa_yield import RWAYieldStrategy
from ..strategies.backtester import Backtester
from ..risk.exposure_manager import ExposureManager
from ..risk.anomaly_detector import AnomalyDetector
from ..workers.risk_worker import RiskMonitor
from ..models.ai_advisor import AIAdvisor, MarketContext
from ..models.market_sentiment import MarketSentimentCollector
from ..models.alpha_scanner import AlphaScanner
from ..agent.memory import MemoryManager, FeedbackLoop
from ..agent.think_loop import start_think_loop
from ..models.transformer_predictor import HybridYieldPredictor
from ..models.rl_optimizer import PPOOptimizer
# from ..trading_agents import trading_agents_router  # 新增 TradingAgents 路由

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances (使用延迟初始化，避免模块导入时创建)
_initialized = False

def _ensure_initialized():
    """确保服务已初始化"""
    global _initialized
    if _initialized:
        return
    
    # 导入并创建全局实例
    global yield_predictor, risk_scorer, il_calculator, friction_calculator
    global reward_analyzer, liquidation_monitor, portfolio_optimizer
    global yield_strategy, lending_strategy, staking_strategy
    global funding_rate_strategy, restaking_strategy, rwa_strategy
    global exposure_manager, anomaly_detector, risk_monitor, ai_advisor
    
    yield_predictor = YieldPredictor()
    risk_scorer = RiskScorer()
    il_calculator = ILCalculator()
    friction_calculator = FrictionCalculator()
    reward_analyzer = RewardTokenAnalyzer()
    liquidation_monitor = LiquidationMonitor()
    portfolio_optimizer = PortfolioOptimizer()
    yield_strategy = YieldFarmingStrategy()
    lending_strategy = LendingArbStrategy()
    staking_strategy = LiquidStakingStrategy()
    funding_rate_strategy = FundingRateArbStrategy()
    restaking_strategy = RestakingStrategy()
    rwa_strategy = RWAYieldStrategy()
    exposure_manager = ExposureManager()
    anomaly_detector = AnomalyDetector()
    risk_monitor = RiskMonitor()
    ai_advisor = AIAdvisor()
    
    _initialized = True
    logger.info("服务实例初始化完成")


def _get_db_conn():
    """Shared DB connection helper for server endpoints."""
    import psycopg2
    host = os.getenv("POSTGRES_HOST", "localhost")
    return psycopg2.connect(
        host=host,
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        dbname=os.getenv("POSTGRES_DB", "defi_yield"),
        user=os.getenv("POSTGRES_USER", "defi"),
        password=os.getenv("POSTGRES_PASSWORD", ""),
        sslmode="require" if "supabase" in host else "prefer",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    logger.info("AI Engine starting up...")
    # 确保服务实例已初始化
    _ensure_initialized()
    # 启动后台任务
    global risk_monitor
    risk_task = asyncio.create_task(risk_monitor.run_loop(interval_seconds=60))
    think_task = asyncio.create_task(start_think_loop(interval_seconds=3600))
    logger.info("🧠 AI 思考循环已加入后台任务（每小时一次）")
    yield
    risk_task.cancel()
    think_task.cancel()
    logger.info("AI Engine shutting down...")


app = FastAPI(
    title="DeFi AI Engine",
    description="AI-powered yield optimization and risk management with TradingAgents integration",
    version="0.2.0",
    lifespan=lifespan,
)

# 添加 TradingAgents 路由
# app.include_router(trading_agents_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Request/Response Models ----

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str


class RiskAssessmentRequest(BaseModel):
    pool_id: str
    tvl_usd: float
    apr_total: float
    apr_base: float = 0
    apr_reward: float = 0
    il_risk: str = "no"
    exposure: str = "single"
    stablecoin: bool = False
    apr_volatility: float = 0
    apr_mean_30d: float = 0
    protocol_tvl: float = 0


class ILCalculationRequest(BaseModel):
    initial_price_ratio: float
    current_price_ratio: float
    initial_value_usd: float
    days_in_pool: int = 1


class FrictionRequest(BaseModel):
    operation: str          # "swap", "add_liquidity", "compound", etc.
    chain: str
    protocol: str
    amount_usd: float
    pool_tvl_usd: float = 0
    needs_approval: bool = False
    is_cross_chain: bool = False


class NetYieldRequest(BaseModel):
    pool_id: str
    chain: str
    protocol: str
    gross_apr_pct: float
    position_usd: float
    pool_tvl_usd: float = 0
    holding_days: int = 365


class CompoundOptimalRequest(BaseModel):
    pool_id: str
    position_value_usd: float
    apr_pct: float
    chain: str


class OptimizeRequest(BaseModel):
    pools: list[dict]
    total_capital_usd: float
    max_positions: int = 10
    max_risk_score: float = 60


class StrategyAnalyzeRequest(BaseModel):
    pools: list[dict]
    total_capital_usd: float
    current_positions: list[dict] = []


class RewardTokenAnalyzeRequest(BaseModel):
    tokenSymbol: str = ""
    tokenAddress: str = ""
    currentPriceUsd: float = 0
    price7dAgo: float | None = None
    price30dAgo: float | None = None
    price90dAgo: float | None = None
    dailyEmissionTokens: float = 0
    grossRewardAprPct: float = 0


class LiquidationCheckRequest(BaseModel):
    positionId: str = ""
    protocol: str = ""
    chain: str = ""
    walletAddress: str = ""
    collateralUsd: float = 0
    debtUsd: float = 0
    liquidationThreshold: float = 0.825


class FundingRateRequest(BaseModel):
    fundingRates: list[dict] = []


# ---- Endpoints ----

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now(timezone.utc).isoformat(),
        version="0.1.0",
    )


@app.post("/risk/assess")
async def assess_risk(req: RiskAssessmentRequest):
    """Assess risk for a specific pool."""
    try:
        result = risk_scorer.assess(
            pool_id=req.pool_id,
            tvl_usd=req.tvl_usd,
            apr_total=req.apr_total,
            apr_base=req.apr_base,
            apr_reward=req.apr_reward,
            il_risk=req.il_risk,
            exposure=req.exposure,
            stablecoin=req.stablecoin,
            apr_volatility=req.apr_volatility,
            apr_mean_30d=req.apr_mean_30d,
            protocol_tvl=req.protocol_tvl,
        )
        return {
            "poolId": result.pool_id,
            "overallScore": result.overall_score,
            "riskLevel": result.risk_level.value,
            "components": result.components,
            "warnings": result.warnings,
            "recommendations": result.recommendations,
        }
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


@app.post("/risk/il-calculate")
async def calculate_il(req: ILCalculationRequest):
    """Calculate impermanent loss."""
    result = il_calculator.calculate(
        initial_price_ratio=req.initial_price_ratio,
        current_price_ratio=req.current_price_ratio,
        initial_value_usd=req.initial_value_usd,
        days_in_pool=req.days_in_pool,
    )
    return {
        "priceChangePct": result.price_change_pct,
        "ilPct": result.il_pct,
        "holdValue": result.hold_value,
        "lpValue": result.lp_value,
        "lossUsd": result.loss_usd,
        "breakEvenApr": result.break_even_apr,
    }


@app.post("/strategy/optimize")
async def optimize_portfolio(req: OptimizeRequest):
    """Optimize portfolio allocation."""
    try:
        candidates = []
        for p in req.pools:
            candidates.append(PoolCandidate(
                pool_id=p.get("poolId", ""),
                protocol_id=p.get("protocolId", ""),
                chain=p.get("chain", ""),
                symbol=p.get("symbol", ""),
                apr=p.get("aprTotal", 0),
                tvl_usd=p.get("tvlUsd", 0),
                risk_score=p.get("riskScore", 50),
                il_risk=p.get("ilRisk", 0),
                volatility=p.get("volatility", 5),
            ))

        optimizer = PortfolioOptimizer(max_risk_score=req.max_risk_score)
        result = optimizer.optimize(
            candidates=candidates,
            total_capital_usd=req.total_capital_usd,
            max_positions=req.max_positions,
        )

        return {
            "allocations": [
                {
                    "poolId": a.pool_id,
                    "protocolId": a.protocol_id,
                    "chain": a.chain,
                    "symbol": a.symbol,
                    "weight": a.weight,
                    "amountUsd": a.amount_usd,
                    "expectedApr": a.expected_apr,
                    "riskScore": a.risk_score,
                    "reason": a.reason,
                }
                for a in result.allocations
            ],
            "totalAmountUsd": result.total_amount_usd,
            "expectedPortfolioApr": result.expected_portfolio_apr,
            "portfolioRiskScore": result.portfolio_risk_score,
            "sharpeRatio": result.sharpe_ratio,
            "diversificationScore": result.diversification_score,
        }
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


@app.post("/strategy/analyze")
async def analyze_strategy(req: StrategyAnalyzeRequest):
    """Run yield farming strategy analysis."""
    try:
        signals = yield_strategy.analyze_pools(
            pools=req.pools,
            total_capital_usd=req.total_capital_usd,
            current_positions=req.current_positions,
        )

        return {
            "signals": [
                {
                    "signalId": s.signal_id,
                    "strategyId": s.strategy_id,
                    "action": s.action,
                    "poolId": s.pool_id,
                    "chain": s.chain,
                    "protocolId": s.protocol_id,
                    "amountUsd": s.amount_usd,
                    "reason": s.reason,
                    "confidence": s.confidence,
                    "riskScore": s.risk_score,
                    "expectedApr": s.expected_apr,
                    "timestamp": s.timestamp,
                }
                for s in signals
            ],
            "totalSignals": len(signals),
        }
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


@app.post("/friction/calculate")
async def calculate_friction(req: FrictionRequest):
    """计算单次操作的全部交易磨损。"""
    try:
        op = OperationType(req.operation)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"未知操作类型: {req.operation}")

    result = friction_calculator.calculate_friction(
        operation=op,
        chain=req.chain,
        protocol=req.protocol,
        amount_usd=req.amount_usd,
        pool_tvl_usd=req.pool_tvl_usd,
        needs_approval=req.needs_approval,
        is_cross_chain=req.is_cross_chain,
    )
    return {
        "operation": result.operation,
        "chain": result.chain,
        "protocol": result.protocol,
        "amountUsd": result.amount_usd,
        "gasCostUsd": round(result.gas_cost_usd, 4),
        "dexFeeUsd": round(result.dex_fee_usd, 4),
        "slippageUsd": round(result.slippage_usd, 4),
        "priceImpactUsd": round(result.price_impact_usd, 4),
        "bridgeFeeUsd": round(result.bridge_fee_usd, 4),
        "mevCostUsd": round(result.mev_cost_usd, 4),
        "approvalCostUsd": round(result.approval_cost_usd, 4),
        "totalFrictionUsd": round(result.total_friction_usd, 4),
        "frictionPct": round(result.friction_pct, 4),
        "netAmountUsd": round(result.net_amount_usd, 4),
        "warnings": result.warnings,
    }


@app.post("/friction/net-yield")
async def net_yield(req: NetYieldRequest):
    """计算扣除全部磨损后的真实净年化收益。"""
    result = friction_calculator.net_yield_after_friction(
        pool_id=req.pool_id,
        chain=req.chain,
        protocol=req.protocol,
        gross_apr_pct=req.gross_apr_pct,
        position_usd=req.position_usd,
        pool_tvl_usd=req.pool_tvl_usd,
        holding_days=req.holding_days,
    )
    return {
        "poolId": result.pool_id,
        "grossAprPct": result.gross_apr_pct,
        "entryFrictionPct": result.entry_friction_pct,
        "exitFrictionPct": result.exit_friction_pct,
        "compoundFrictionAnnualPct": result.compound_friction_annual_pct,
        "annualGasDragPct": result.annual_gas_drag_pct,
        "netAprPct": result.net_apr_pct,
        "breakevenDays": result.breakeven_days,
        "minPositionUsd": result.min_position_usd,
        "verdict": result.verdict,
    }


@app.post("/friction/compound-optimal")
async def compound_optimal(req: CompoundOptimalRequest):
    """计算最优复投频率。"""
    result = friction_calculator.optimal_compound_frequency(
        pool_id=req.pool_id,
        position_value_usd=req.position_value_usd,
        apr_pct=req.apr_pct,
        chain=req.chain,
    )
    return {
        "poolId": result.pool_id,
        "positionValueUsd": result.position_value_usd,
        "aprPct": result.apr_pct,
        "chain": result.chain,
        "compoundGasUsd": result.compound_gas_usd,
        "optimalFrequencyHours": result.optimal_frequency_hours,
        "optimalFrequencyDays": result.optimal_frequency_days,
        "compoundsPerYear": result.compounds_per_year,
        "gasCostPerYearUsd": result.gas_cost_per_year_usd,
        "extraYieldFromCompoundUsd": result.extra_yield_from_compound_usd,
        "netBenefitUsd": result.net_benefit_usd,
        "isWorthCompounding": result.is_worth_compounding,
    }


@app.get("/friction/min-amount/{chain}/{protocol}")
async def min_profitable_amount(chain: str, protocol: str, apr: float = 10.0, days: int = 30):
    """计算最低盈利金额。"""
    amount = friction_calculator.minimum_profitable_amount(
        chain=chain,
        protocol=protocol,
        apr_pct=apr,
        holding_days=days,
    )
    return {
        "chain": chain,
        "protocol": protocol,
        "aprPct": apr,
        "holdingDays": days,
        "minProfitableAmountUsd": amount,
    }


@app.post("/reward-token/analyze")
async def analyze_reward_token(req: RewardTokenAnalyzeRequest):
    """分析奖励代币的真实价值和卖出策略。"""
    result = reward_analyzer.analyze(
        token_symbol=req.tokenSymbol,
        token_address=req.tokenAddress,
        current_price_usd=req.currentPriceUsd,
        price_7d_ago=req.price7dAgo,
        price_30d_ago=req.price30dAgo,
        price_90d_ago=req.price90dAgo,
        daily_emission_tokens=req.dailyEmissionTokens,
        gross_reward_apr_pct=req.grossRewardAprPct,
    )
    return {
        "tokenSymbol": result.token_symbol,
        "currentPriceUsd": result.current_price_usd,
        "priceChange7dPct": result.price_change_7d_pct,
        "priceChange30dPct": result.price_change_30d_pct,
        "isInflationary": result.is_inflationary,
        "sellPressureScore": result.sell_pressure_score,
        "recommendedStrategy": result.recommended_strategy.value,
        "adjustedAprPct": result.adjusted_apr_pct,
        "reasoning": result.reasoning,
    }


@app.post("/liquidation/check")
async def check_liquidation(req: LiquidationCheckRequest):
    """检查借贷仓位的清算风险。"""
    result = liquidation_monitor.assess_risk(
        position_id=req.positionId,
        protocol=req.protocol,
        chain=req.chain,
        wallet_address=req.walletAddress,
        collateral_usd=req.collateralUsd,
        debt_usd=req.debtUsd,
        liquidation_threshold=req.liquidationThreshold,
    )
    return {
        "positionId": result.position_id,
        "healthFactor": result.health_factor,
        "status": result.status.value,
        "priceDropToLiquidationPct": result.price_drop_to_liquidation_pct,
        "liquidationPenaltyPct": result.liquidation_penalty_pct,
        "potentialLossUsd": result.potential_loss_usd,
        "action": result.action,
        "suggestedAmountUsd": result.suggested_amount_usd,
        "reasoning": result.reasoning,
    }


@app.get("/strategies/restaking")
async def get_restaking_opportunities():
    """获取再质押收益机会。"""
    results = restaking_strategy.find_opportunities()
    return {
        "opportunities": [
            {
                "protocol": r.protocol,
                "chain": r.chain,
                "asset": r.asset,
                "baseStakingApr": r.base_staking_apr,
                "restakingApr": r.restaking_apr,
                "defiComposableApr": r.defi_composable_apr,
                "totalStackedApr": r.total_stacked_apr,
                "tvlUsd": r.tvl_usd,
                "riskScore": r.risk_score,
                "slashingRisk": r.slashing_risk,
                "pointsMultiplier": r.points_multiplier,
                "recommendation": r.recommendation,
            }
            for r in results
        ],
        "count": len(results),
    }


@app.get("/strategies/rwa")
async def get_rwa_opportunities():
    """获取 RWA 代币化资产收益机会。"""
    results = rwa_strategy.find_opportunities()
    return {
        "opportunities": [
            {
                "protocol": r.protocol,
                "productName": r.product_name,
                "chain": r.chain,
                "underlyingAsset": r.underlying_asset,
                "yieldPct": r.yield_pct,
                "tvlUsd": r.tvl_usd,
                "minInvestmentUsd": r.min_investment_usd,
                "kycRequired": r.kyc_required,
                "tokenSymbol": r.token_symbol,
                "composability": r.composability,
                "riskLevel": r.risk_level,
            }
            for r in results
        ],
        "count": len(results),
    }


@app.post("/strategies/funding-rate")
async def analyze_funding_rates(req: FundingRateRequest):
    """分析永续合约资金费率套利机会。"""
    rates = req.fundingRates
    results = funding_rate_strategy.analyze_opportunities(rates)
    return {
        "opportunities": [
            {
                "exchange": r.exchange,
                "symbol": r.symbol,
                "currentFundingRate": r.current_funding_rate,
                "annualizedRatePct": r.annualized_rate_pct,
                "avg7dRatePct": r.avg_7d_rate_pct,
                "direction": r.direction,
                "estimatedDailyYieldUsd": r.estimated_daily_yield_usd,
                "estimatedAnnualYieldUsd": r.estimated_annual_yield_usd,
                "riskLevel": r.risk_level,
                "notes": r.notes,
            }
            for r in results
        ],
        "count": len(results),
    }


@app.get("/exposure")
async def get_exposure():
    """Get current portfolio exposure report."""
    try:
        import psycopg2
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT p.chain_id, p.value_usd, pl.protocol_id
            FROM positions p
            LEFT JOIN pools pl ON p.pool_id = pl.pool_id
            WHERE p.status = 'active'
        """)
        positions = [{"chain": r[0], "valueUsd": float(r[1] or 0), "protocolId": r[2] or ""} for r in cur.fetchall()]
        cur.close()
        conn.close()
    except Exception:
        positions = []
    report = exposure_manager.check_exposure(positions)
    return {
        "totalExposureUsd": report.total_exposure_usd,
        "byChain": report.by_chain,
        "byProtocol": report.by_protocol,
        "violations": report.violations,
        "utilizationPct": report.utilization_pct,
    }


# ---- AI 顾问 ----

class AIAnalysisRequest(BaseModel):
    total_pools: int = 0
    avg_apr: float = 0
    median_apr: float = 0
    total_tvl_usd: float = 0
    top_pools: list[dict] = []
    active_positions: list[dict] = []
    portfolio_value_usd: float = 0
    portfolio_pnl_usd: float = 0


class AISignalEvalRequest(BaseModel):
    signal: dict
    portfolio_value_usd: float = 0


@app.post("/ai/analyze")
async def ai_analyze_market(req: AIAnalysisRequest):
    """AI 顾问分析当前市场并给出建议"""
    try:
        context = MarketContext(
            total_pools=req.total_pools,
            avg_apr=req.avg_apr,
            median_apr=req.median_apr,
            total_tvl_usd=req.total_tvl_usd,
            top_pools=req.top_pools,
            active_positions=req.active_positions,
            portfolio_value_usd=req.portfolio_value_usd,
            portfolio_pnl_usd=req.portfolio_pnl_usd,
        )
        advice = await ai_advisor.analyze(context)
        return {
            "marketRegime": advice.market_regime,
            "riskLevel": advice.risk_level,
            "confidence": advice.confidence,
            "summary": advice.summary,
            "analysis": advice.analysis,
            "recommendations": advice.recommendations,
            "parameterAdjustments": advice.parameter_adjustments,
            "timestamp": advice.timestamp,
        }
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


@app.post("/ai/evaluate-signal")
async def ai_evaluate_signal(req: AISignalEvalRequest):
    """AI 评估单个交易信号是否应该执行"""
    try:
        context = MarketContext(portfolio_value_usd=req.portfolio_value_usd)
        result = await ai_advisor.evaluate_signal(req.signal, context)
        return result
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


@app.get("/ai/status")
async def ai_status():
    """检查 AI 顾问状态"""
    has_key = bool(ai_advisor.api_key)
    return {
        "enabled": has_key,
        "fallbackMode": not has_key,
        "message": "AI 顾问已就绪" if has_key else "未配置 API Key，使用规则引擎兜底",
    }


# ---- 市场情绪 ----

sentiment_collector = MarketSentimentCollector()

@app.get("/sentiment")
async def get_sentiment():
    """获取实时市场情绪"""
    try:
        s = await sentiment_collector.get_composite_sentiment()
        return {
            "fearGreedIndex": s.fear_greed_index,
            "fearGreedLabel": s.fear_greed_label,
            "btcPrice": s.btc_price_usd,
            "btc24hChange": s.btc_24h_change_pct,
            "ethPrice": s.eth_price_usd,
            "eth24hChange": s.eth_24h_change_pct,
            "gasGwei": s.gas_gwei,
            "compositeScore": s.composite_score,
            "marketRegime": s.market_regime,
            "suggestion": s.suggestion,
            "timestamp": s.timestamp,
        }
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


# ---- Alpha 信号 ----

alpha_scanner = AlphaScanner()

@app.get("/alpha")
async def get_alpha():
    """获取 Alpha 信号"""
    try:
        signals = alpha_scanner.get_alpha_signals()
        return {
            "signals": [
                {
                    "type": s.signal_type,
                    "poolId": s.pool_id,
                    "symbol": s.symbol,
                    "protocolId": s.protocol_id,
                    "chain": s.chain,
                    "description": s.description,
                    "strength": s.strength,
                    "data": s.data,
                    "timestamp": s.timestamp,
                }
                for s in signals
            ],
            "count": len(signals),
        }
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


# ---- AI 记忆 ----

memory_mgr = MemoryManager()
feedback_loop = FeedbackLoop()

@app.get("/ai/memory")
async def get_ai_memory(limit: int = 20):
    """获取 AI 历史记忆"""
    try:
        memories = memory_mgr.recall(n=limit)
        return {"memories": memories, "count": len(memories)}
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


@app.get("/ai/accuracy")
async def get_ai_accuracy(days: int = 30):
    """获取 AI 决策准确率"""
    try:
        report = feedback_loop.get_accuracy_report(days)
        return report
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="内部错误")


# ---- AI 思考日志 ----

@app.get("/ai/think-log")
async def get_think_log(limit: int = 10):
    """获取 AI 思考循环日志"""
    conn = None
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT cycle_id, input_summary, output_summary, full_output, duration_ms, actions_taken, created_at "
            "FROM ai_think_log ORDER BY created_at DESC LIMIT %s",
            (limit,),
        )
        logs = []
        for row in cur.fetchall():
            logs.append({
                "cycleId": row[0],
                "inputSummary": row[1],
                "outputSummary": row[2],
                "fullOutput": row[3],
                "durationMs": row[4],
                "actionsTaken": row[5],
                "createdAt": row[6].isoformat() if row[6] else "",
            })
        cur.close()
        return {"logs": logs, "count": len(logs)}
    except Exception as e:
        logger.error(f"获取思考日志失败: {e}")
        return {"logs": [], "count": 0, "error": str(e)}
    finally:
        if conn:
            conn.close()


# ---- 回测 API ----

class BacktestRequest(BaseModel):
    days: int = 90
    initial_capital: float = 10000
    strategy: str = "optimizer"
    max_positions: int = 5
    max_single_pct: float = 25
    min_health_score: float = 60
    min_apr: float = 5
    max_apr: float = 200
    step_hours: int = 6


@app.post("/backtest/run")
async def run_backtest(req: BacktestRequest):
    """执行策略回测"""
    try:
        bt = Backtester(
            initial_capital=req.initial_capital,
            max_positions=req.max_positions,
            max_single_pct=req.max_single_pct,
            min_health_score=req.min_health_score,
            min_apr=req.min_apr,
            max_apr=req.max_apr,
            step_hours=req.step_hours,
        )
        # 回测可能较慢，在线程池中运行
        import asyncio
        loop = asyncio.get_event_loop()
        report = await loop.run_in_executor(None, bt.run, req.days, req.strategy)
        return {
            "success": True,
            "report": report.to_dict(),
            "summary": report.summary(),
        }
    except Exception as e:
        logger.error(f"回测执行失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/backtest/quick")
async def quick_backtest(days: int = 30):
    """快速回测（默认参数）"""
    try:
        bt = Backtester(initial_capital=10000)
        import asyncio
        loop = asyncio.get_event_loop()
        report = await loop.run_in_executor(None, bt.run, days, "optimizer")
        return {
            "success": True,
            "summary": report.summary(),
            "totalReturn": report.total_return_pct,
            "annualizedReturn": report.annualized_return_pct,
            "maxDrawdown": report.max_drawdown_pct,
            "sharpeRatio": report.sharpe_ratio,
            "winRate": report.win_rate_pct,
            "totalTrades": report.total_trades,
        }
    except Exception as e:
        logger.error(f"快速回测失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---- ML 训练 API (2026 升级) ----

class MLTrainRequest(BaseModel):
    model: str = "transformer"  # "transformer" | "rl" | "both"
    days: int = 90
    epochs: int = 50


@app.post("/ml/train")
async def train_ml_models(req: MLTrainRequest):
    """从历史数据训练 Transformer 预测模型和/或 PPO 强化学习优化器"""
    import asyncio
    loop = asyncio.get_event_loop()
    results: dict = {}

    def _run():
        nonlocal results
        if req.model in ("transformer", "both"):
            try:
                predictor = HybridYieldPredictor()
                r = predictor.train_from_history(days=req.days, epochs=req.epochs)
                results["transformer"] = r
            except Exception as e:
                results["transformer"] = {"status": "error", "error": str(e)}
        if req.model in ("rl", "both"):
            try:
                rl = PPOOptimizer()
                conn = _get_db_conn()
                cur = conn.cursor()
                cur.execute("""
                    SELECT pool_id, time, apr_total, tvl_usd
                    FROM pool_snapshots
                    WHERE time > NOW() - INTERVAL '1 day' * %s AND apr_total IS NOT NULL
                    ORDER BY pool_id, time
                """, (req.days,))
                rows = cur.fetchall()
                cur.close()
                conn.close()
                pool_data: dict = {}
                for pid, ts, apr, tvl in rows:
                    if pid not in pool_data:
                        pool_data[pid] = []
                    pool_data[pid].append({"time": ts, "apr_total": float(apr or 0), "tvl_usd": float(tvl or 0)})
                import pandas as pd
                pool_histories = {
                    pid: pd.DataFrame(recs).set_index("time").sort_index()
                    for pid, recs in pool_data.items()
                    if len(recs) >= 60
                }
                r = rl.train_from_history(pool_histories, sentiment_history=[], episodes=min(100, req.epochs))
                results["rl"] = r
            except Exception as e:
                results["rl"] = {"status": "error", "error": str(e)}
        return results

    results = await loop.run_in_executor(None, _run)
    return {"success": True, "results": results}
