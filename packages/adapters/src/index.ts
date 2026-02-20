// ============================================
// Adapters Package Entry
// ============================================

// Base interfaces
export type { IProtocolAdapter } from "./base/IProtocolAdapter.js";
export type { ILendingAdapter, LendingMarket, BorrowPosition } from "./base/ILendingAdapter.js";
export type { ILPAdapter, LPInfo } from "./base/ILPAdapter.js";
export type { IStakingAdapter, StakingInfo, StakingPosition } from "./base/IStakingAdapter.js";
export { AdapterRegistry, adapterRegistry } from "./base/AdapterRegistry.js";

// Protocol Adapters - EVM
export { UniswapV3Adapter } from "./evm/uniswap-v3/UniswapV3Adapter.js";
export { UniswapV4Adapter } from "./evm/uniswap-v4/UniswapV4Adapter.js";
export { AaveV3Adapter } from "./evm/aave-v3/AaveV3Adapter.js";
export { CurveAdapter } from "./evm/curve/CurveAdapter.js";
export { LidoAdapter } from "./evm/lido/LidoAdapter.js";
export { CompoundV3Adapter } from "./evm/compound/CompoundV3Adapter.js";
export { AerodromeV1Adapter, AerodromeSlipstreamAdapter } from "./evm/aerodrome/AerodromeAdapter.js";

// Protocol Adapters - Aptos
export { ThalaAdapter } from "./aptos/thala/ThalaAdapter.js";

// Protocol Adapters - Solana
export { RaydiumAdapter } from "./solana/raydium/RaydiumAdapter.js";
export { RaydiumAMMAdapter } from "./solana/raydium/RaydiumAMMAdapter.js";
export { MarinadeAdapter } from "./solana/marinade/MarinadeAdapter.js";

// ---- Factory: Register all adapters ----
import { Chain } from "@defi-yield/common";
import { adapterRegistry } from "./base/AdapterRegistry.js";
import { UniswapV3Adapter } from "./evm/uniswap-v3/UniswapV3Adapter.js";
import { UniswapV4Adapter } from "./evm/uniswap-v4/UniswapV4Adapter.js";
import { AaveV3Adapter } from "./evm/aave-v3/AaveV3Adapter.js";
import { CurveAdapter } from "./evm/curve/CurveAdapter.js";
import { LidoAdapter } from "./evm/lido/LidoAdapter.js";
import { CompoundV3Adapter } from "./evm/compound/CompoundV3Adapter.js";
import { AerodromeV1Adapter, AerodromeSlipstreamAdapter } from "./evm/aerodrome/AerodromeAdapter.js";
import { ThalaAdapter } from "./aptos/thala/ThalaAdapter.js";
import { RaydiumAdapter } from "./solana/raydium/RaydiumAdapter.js";
import { RaydiumAMMAdapter } from "./solana/raydium/RaydiumAMMAdapter.js";
import { MarinadeAdapter } from "./solana/marinade/MarinadeAdapter.js";

/**
 * Register all built-in protocol adapters.
 * Call this once at application startup.
 *
 * Total: 12 protocols across 3 chain types (EVM, Aptos, Solana)
 */
export function registerAllAdapters(): void {
  // Uniswap V3 on multiple EVM chains
  for (const chain of [Chain.ETHEREUM, Chain.ARBITRUM, Chain.POLYGON, Chain.OPTIMISM, Chain.BASE]) {
    adapterRegistry.register(new UniswapV3Adapter(chain));
  }

  // Uniswap V4 on multiple EVM chains
  for (const chain of [Chain.ETHEREUM, Chain.ARBITRUM, Chain.POLYGON, Chain.OPTIMISM, Chain.BASE]) {
    adapterRegistry.register(new UniswapV4Adapter(chain));
  }

  // Aave V3 on multiple EVM chains
  for (const chain of [Chain.ETHEREUM, Chain.ARBITRUM, Chain.POLYGON, Chain.OPTIMISM, Chain.BASE, Chain.AVALANCHE]) {
    adapterRegistry.register(new AaveV3Adapter(chain));
  }

  // Curve on EVM chains
  for (const chain of [Chain.ETHEREUM, Chain.ARBITRUM, Chain.POLYGON]) {
    adapterRegistry.register(new CurveAdapter(chain));
  }

  // Compound V3 on EVM chains
  for (const chain of [Chain.ETHEREUM, Chain.ARBITRUM, Chain.POLYGON, Chain.BASE]) {
    adapterRegistry.register(new CompoundV3Adapter(chain));
  }

  // Lido on Ethereum
  adapterRegistry.register(new LidoAdapter());

  // Aerodrome on Base
  adapterRegistry.register(new AerodromeV1Adapter());
  adapterRegistry.register(new AerodromeSlipstreamAdapter());

  // Thala on Aptos
  adapterRegistry.register(new ThalaAdapter());

  // Raydium on Solana (both CLMM and AMM)
  adapterRegistry.register(new RaydiumAdapter());
  adapterRegistry.register(new RaydiumAMMAdapter());

  // Marinade on Solana
  adapterRegistry.register(new MarinadeAdapter());
}
