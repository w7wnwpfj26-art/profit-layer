"""
TradingAgents 初始化模块
"""

from .core import (
    TradingAgentsController,
    BaseAnalyst,
    FundamentalAnalyst,
    SentimentAnalyst,
    TechnicalAnalyst,
    ResearchTeam,
    TraderAgent,
    RiskManagementTeam,
    # 数据模型
    AnalysisReport,
    ResearchReport,
    TradingDecision,
    RiskAssessment,
    PortfolioOptimization
)

from .api import router as trading_agents_router

__all__ = [
    # 核心类
    'TradingAgentsController',
    'BaseAnalyst',
    'FundamentalAnalyst',
    'SentimentAnalyst',
    'TechnicalAnalyst',
    'ResearchTeam',
    'TraderAgent',
    'RiskManagementTeam',
    
    # 数据模型
    'AnalysisReport',
    'ResearchReport',
    'TradingDecision',
    'RiskAssessment',
    'PortfolioOptimization',
    
    # API 路由
    'trading_agents_router'
]

__version__ = "1.0.0"