"""
本地/Edge LLM 支持

2026 趋势: 用本地小模型处理常规决策，只在复杂场景调用大模型
- 常规决策: Llama 3 8B / Qwen 2.5 7B (本地, 免费, 低延迟)
- 复杂分析: DeepSeek V3 / GPT-4o (云端, 付费, 高质量)

成本优化: 常规决策占 80%+, 本地处理可节省 80% API 费用
"""

import os
import json
import logging
import asyncio
from dataclasses import dataclass
from typing import Optional
from enum import Enum

import aiohttp

logger = logging.getLogger(__name__)


class ModelTier(str, Enum):
    LOCAL = "local"      # 本地模型 (vLLM / llama.cpp)
    CLOUD = "cloud"      # 云端大模型 (DeepSeek / OpenAI)


@dataclass
class LLMResponse:
    """LLM 响应"""
    content: str
    model: str
    tier: ModelTier
    tokens_used: int
    latency_ms: int
    cost_usd: float  # 估算成本


class TaskComplexity(str, Enum):
    SIMPLE = "simple"      # 简单判断: hold/compound
    MODERATE = "moderate"  # 中等: 单池进出决策
    COMPLEX = "complex"    # 复杂: 多池组合优化, 市场分析


class SmartLLMRouter:
    """
    智能 LLM 路由器

    根据任务复杂度自动选择模型:
    - SIMPLE → 本地模型
    - MODERATE → 本地模型 (优先) / 云端 (备选)
    - COMPLEX → 云端大模型 (DeepSeek)

    支持的本地模型后端:
    - vLLM (高性能)
    - llama.cpp server
    """

    def __init__(
        self,
        # 本地模型配置
        local_enabled: bool = True,
        local_url: str = "",
        local_model: str = "",
        # 云端模型配置
        cloud_api_key: str = "",
        cloud_url: str = "",
        cloud_model: str = "",
        # 路由策略
        complexity_threshold: float = 0.6,  # 复杂度阈值, 超过则用云端
    ):
        self.local_enabled = local_enabled
        self.local_url = local_url or os.getenv("LOCAL_LLM_URL", "http://localhost:11434")
        self.local_model = local_model or os.getenv("LOCAL_LLM_MODEL", "llama3:8b")
        self.cloud_api_key = cloud_api_key or os.getenv("DEEPSEEK_API_KEY", "")
        self.cloud_url = cloud_url or os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com/v1")
        self.cloud_model = cloud_model or os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        self.complexity_threshold = complexity_threshold

        # 统计
        self.stats = {"local_calls": 0, "cloud_calls": 0, "local_savings_usd": 0}

    def classify_complexity(self, prompt: str, context: dict = None) -> TaskComplexity:
        """判断任务复杂度"""
        context = context or {}

        # 简单指标
        prompt_len = len(prompt)
        has_multiple_pools = context.get("pool_count", 0) > 3
        has_positions = context.get("position_count", 0) > 0
        market_volatile = abs(context.get("btc_change_24h", 0)) > 5
        has_alpha_signals = context.get("alpha_count", 0) > 3

        complexity_score = 0

        # Prompt 长度
        if prompt_len > 3000:
            complexity_score += 0.3
        elif prompt_len > 1000:
            complexity_score += 0.15

        # 多池决策
        if has_multiple_pools:
            complexity_score += 0.2

        # 市场波动
        if market_volatile:
            complexity_score += 0.25

        # Alpha 信号多
        if has_alpha_signals:
            complexity_score += 0.15

        # 有持仓需要管理
        if has_positions:
            complexity_score += 0.1

        if complexity_score >= 0.6:
            return TaskComplexity.COMPLEX
        elif complexity_score >= 0.3:
            return TaskComplexity.MODERATE
        else:
            return TaskComplexity.SIMPLE

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        complexity: TaskComplexity | None = None,
        context: dict = None,
        force_cloud: bool = False,
    ) -> LLMResponse:
        """
        智能路由生成

        自动选择本地或云端模型
        """
        if complexity is None:
            complexity = self.classify_complexity(user_prompt, context)

        # 路由决策
        use_local = (
            self.local_enabled
            and not force_cloud
            and complexity != TaskComplexity.COMPLEX
        )

        if use_local:
            try:
                response = await self._call_local(system_prompt, user_prompt)
                self.stats["local_calls"] += 1
                # 估算节省的云端费用 (约 $0.002/1k tokens)
                self.stats["local_savings_usd"] += response.tokens_used * 0.002 / 1000
                return response
            except Exception as e:
                logger.warning(f"Local LLM failed, falling back to cloud: {e}")

        # 云端调用
        response = await self._call_cloud(system_prompt, user_prompt)
        self.stats["cloud_calls"] += 1
        return response

    async def _call_local(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        """调用本地模型 (OpenAI 兼容 API)"""
        import time
        start = time.time()

        async with aiohttp.ClientSession() as session:
            # OpenAI 兼容 API 格式
            body = {
                "model": self.local_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
            }

            url = f"{self.local_url}/v1/chat/completions"
            async with session.post(url, json=body,
                                    timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status != 200:
                    raise Exception(f"Local LLM API error: {resp.status}")
                data = await resp.json()

            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            tokens = data.get("usage", {}).get("total_tokens", len(content) // 4)
            latency = int((time.time() - start) * 1000)

            return LLMResponse(
                content=content,
                model=self.local_model,
                tier=ModelTier.LOCAL,
                tokens_used=tokens,
                latency_ms=latency,
                cost_usd=0,  # 本地免费
            )

    async def _call_cloud(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        """调用云端模型 (DeepSeek / OpenAI 兼容 API)"""
        import time
        start = time.time()

        async with aiohttp.ClientSession() as session:
            body = {
                "model": self.cloud_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 4096,
            }

            headers = {
                "Authorization": f"Bearer {self.cloud_api_key}",
                "Content-Type": "application/json",
            }

            url = f"{self.cloud_url}/chat/completions"
            async with session.post(url, json=body, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=120)) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise Exception(f"Cloud API error {resp.status}: {error_text}")
                data = await resp.json()

            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            usage = data.get("usage", {})
            tokens = usage.get("total_tokens", len(content) // 4)
            latency = int((time.time() - start) * 1000)

            # DeepSeek 价格: ~$0.14/1M input, $0.28/1M output
            cost = tokens * 0.0002 / 1000

            return LLMResponse(
                content=content,
                model=self.cloud_model,
                tier=ModelTier.CLOUD,
                tokens_used=tokens,
                latency_ms=latency,
                cost_usd=round(cost, 6),
            )

    def get_stats(self) -> dict:
        """获取路由统计"""
        total = self.stats["local_calls"] + self.stats["cloud_calls"]
        local_pct = (self.stats["local_calls"] / total * 100) if total > 0 else 0
        return {
            **self.stats,
            "total_calls": total,
            "local_pct": round(local_pct, 1),
            "estimated_savings_usd": round(self.stats["local_savings_usd"], 4),
        }

    async def health_check(self) -> dict:
        """检查本地和云端模型可用性"""
        result = {"local": False, "cloud": False}

        # 检查本地
        if self.local_enabled:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{self.local_url}/v1/models",
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as resp:
                        if resp.status == 200:
                            result["local"] = True
            except Exception:
                pass

        # 检查云端
        if self.cloud_api_key:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{self.cloud_url}/models",
                        headers={"Authorization": f"Bearer {self.cloud_api_key}"},
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as resp:
                        result["cloud"] = resp.status == 200
            except Exception:
                pass

        return result
