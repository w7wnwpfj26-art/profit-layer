"""
TradingAgents 集成模块
将多代理交易框架集成到 Nexus Yield 系统
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from abc import ABC, abstractmethod

import yaml
import aiohttp
import asyncpg
from pydantic import BaseModel, Field

from ..models.market_sentiment import MarketSentimentCollector

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# DB 连接参数
DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": os.getenv("POSTGRES_PORT", "5433"),
    "database": os.getenv("POSTGRES_DB", "defi_yield"),
    "user": os.getenv("POSTGRES_USER", "defi"),
    "password": os.getenv("POSTGRES_PASSWORD", "change_me_in_production"),
}

async def get_db_connection():
    """获取数据库连接"""
    return await asyncpg.connect(**DB_CONFIG)

# 数据模型
class AnalysisReport(BaseModel):
    """分析报告模型"""
    analyst_type: str
    asset: str
    score: float = Field(ge=0.0, le=1.0)
    reasoning: str
    recommendations: List[str]
    risk_factors: List[str] = []
    confidence: float = Field(ge=0.0, le=1.0, default=0.8)
    timestamp: datetime = Field(default_factory=datetime.now)

class ResearchReport(BaseModel):
    """研究报告模型"""
    perspective: str  # "bullish" or "bearish"
    asset: str
    opportunities: List[Dict[str, Any]] = []
    risks: List[Dict[str, Any]] = []
    overall_sentiment: str
    confidence: float
    reasoning: str
    timestamp: datetime = Field(default_factory=datetime.now)

class TradingDecision(BaseModel):
    """交易决策模型"""
    action: str  # "BUY", "SELL", "HOLD"
    asset: str
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    suggested_allocation: float
    timing_recommendation: str
    risk_level: str  # "low", "medium", "high"
    expected_return: float
    timestamp: datetime = Field(default_factory=datetime.now)

class RiskAssessment(BaseModel):
    """风险评估模型"""
    overall_risk_score: float = Field(ge=0.0, le=1.0)
    risk_breakdown: Dict[str, float]
    risk_factors: List[str]
    recommendations: List[str]
    acceptable: bool
    timestamp: datetime = Field(default_factory=datetime.now)

class PortfolioOptimization(BaseModel):
    """组合优化模型"""
    recommended_allocation: Dict[str, float]
    risk_controls: Dict[str, Any]
    expected_return: float
    risk_adjusted_return: float
    approval_status: str  # "APPROVED", "REJECTED", "MODIFIED"
    rejection_reason: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

# 基础分析师类
class BaseAnalyst(ABC):
    """基础分析师抽象类"""
    
    def __init__(self, analyst_type: str, llm_config: Dict):
        self.analyst_type = analyst_type
        self.llm_config = llm_config
        self.logger = logging.getLogger(f"{__name__}.{analyst_type}")
    
    @abstractmethod
    async def analyze(self, data: Dict[str, Any]) -> AnalysisReport:
        """执行分析"""
        pass
    
    async def _call_llm(self, prompt: str, context: str) -> str:
        """调用 LLM API"""
        try:
            # 这里集成实际的 LLM 调用
            # 暂时返回模拟结果
            return f"基于 {self.analyst_type} 分析的模拟结果"
        except Exception as e:
            self.logger.error(f"LLM 调用失败: {e}")
            return "分析失败"

# 具体分析师实现
class FundamentalAnalyst(BaseAnalyst):
    """基本面分析师"""
    
    def __init__(self, llm_config: Dict):
        super().__init__("fundamental", llm_config)
    
    async def analyze(self, pool_data: Dict[str, Any]) -> AnalysisReport:
        """基本面分析"""
        symbol = pool_data.get('symbol', 'Unknown')
        pool_id = pool_data.get('pool_id')
        self.logger.info(f"开始基本面分析: {symbol}")
        
        # 尝试从数据库获取最新数据
        db_data = {}
        if pool_id:
            try:
                conn = await get_db_connection()
                row = await conn.fetchrow(
                    "SELECT tvl_usd, apr_total, protocol_id, chain_id, health_score FROM pools WHERE pool_id = $1",
                    pool_id
                )
                await conn.close()
                if row:
                    db_data = dict(row)
                    self.logger.info(f"已从数据库获取最新数据: {pool_id}")
            except Exception as e:
                self.logger.error(f"数据库查询失败: {e}")

        # 合并数据 (DB 数据优先)
        tvl = float(db_data.get("tvl_usd") or pool_data.get("tvl_usd", 0))
        apr = float(db_data.get("apr_total") or pool_data.get("apr_total", 0))
        # 优先使用数据库中的健康评分
        health_score = float(db_data.get("health_score") or pool_data.get("health_score", 60))
        audit_score = pool_data.get("audit_score", 5)
        
        # 分析 TVL 稳定性
        tvl_stability = self._assess_tvl_stability(tvl)
        
        # 评估收益率可持续性
        yield_sustainability = self._assess_yield_sustainability(apr)
        
        # 评估协议健康状况
        protocol_health = self._evaluate_protocol_health(health_score, audit_score)
        
        # 综合评分
        score = (tvl_stability + yield_sustainability + protocol_health) / 3
        
        reasoning = f"""
        基本面分析结果 ({symbol}):
        - TVL: ${tvl:,.0f} (稳定性评分: {tvl_stability:.2f})
        - APR: {apr:.2%} (可持续性评分: {yield_sustainability:.2f})
        - 协议健康: {health_score}/100 (评分: {protocol_health:.2f})
        - 综合评分: {score:.2f}
        """
        
        recommendations = []
        if score > 0.7:
            recommendations.append("基本面强劲 - 建议关注")
        elif score > 0.4:
            recommendations.append("基本面一般 - 需配合其他指标")
        else:
            recommendations.append("基本面较弱 - 风险较高")
        
        return AnalysisReport(
            analyst_type="fundamental",
            asset=symbol,
            score=score,
            reasoning=reasoning.strip(),
            recommendations=recommendations,
            confidence=min(score + 0.2, 1.0)
        )
    
    def _assess_tvl_stability(self, tvl: float) -> float:
        """评估 TVL 稳定性"""
        if tvl > 100_000_000:  # 1亿以上
            return 0.95
        elif tvl > 50_000_000:
            return 0.85
        elif tvl > 10_000_000:  # 1000万以上
            return 0.7
        elif tvl > 1_000_000:  # 100万以上
            return 0.5
        else:
            return 0.3
    
    def _assess_yield_sustainability(self, apr: float) -> float:
        """评估收益率可持续性"""
        # APR 在合理范围内
        if 0.02 <= apr <= 0.2:  # 2% - 20%
            return 0.9
        elif 0.2 < apr <= 0.5:  # 20% - 50%
            return 0.7
        elif 0.5 < apr <= 1.0:  # 50% - 100%
            return 0.5
        elif apr > 1.0:  # 超过 100%
            return 0.2  # 高风险，不可持续
        else:
            return 0.4 # 太低
    
    def _evaluate_protocol_health(self, health_score: float, audit_score: float) -> float:
        """评估协议健康状况"""
        # 综合健康评分
        health_component = health_score / 100
        audit_component = audit_score / 10
        return (health_component * 0.6 + audit_component * 0.4)


class SentimentAnalyst(BaseAnalyst):
    """情绪分析师"""
    
    def __init__(self, llm_config: Dict):
        super().__init__("sentiment", llm_config)
        self.collector = MarketSentimentCollector()
    
    async def analyze(self, sentiment_data: Dict[str, Any]) -> AnalysisReport:
        """情绪分析"""
        self.logger.info("开始情绪分析 (使用实时市场数据)")
        
        try:
            # 获取实时市场情绪
            real_sentiment = await self.collector.get_composite_sentiment()
            
            # 宏观评分 (0-1)
            macro_score = real_sentiment.composite_score / 100.0
            
            # 如果输入数据中有特定代币的情绪，则结合使用
            # 否则主要依赖宏观情绪
            twitter_sentiment = sentiment_data.get("twitter_sentiment", macro_score)
            
            # BTC 24h 涨跌幅影响 (每 10% 涨跌幅对应 +/- 0.1 分)
            btc_change = real_sentiment.btc_24h_change_pct
            trend_impact = max(-0.2, min(0.2, btc_change / 100.0))
            
            # 综合评分: 50% 宏观情绪 + 30% Twitter(如有) + 20% 趋势修正
            score = (macro_score * 0.5 + twitter_sentiment * 0.3 + 0.5 + trend_impact)
            score = max(0.1, min(0.95, score)) # 限制在 0.1-0.95
            
            reasoning = f"""
            情绪分析结果 (实时):
            - 市场状态: {real_sentiment.market_regime} (恐慌贪婪指数: {real_sentiment.fear_greed_index})
            - BTC 24h走势: {btc_change:+.2f}%
            - 宏观情绪评分: {macro_score:.2f}
            - 综合情绪评分: {score:.2f}
            - 市场建议: {real_sentiment.suggestion}
            """
            
        except Exception as e:
            self.logger.error(f"获取实时情绪失败: {e}")
            score = 0.5
            reasoning = "无法获取实时情绪数据，使用默认中性评分。"
        
        recommendations = []
        if score > 0.6:
            recommendations.append("市场情绪积极 - 顺势而为")
        elif score < 0.4:
            recommendations.append("市场情绪消极 - 注意风险")
        else:
            recommendations.append("市场情绪中性 - 观望")
        
        return AnalysisReport(
            analyst_type="sentiment",
            asset=sentiment_data.get("symbol", "Global"),
            score=score,
            reasoning=reasoning.strip(),
            recommendations=recommendations,
            confidence=0.85
        )


class TechnicalAnalyst(BaseAnalyst):
    """技术分析师"""
    
    def __init__(self, llm_config: Dict):
        super().__init__("technical", llm_config)
    
    async def analyze(self, technical_data: Dict[str, Any]) -> AnalysisReport:
        """技术分析"""
        symbol = technical_data.get('symbol', 'Unknown')
        pool_id = technical_data.get('pool_id')
        self.logger.info(f"开始技术分析: {symbol}")
        
        trend_score = 0.5
        volatility = 0.05 # default 5%
        
        if pool_id:
            try:
                conn = await get_db_connection()
                # Fetch last 7 days snapshots
                rows = await conn.fetch(
                    """
                    SELECT tvl_usd, apr_total, time 
                    FROM pool_snapshots 
                    WHERE pool_id = $1 
                    ORDER BY time DESC 
                    LIMIT 7
                    """,
                    pool_id
                )
                await conn.close()
                
                if len(rows) >= 2:
                    current_tvl = float(rows[0]['tvl_usd'])
                    prev_tvl = float(rows[-1]['tvl_usd'])
                    tvl_change = (current_tvl - prev_tvl) / prev_tvl if prev_tvl > 0 else 0
                    
                    # TVL Trend as a proxy for price/interest trend
                    if tvl_change > 0.05: trend_score = 0.8
                    elif tvl_change < -0.05: trend_score = 0.2
                    else: trend_score = 0.5
                    
                    # Calculate simplified volatility of APR
                    aprs = [float(r['apr_total']) for r in rows]
                    if aprs:
                        avg_apr = sum(aprs) / len(aprs)
                        variance = sum((x - avg_apr) ** 2 for x in aprs) / len(aprs)
                        volatility = variance ** 0.5
                else:
                    self.logger.warning(f"历史数据不足: {pool_id}")
                    
            except Exception as e:
                self.logger.error(f"获取历史数据失败: {e}")
        
        # Combine with inputs
        input_trend = technical_data.get("trend_strength", 0.5)
        # Use DB trend if we found it (and it deviated from neutral), else input
        final_trend = trend_score if abs(trend_score - 0.5) > 0.1 else input_trend
        
        il_risk = technical_data.get("impermanent_loss_risk", 0.1) # Default low
        
        score = (final_trend * 0.6 + (1 - min(volatility * 5, 1.0)) * 0.2 + (1 - il_risk) * 0.2)
        score = max(0.1, min(0.9, score))
        
        reasoning = f"""
        技术分析结果 ({symbol}):
        - TVL/价格趋势评分: {final_trend:.2f}
        - 波动率 (APR): {volatility:.2%}
        - 无常损失风险估算: {il_risk:.2f}
        - 综合技术评分: {score:.2f}
        """
        
        recommendations = []
        if score > 0.7:
            recommendations.append("技术指标向好 - 趋势向上")
        elif score < 0.4:
            recommendations.append("技术指标转弱 - 趋势向下")
        else:
            recommendations.append("技术指标震荡 - 区间操作")
            
        return AnalysisReport(
            analyst_type="technical",
            asset=symbol,
            score=score,
            reasoning=reasoning.strip(),
            recommendations=recommendations,
            risk_factors=["高波动"] if volatility > 0.1 else [],
            confidence=0.75
        )


# 研究团队
class ResearchTeam:
    """研究团队 - 牛市/熊市研究员"""
    
    def __init__(self, llm_config: Dict):
        self.llm_config = llm_config
        self.logger = logging.getLogger(f"{__name__}.research_team")
    
    async def conduct_research(self, analyses: List[AnalysisReport]) -> Tuple[ResearchReport, ResearchReport]:
        """执行研究并生成牛市/熊市报告"""
        self.logger.info("开始研究团队分析")
        
        # 牛市研究
        bull_report = await self._generate_bull_report(analyses)
        
        # 熊市研究
        bear_report = await self._generate_bear_report(analyses)
        
        return bull_report, bear_report
    
    async def _generate_bull_report(self, analyses: List[AnalysisReport]) -> ResearchReport:
        """生成牛市研究报告"""
        opportunities = []
        overall_score = sum(analysis.score for analysis in analyses) / len(analyses)
        
        for analysis in analyses:
            if analysis.score > 0.6:
                opportunities.append({
                    "type": analysis.analyst_type,
                    "asset": analysis.asset,
                    "score": analysis.score,
                    "reasoning": analysis.reasoning[:200] + "..."
                })
        
        reasoning = f"""
        牛市观点：
        - 综合评分: {overall_score:.2f}
        - 机会数量: {len(opportunities)}
        - 主要积极因素: {[opp['type'] for opp in opportunities[:3]]}
        """
        
        return ResearchReport(
            perspective="bullish",
            asset=analyses[0].asset if analyses else "Unknown",
            opportunities=opportunities,
            overall_sentiment="optimistic" if overall_score > 0.6 else "neutral",
            confidence=min(overall_score + 0.1, 1.0),
            reasoning=reasoning.strip()
        )
    
    async def _generate_bear_report(self, analyses: List[AnalysisReport]) -> ResearchReport:
        """生成熊市研究报告"""
        risks = []
        overall_score = sum(analysis.score for analysis in analyses) / len(analyses)
        
        for analysis in analyses:
            if analysis.score < 0.4 or analysis.risk_factors:
                risks.append({
                    "type": analysis.analyst_type,
                    "asset": analysis.asset,
                    "score": analysis.score,
                    "risk_factors": analysis.risk_factors,
                    "reasoning": analysis.reasoning[:200] + "..."
                })
        
        reasoning = f"""
        熊市观点：
        - 综合评分: {overall_score:.2f}
        - 风险数量: {len(risks)}
        - 主要风险因素: {[risk['type'] for risk in risks[:3]]}
        """
        
        return ResearchReport(
            perspective="bearish",
            asset=analyses[0].asset if analyses else "Unknown",
            risks=risks,
            overall_sentiment="cautious" if overall_score < 0.5 else "neutral",
            confidence=max(1.0 - overall_score, 0.3),
            reasoning=reasoning.strip()
        )

# 交易员代理
class TraderAgent:
    """交易员代理"""
    
    def __init__(self, llm_config: Dict):
        self.llm_config = llm_config
        self.logger = logging.getLogger(f"{__name__}.trader")
    
    async def make_decision(
        self, 
        analyses: List[AnalysisReport],
        bull_report: ResearchReport,
        bear_report: ResearchReport,
        risk_assessment: RiskAssessment
    ) -> TradingDecision:
        """做出交易决策"""
        self.logger.info("开始交易决策")
        
        # 计算综合评分
        analysis_score = sum(a.score for a in analyses) / len(analyses)
        bull_score = bull_report.confidence
        bear_score = bear_report.confidence
        risk_score = risk_assessment.overall_risk_score
        
        # 权重分配
        analysis_weight = 0.4
        research_weight = 0.3
        risk_weight = 0.3
        
        # 综合决策评分
        composite_score = (
            analysis_score * analysis_weight +
            bull_score * research_weight * 0.6 +  # 牛市权重稍高
            (1 - bear_score) * research_weight * 0.4 +  # 熊市作为反向指标
            (1 - risk_score) * risk_weight
        )
        
        # 决策逻辑
        if composite_score > 0.7 and risk_assessment.acceptable:
            action = "BUY"
            confidence = min(composite_score, 1 - risk_score)
            risk_level = "medium" if risk_score > 0.4 else "low"
        elif composite_score < 0.3 or risk_score > 0.7:
            action = "SELL"
            confidence = max(0.3, 1 - risk_score)
            risk_level = "high"
        else:
            action = "HOLD"
            confidence = 0.5
            risk_level = "medium"
        
        reasoning = f"""
        交易决策：
        - 综合评分: {composite_score:.2f}
        - 分析评分: {analysis_score:.2f}
        - 研究评分: {bull_score:.2f} (牛市), {bear_score:.2f} (熊市)
        - 风险评分: {risk_score:.2f}
        - 决策: {action}
        - 置信度: {confidence:.2f}
        """
        
        return TradingDecision(
            action=action,
            asset=analyses[0].asset if analyses else "Unknown",
            confidence=confidence,
            reasoning=reasoning.strip(),
            suggested_allocation=self._calculate_allocation(composite_score),
            timing_recommendation=self._suggest_timing(composite_score),
            risk_level=risk_level,
            expected_return=self._calculate_expected_return(composite_score, risk_score)
        )
    
    def _calculate_allocation(self, score: float) -> float:
        """计算建议配置比例"""
        # 基于评分计算配置比例（0-100%）
        base_allocation = score * 0.1  # 最高 10%
        return min(base_allocation, 0.1)  # 不超过 10%
    
    def _suggest_timing(self, score: float) -> str:
        """建议交易时机"""
        if score > 0.8:
            return "立即执行"
        elif score > 0.6:
            return "24小时内执行"
        elif score > 0.4:
            return "等待更好时机"
        else:
            return "暂时观望"
    
    def _calculate_expected_return(self, score: float, risk: float) -> float:
        """计算预期收益"""
        # 简化计算：评分 * (1 - 风险) * 年化倍数
        return score * (1 - risk) * 0.3  # 最高 30% 年化

# 风险管理团队
class RiskManagementTeam:
    """风险管理团队"""
    
    def __init__(self, llm_config: Dict):
        self.llm_config = llm_config
        self.logger = logging.getLogger(f"{__name__}.risk_management")
    
    async def assess_risk(self, data: Dict[str, Any]) -> RiskAssessment:
        """风险评估"""
        self.logger.info("开始风险评估")
        
        # 市场风险
        market_risk = self._assess_market_risk(data)
        
        # 流动性风险
        liquidity_risk = self._assess_liquidity_risk(data)
        
        # 集中风险
        concentration_risk = self._assess_concentration_risk(data)
        
        # 智能合约风险
        contract_risk = self._assess_contract_risk(data)
        
        # 综合风险评分
        overall_risk = (market_risk + liquidity_risk + concentration_risk + contract_risk) / 4
        
        risk_breakdown = {
            "market_risk": market_risk,
            "liquidity_risk": liquidity_risk,
            "concentration_risk": concentration_risk,
            "contract_risk": contract_risk
        }
        
        recommendations = self._generate_risk_recommendations(overall_risk, risk_breakdown)
        
        return RiskAssessment(
            overall_risk_score=overall_risk,
            risk_breakdown=risk_breakdown,
            risk_factors=self._identify_risk_factors(risk_breakdown),
            recommendations=recommendations,
            acceptable=overall_risk < 0.6  # 风险阈值
        )
    
    def _assess_market_risk(self, data: Dict) -> float:
        """评估市场风险"""
        volatility = data.get("volatility", 0.5)
        correlation = data.get("market_correlation", 0.5)
        return (volatility + correlation) / 2
    
    def _assess_liquidity_risk(self, data: Dict) -> float:
        """评估流动性风险"""
        liquidity_ratio = data.get("liquidity_ratio", 0.5)
        return 1 - liquidity_ratio  # 流动性越低，风险越高
    
    def _assess_concentration_risk(self, data: Dict) -> float:
        """评估集中风险"""
        concentration = data.get("concentration_ratio", 0.3)
        return concentration
    
    def _assess_contract_risk(self, data: Dict) -> float:
        """评估智能合约风险"""
        audit_score = data.get("audit_score", 5) / 10
        protocol_age = data.get("protocol_age_days", 365) / 365
        
        # 审计分数越低，风险越高；协议越新，风险越高
        return (1 - audit_score) * 0.6 + (1 - protocol_age) * 0.4
    
    def _identify_risk_factors(self, risk_breakdown: Dict[str, float]) -> List[str]:
        """识别风险因素"""
        factors = []
        for risk_type, score in risk_breakdown.items():
            if score > 0.6:
                factors.append(f"{risk_type.replace('_', ' ').title()} 过高 ({score:.2f})")
        return factors
    
    def _generate_risk_recommendations(self, overall_risk: float, breakdown: Dict) -> List[str]:
        """生成风险建议"""
        recommendations = []
        
        if overall_risk > 0.7:
            recommendations.append("建议减少仓位或退出")
        elif overall_risk > 0.5:
            recommendations.append("建议降低仓位规模")
        
        # 针对具体风险类型的建议
        if breakdown["market_risk"] > 0.6:
            recommendations.append("关注市场波动，考虑对冲")
        
        if breakdown["liquidity_risk"] > 0.6:
            recommendations.append("提高流动性管理")
        
        if breakdown["concentration_risk"] > 0.6:
            recommendations.append("分散投资，降低集中度")
        
        if breakdown["contract_risk"] > 0.6:
            recommendations.append("选择审计更完善的协议")
        
        return recommendations

# 主控制器
class TradingAgentsController:
    """TradingAgents 主控制器"""
    
    def __init__(self, config_path: str = "config/trading_agents.yaml"):
        self.config = self._load_config(config_path)
        self.analysts = self._initialize_analysts()
        self.research_team = ResearchTeam(self.config["llm"])
        self.trader = TraderAgent(self.config["llm"])
        self.risk_manager = RiskManagementTeam(self.config["llm"])
        self.logger = logging.getLogger(f"{__name__}.controller")
    
    def _load_config(self, config_path: str) -> Dict:
        """加载配置"""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except Exception as e:
            self.logger.error(f"配置加载失败: {e}")
            # 返回默认配置
            return {
                "llm": {
                    "primary_provider": "openai",
                    "models": {
                        "fundamental_analyst": {"provider": "openai", "model": "gpt-4"},
                        "sentiment_analyst": {"provider": "openai", "model": "gpt-4"},
                        "technical_analyst": {"provider": "openai", "model": "gpt-4"}
                    }
                }
            }
    
    def _initialize_analysts(self) -> Dict[str, BaseAnalyst]:
        """初始化分析师"""
        return {
            "fundamental": FundamentalAnalyst(self.config["llm"]),
            "sentiment": SentimentAnalyst(self.config["llm"]),
            "technical": TechnicalAnalyst(self.config["llm"])
        }
    
    async def analyze_opportunity(self, opportunity_data: Dict[str, Any]) -> Dict[str, Any]:
        """分析投资机会"""
        self.logger.info(f"开始分析机会: {opportunity_data.get('symbol', 'Unknown')}")
        
        start_time = datetime.now()
        
        try:
            # 1. 分析师团队分析
            self.logger.info("步骤 1: 分析师团队分析")
            analyses = await self._conduct_analyses(opportunity_data)
            
            # 2. 研究团队分析
            self.logger.info("步骤 2: 研究团队分析")
            bull_report, bear_report = await self.research_team.conduct_research(analyses)
            
            # 3. 风险评估
            self.logger.info("步骤 3: 风险评估")
            risk_assessment = await self.risk_manager.assess_risk(opportunity_data)
            
            # 4. 交易决策
            self.logger.info("步骤 4: 交易决策")
            decision = await self.trader.make_decision(
                analyses, bull_report, bear_report, risk_assessment
            )
            
            # 5. 组合优化
            self.logger.info("步骤 5: 组合优化")
            optimization = await self._optimize_portfolio(decision, risk_assessment)
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            result = {
                "success": True,
                "analyses": [analysis.model_dump() for analysis in analyses],
                "bull_report": bull_report.model_dump(),
                "bear_report": bear_report.model_dump(),
                "risk_assessment": risk_assessment.model_dump(),
                "decision": decision.model_dump(),
                "optimization": optimization.model_dump(),
                "execution_time": execution_time,
                "timestamp": datetime.now().isoformat()
            }
            
            self.logger.info(f"分析完成，耗时: {execution_time:.2f}秒")
            return result
            
        except Exception as e:
            self.logger.error(f"分析过程失败: {e}")
            return {
                "success": False,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    async def _conduct_analyses(self, data: Dict[str, Any]) -> List[AnalysisReport]:
        """执行多维度分析"""
        tasks = []
        
        for analyst_type, analyst in self.analysts.items():
            # 为每个分析师准备相应的数据
            analyst_data = self._prepare_analyst_data(data, analyst_type)
            tasks.append(analyst.analyze(analyst_data))
        
        # 并行执行所有分析
        analyses = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 过滤成功的分析
        successful_analyses = []
        for i, result in enumerate(analyses):
            if isinstance(result, Exception):
                self.logger.error(f"{list(self.analysts.keys())[i]} 分析失败: {result}")
            else:
                successful_analyses.append(result)
        
        return successful_analyses
    
    def _prepare_analyst_data(self, data: Dict, analyst_type: str) -> Dict[str, Any]:
        """为分析师准备数据"""
        # 基础数据，所有分析师都需要
        base_data = {
            "pool_id": data.get("pool_id"),
            "symbol": data.get("symbol"),
            "chain_id": data.get("chain_id")
        }
        
        # 根据分析师类型提取相关数据
        if analyst_type == "fundamental":
            return {
                **base_data,
                "tvl_usd": data.get("tvl_usd", 0),
                "apr_total": data.get("apr_total", 0),
                "health_score": data.get("health_score", 50),
                "audit_score": data.get("audit_score", 5),
                "protocol_age_days": data.get("protocol_age_days", 365)
            }
        elif analyst_type == "sentiment":
            return {
                **base_data,
                "twitter_sentiment": data.get("twitter_sentiment", 0.5),
                "community_activity": data.get("community_activity", 0.5),
                "whale_sentiment": data.get("whale_sentiment", 0.5)
            }
        elif analyst_type == "technical":
            return {
                **base_data,
                "trend_strength": data.get("trend_strength", 0.5),
                "volume_pattern": data.get("volume_pattern", 0.5),
                "liquidity_depth": data.get("liquidity_depth", 0.5),
                "impermanent_loss_risk": data.get("impermanent_loss_risk", 0.3)
            }
        
        return data
    
    async def _optimize_portfolio(self, decision: TradingDecision, risk_assessment: RiskAssessment) -> PortfolioOptimization:
        """组合优化"""
        if risk_assessment.acceptable:
            # 风险可接受，执行优化
            allocation = {decision.asset: decision.suggested_allocation}
            risk_controls = {
                "stop_loss": 0.15,  # 15% 止损
                "take_profit": 0.30,  # 30% 止盈
                "position_size": decision.suggested_allocation,
                "rebalancing_frequency": "weekly"
            }
            
            return PortfolioOptimization(
                recommended_allocation=allocation,
                risk_controls=risk_controls,
                expected_return=decision.expected_return,
                risk_adjusted_return=decision.expected_return * (1 - risk_assessment.overall_risk_score),
                approval_status="APPROVED"
            )
        else:
            # 风险过高，拒绝或调整
            return PortfolioOptimization(
                recommended_allocation={},
                risk_controls={},
                expected_return=0,
                risk_adjusted_return=0,
                approval_status="REJECTED",
                rejection_reason="风险评估不通过"
            )
    
    async def get_trading_signals(self) -> List[Dict[str, Any]]:
        """获取实时交易信号"""
        # 这里可以集成实时数据获取和信号生成
        # 暂时返回模拟信号
        return [
            {
                "symbol": "ETH-USDC",
                "signal": "BUY",
                "confidence": 0.75,
                "reasoning": "技术面突破，基本面稳健",
                "timestamp": datetime.now().isoformat()
            }
        ]
    
    async def get_analysis_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """获取分析历史"""
        # 这里可以集成数据库查询
        # 暂时返回空列表
        return []

# API 接口
async def analyze_opportunity_endpoint(opportunity_data: Dict[str, Any]) -> Dict[str, Any]:
    """分析机会的 API 端点"""
    controller = TradingAgentsController()
    return await controller.analyze_opportunity(opportunity_data)

async def get_trading_signals_endpoint() -> List[Dict[str, Any]]:
    """获取交易信号的 API 端点"""
    controller = TradingAgentsController()
    return await controller.get_trading_signals()

# 测试函数
async def test_trading_agents():
    """测试 TradingAgents 功能"""
    logger.info("开始 TradingAgents 测试")
    
    # 测试数据
    test_data = {
        "symbol": "ETH-USDC",
        "tvl_usd": 50000000,  # 5000万
        "apr_total": 0.15,  # 15%
        "health_score": 75,
        "audit_score": 8,
        "protocol_age_days": 500,
        "twitter_sentiment": 0.7,
        "community_activity": 0.6,
        "whale_sentiment": 0.8,
        "trend_strength": 0.65,
        "volume_pattern": 0.55,
        "liquidity_depth": 0.7,
        "impermanent_loss_risk": 0.2,
        "volatility": 0.3,
        "market_correlation": 0.4,
        "liquidity_ratio": 0.8,
        "concentration_ratio": 0.2
    }
    
    controller = TradingAgentsController()
    result = await controller.analyze_opportunity(test_data)
    
    logger.info(f"测试结果: {json.dumps(result, indent=2, ensure_ascii=False, default=str)}")
    return result

if __name__ == "__main__":
    # 运行测试
    asyncio.run(test_trading_agents())