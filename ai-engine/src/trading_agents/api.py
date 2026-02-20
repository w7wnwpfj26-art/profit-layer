"""
TradingAgents API 集成模块
为 Nexus Yield 提供 TradingAgents 功能的 API 接口
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime
import asyncio
import logging

from .core import (
    TradingAgentsController,
    AnalysisReport,
    ResearchReport,
    TradingDecision,
    RiskAssessment,
    PortfolioOptimization
)

# 配置日志
logger = logging.getLogger(__name__)

# 创建路由
router = APIRouter(prefix="/trading-agents", tags=["TradingAgents"])

# 数据模型
class AnalyzeOpportunityRequest(BaseModel):
    """分析机会请求"""
    pool_id: str = Field(..., description="池子 ID")
    chain_id: str = Field(..., description="链 ID")
    symbol: str = Field(..., description="交易对符号")
    tvl_usd: float = Field(..., description="TVL (USD)", ge=0)
    apr_total: float = Field(..., description="总 APR", ge=0)
    health_score: Optional[float] = Field(None, description="健康评分", ge=0, le=100)
    audit_score: Optional[float] = Field(None, description="审计评分", ge=0, le=10)
    protocol_age_days: Optional[int] = Field(None, description="协议存在天数")
    analysis_type: str = Field("detailed", description="分析类型: quick 或 detailed")

class AnalyzeOpportunityResponse(BaseModel):
    """分析机会响应"""
    success: bool
    analyses: List[Dict[str, Any]]
    bull_report: Dict[str, Any]
    bear_report: Dict[str, Any]
    risk_assessment: Dict[str, Any]
    decision: Dict[str, Any]
    optimization: Dict[str, Any]
    execution_time: float
    timestamp: str
    message: Optional[str] = None

class TradingSignalsResponse(BaseModel):
    """交易信号响应"""
    signals: List[Dict[str, Any]]
    timestamp: str

class PortfolioOptimizationRequest(BaseModel):
    """组合优化请求"""
    portfolio_id: str = Field(..., description="投资组合 ID")
    current_positions: List[Dict[str, Any]] = Field(..., description="当前持仓")
    risk_tolerance: str = Field("moderate", description="风险承受能力: conservative, moderate, aggressive")
    optimization_criteria: Optional[Dict[str, Any]] = Field(None, description="优化标准")

class PortfolioOptimizationResponse(BaseModel):
    """组合优化响应"""
    success: bool
    current_portfolio: Dict[str, Any]
    recommended_allocation: Dict[str, Any]
    risk_assessment: Dict[str, Any]
    optimization_details: Dict[str, Any]
    execution_plan: List[Dict[str, Any]]
    expected_performance: Dict[str, Any]
    timestamp: str
    message: Optional[str] = None

class AgentStatusResponse(BaseModel):
    """代理状态响应"""
    agents: List[Dict[str, Any]]
    system_status: str
    last_update: str

# 全局控制器实例
_controller: Optional[TradingAgentsController] = None

def get_controller() -> TradingAgentsController:
    """获取控制器实例"""
    global _controller
    if _controller is None:
        _controller = TradingAgentsController()
    return _controller

# API 端点
@router.post("/analyze", response_model=AnalyzeOpportunityResponse)
async def analyze_opportunity(request: AnalyzeOpportunityRequest):
    """
    分析投资机会
    
    使用多代理框架对 DeFi 投资机会进行全面分析，包括：
    - 基本面分析
    - 情绪分析
    - 技术分析
    - 风险评估
    - 交易决策建议
    """
    try:
        logger.info(f"开始分析机会: {request.symbol} on {request.chain_id}")
        
        # 准备分析数据
        analysis_data = {
            "symbol": request.symbol,
            "tvl_usd": request.tvl_usd,
            "apr_total": request.apr_total,
            "health_score": request.health_score or 50,
            "audit_score": request.audit_score or 5,
            "protocol_age_days": request.protocol_age_days or 365,
            "twitter_sentiment": 0.6,  # 模拟数据
            "community_activity": 0.5,
            "whale_sentiment": 0.7,
            "trend_strength": 0.65,
            "volume_pattern": 0.55,
            "liquidity_depth": 0.7,
            "impermanent_loss_risk": 0.2,
            "volatility": 0.3,
            "market_correlation": 0.4,
            "liquidity_ratio": 0.8,
            "concentration_ratio": 0.2
        }
        
        # 获取控制器并执行分析
        controller = get_controller()
        result = await controller.analyze_opportunity(analysis_data)
        
        if result["success"]:
            logger.info(f"分析完成: {request.symbol}")
            return AnalyzeOpportunityResponse(**result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "分析失败"))
            
    except Exception as e:
        logger.error(f"分析机会失败: {e}")
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")

@router.get("/signals", response_model=TradingSignalsResponse)
async def get_trading_signals():
    """
    获取实时交易信号
    
    基于多代理分析生成当前市场的交易信号和建议
    """
    try:
        logger.info("获取交易信号")
        
        controller = get_controller()
        signals = await controller.get_trading_signals()
        
        return TradingSignalsResponse(
            signals=signals,
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"获取交易信号失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取信号失败: {str(e)}")

@router.post("/optimize-portfolio", response_model=PortfolioOptimizationResponse)
async def optimize_portfolio(request: PortfolioOptimizationRequest):
    """
    优化投资组合
    
    使用多代理框架对现有投资组合进行优化，考虑：
    - 风险分散
    - 收益最大化
    - 流动性管理
    - 再平衡建议
    """
    try:
        logger.info(f"开始优化投资组合: {request.portfolio_id}")
        
        # 这里可以集成实际的组合优化逻辑
        # 暂时返回模拟结果
        
        current_portfolio = {
            "total_value": sum(pos.get("value_usd", 0) for pos in request.current_positions),
            "positions": request.current_positions,
            "risk_metrics": {
                "total_risk": 0.35,
                "concentration_risk": 0.25,
                "liquidity_risk": 0.15
            }
        }
        
        # 模拟优化结果
        recommended_allocation = {}
        execution_plan = []
        
        for i, position in enumerate(request.current_positions):
            symbol = position.get("symbol", f"Asset_{i}")
            current_weight = position.get("weight", 0.1)
            
            # 基于风险承受能力调整权重
            if request.risk_tolerance == "conservative":
                recommended_weight = current_weight * 0.8
            elif request.risk_tolerance == "aggressive":
                recommended_weight = current_weight * 1.2
            else:  # moderate
                recommended_weight = current_weight
            
            recommended_allocation[symbol] = recommended_weight
            
            if abs(recommended_weight - current_weight) > 0.01:  # 1% 阈值
                execution_plan.append({
                    "action": "REBALANCE",
                    "asset": symbol,
                    "current_weight": current_weight,
                    "target_weight": recommended_weight,
                    "amount_usd": abs(recommended_weight - current_weight) * current_portfolio["total_value"]
                })
        
        risk_assessment = {
            "overall_risk_score": 0.25,
            "risk_breakdown": {
                "market_risk": 0.20,
                "liquidity_risk": 0.15,
                "concentration_risk": 0.20,
                "smart_contract_risk": 0.10
            },
            "acceptable": True,
            "recommendations": ["建议增加稳定币配置", "考虑添加对冲策略"]
        }
        
        expected_performance = {
            "expected_return": 0.15,  # 15%
            "expected_volatility": 0.25,  # 25%
            "sharpe_ratio": 0.6,
            "max_drawdown": 0.20  # 20%
        }
        
        return PortfolioOptimizationResponse(
            success=True,
            current_portfolio=current_portfolio,
            recommended_allocation=recommended_allocation,
            risk_assessment=risk_assessment,
            optimization_details={
                "optimization_method": "mean_variance",
                "constraints_applied": ["risk_tolerance", "liquidity_requirements"],
                "objective_function": "maximize_sharpe_ratio"
            },
            execution_plan=execution_plan,
            expected_performance=expected_performance,
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"组合优化失败: {e}")
        raise HTTPException(status_code=500, detail=f"优化失败: {str(e)}")

@router.get("/status", response_model=AgentStatusResponse)
async def get_agent_status():
    """
    获取代理状态
    
    返回所有代理的当前状态、性能指标和系统健康状况
    """
    try:
        logger.info("获取代理状态")
        
        # 模拟代理状态
        agents = [
            {
                "name": "fundamental_analyst",
                "status": "active",
                "last_analysis": datetime.now().isoformat(),
                "performance_metrics": {
                    "accuracy": 0.72,
                    "response_time_avg": 2.3,
                    "analyses_count": 156
                }
            },
            {
                "name": "sentiment_analyst",
                "status": "active",
                "last_analysis": datetime.now().isoformat(),
                "performance_metrics": {
                    "accuracy": 0.68,
                    "response_time_avg": 1.8,
                    "analyses_count": 189
                }
            },
            {
                "name": "technical_analyst",
                "status": "active",
                "last_analysis": datetime.now().isoformat(),
                "performance_metrics": {
                    "accuracy": 0.75,
                    "response_time_avg": 1.5,
                    "analyses_count": 203
                }
            },
            {
                "name": "trader_agent",
                "status": "active",
                "last_decision": datetime.now().isoformat(),
                "performance_metrics": {
                    "win_rate": 0.64,
                    "avg_return": 0.12,
                    "decisions_count": 89
                }
            },
            {
                "name": "risk_manager",
                "status": "active",
                "last_assessment": datetime.now().isoformat(),
                "performance_metrics": {
                    "risk_prevention_rate": 0.83,
                    "false_positive_rate": 0.15,
                    "assessments_count": 245
                }
            }
        ]
        
        return AgentStatusResponse(
            agents=agents,
            system_status="healthy",
            last_update=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"获取代理状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取状态失败: {str(e)}")

@router.post("/backtest")
async def run_backtest(
    strategy_config: Dict[str, Any],
    background_tasks: BackgroundTasks
):
    """
    运行回测
    
    使用历史数据测试 TradingAgents 策略的表现
    """
    try:
        logger.info(f"开始回测: {strategy_config.get('name', 'Unknown')}")
        
        # 添加到后台任务
        background_tasks.add_task(_run_backtest_task, strategy_config)
        
        return {
            "success": True,
            "message": "回测任务已启动",
            "task_id": f"backtest_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "estimated_duration": "5-10 minutes"
        }
        
    except Exception as e:
        logger.error(f"启动回测失败: {e}")
        raise HTTPException(status_code=500, detail=f"启动回测失败: {str(e)}")

async def _run_backtest_task(strategy_config: Dict[str, Any]):
    """后台回测任务"""
    try:
        logger.info(f"执行后台回测: {strategy_config.get('name', 'Unknown')}")
        
        # 这里可以集成实际的回测逻辑
        # 暂时只是模拟
        await asyncio.sleep(5)  # 模拟处理时间
        
        logger.info("回测完成")
        
    except Exception as e:
        logger.error(f"后台回测失败: {e}")

# 健康检查端点
@router.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "trading-agents"
    }

# 错误处理 - 注意：APIRouter 不支持 exception_handler，需在 main app 中处理或使用 dependencies
# 此处移除 router.exception_handler 以修复 AttributeError
