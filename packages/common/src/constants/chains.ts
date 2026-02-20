// ============================================
// Chain Configuration Constants
// ============================================

import { Chain, ChainConfig, ChainType } from "../types/chain.js";

export const CHAIN_CONFIGS: Record<Chain, ChainConfig> = {
  [Chain.ETHEREUM]: {
    chain: Chain.ETHEREUM,
    chainType: ChainType.EVM,
    name: "Ethereum",
    nativeToken: "ETH",
    rpcUrl: process.env.ETHEREUM_RPC_URL || process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
    explorerUrl: "https://etherscan.io",
    chainIdNumeric: 1,
  },
  [Chain.ARBITRUM]: {
    chain: Chain.ARBITRUM,
    chainType: ChainType.EVM,
    name: "Arbitrum One",
    nativeToken: "ETH",
    rpcUrl: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    chainIdNumeric: 42161,
  },
  [Chain.BSC]: {
    chain: Chain.BSC,
    chainType: ChainType.EVM,
    name: "BNB Smart Chain",
    nativeToken: "BNB",
    rpcUrl: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com",
    chainIdNumeric: 56,
  },
  [Chain.POLYGON]: {
    chain: Chain.POLYGON,
    chainType: ChainType.EVM,
    name: "Polygon",
    nativeToken: "POL",
    rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    explorerUrl: "https://polygonscan.com",
    chainIdNumeric: 137,
  },
  [Chain.BASE]: {
    chain: Chain.BASE,
    chainType: ChainType.EVM,
    name: "Base",
    nativeToken: "ETH",
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    chainIdNumeric: 8453,
  },
  [Chain.OPTIMISM]: {
    chain: Chain.OPTIMISM,
    chainType: ChainType.EVM,
    name: "Optimism",
    nativeToken: "ETH",
    rpcUrl: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
    chainIdNumeric: 10,
  },
  [Chain.AVALANCHE]: {
    chain: Chain.AVALANCHE,
    chainType: ChainType.EVM,
    name: "Avalanche C-Chain",
    nativeToken: "AVAX",
    rpcUrl: process.env.AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc",
    explorerUrl: "https://snowtrace.io",
    chainIdNumeric: 43114,
  },
  [Chain.APTOS]: {
    chain: Chain.APTOS,
    chainType: ChainType.APTOS,
    name: "Aptos",
    nativeToken: "APT",
    rpcUrl: process.env.APTOS_RPC_URL || "https://fullnode.mainnet.aptoslabs.com/v1",
    explorerUrl: "https://explorer.aptoslabs.com",
  },
  [Chain.SUI]: {
    chain: Chain.SUI,
    chainType: ChainType.SUI,
    name: "Sui",
    nativeToken: "SUI",
    rpcUrl: process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io",
    explorerUrl: "https://suiscan.xyz",
  },
  [Chain.SOLANA]: {
    chain: Chain.SOLANA,
    chainType: ChainType.SOLANA,
    name: "Solana",
    nativeToken: "SOL",
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    explorerUrl: "https://solscan.io",
  },
};

/**
 * MEV-Safe RPC 映射：通过私有交易池发送交易，防止三明治攻击
 * - Ethereum: Flashbots Protect
 * - BSC: bloXroute
 * - 其他链（L2）: MEV 风险极低，使用默认 RPC
 */
export const MEV_SAFE_RPC: Partial<Record<Chain, string>> = {
  [Chain.ETHEREUM]: "https://rpc.flashbots.net",
  [Chain.BSC]: "https://bsc-relay.flashbots.net",
};

/**
 * L2 链列表（Gas 便宜、MEV 风险低，不需要 Gas 调度等待）
 */
export const L2_CHAINS: Set<Chain> = new Set([
  Chain.ARBITRUM,
  Chain.BASE,
  Chain.OPTIMISM,
  Chain.POLYGON,
]);

// DefiLlama chain name mapping
export const DEFILLAMA_CHAIN_MAP: Record<string, Chain> = {
  Ethereum: Chain.ETHEREUM,
  Arbitrum: Chain.ARBITRUM,
  BSC: Chain.BSC,
  Polygon: Chain.POLYGON,
  Base: Chain.BASE,
  Optimism: Chain.OPTIMISM,
  Avalanche: Chain.AVALANCHE,
  Aptos: Chain.APTOS,
  Sui: Chain.SUI,
  Solana: Chain.SOLANA,
};
