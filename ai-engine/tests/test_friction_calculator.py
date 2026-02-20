"""Tests for FrictionCalculator."""

import pytest
from src.models.friction_calculator import FrictionCalculator, OperationType


@pytest.fixture
def calc():
    return FrictionCalculator()


class TestFrictionCalculator:
    def test_gas_cost_ethereum_higher_than_l2(self, calc):
        """Ethereum gas should be significantly more expensive than L2s."""
        eth_fb = calc.calculate_friction(OperationType.SWAP, "ethereum", "uniswap-v3", 10_000)
        arb_fb = calc.calculate_friction(OperationType.SWAP, "arbitrum", "uniswap-v3", 10_000)
        assert eth_fb.gas_cost_usd > arb_fb.gas_cost_usd * 5

    def test_slippage_increases_with_size(self, calc):
        """Larger trades should have higher slippage."""
        small = calc.calculate_friction(
            OperationType.SWAP, "ethereum", "uniswap-v3", 1_000, pool_tvl_usd=10_000_000,
        )
        large = calc.calculate_friction(
            OperationType.SWAP, "ethereum", "uniswap-v3", 100_000, pool_tvl_usd=10_000_000,
        )
        assert large.slippage_usd > small.slippage_usd

    def test_slippage_decreases_with_tvl(self, calc):
        """Higher TVL pools should have lower slippage."""
        low_tvl = calc.calculate_friction(
            OperationType.SWAP, "ethereum", "uniswap-v3", 10_000, pool_tvl_usd=100_000,
        )
        high_tvl = calc.calculate_friction(
            OperationType.SWAP, "ethereum", "uniswap-v3", 10_000, pool_tvl_usd=100_000_000,
        )
        assert high_tvl.slippage_usd < low_tvl.slippage_usd

    def test_net_apr_less_than_gross(self, calc):
        """Net APR should always be less than gross APR."""
        result = calc.net_yield_after_friction(
            pool_id="test-pool",
            chain="ethereum",
            protocol="uniswap-v3",
            gross_apr_pct=20.0,
            position_usd=10_000,
            pool_tvl_usd=1_000_000,
        )
        assert result.net_apr_pct < 20.0
        assert result.net_apr_pct > 0

    def test_minimum_profitable_amount(self, calc):
        """Should calculate minimum amount where yield > costs."""
        min_amount = calc.minimum_profitable_amount(
            chain="ethereum",
            protocol="uniswap-v3",
            apr_pct=10.0,
            holding_days=30,
        )
        assert min_amount > 0
        assert min_amount < 1_000_000  # Sanity check

    def test_optimal_compound_frequency(self, calc):
        """Should find optimal compound frequency."""
        result = calc.optimal_compound_frequency(
            pool_id="test-pool",
            position_value_usd=10_000,
            apr_pct=30.0,
            chain="arbitrum",
        )
        assert result.compounds_per_year >= 0
        assert result.is_worth_compounding or result.compounds_per_year == 0
        if result.is_worth_compounding:
            assert result.compounds_per_year <= 8760
            assert result.net_benefit_usd > 0


class TestRiskScorer:
    def test_import(self):
        from src.models.risk_scorer import RiskScorer, RiskLevel
        scorer = RiskScorer()
        result = scorer.assess(
            pool_id="test",
            tvl_usd=1_000_000,
            apr_total=10,
            apr_base=7,
            apr_reward=3,
            il_risk="no",
            exposure="single",
            stablecoin=True,
        )
        assert 0 <= result.overall_score <= 100
        assert result.risk_level in [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]
