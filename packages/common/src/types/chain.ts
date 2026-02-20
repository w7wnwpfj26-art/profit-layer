// ============================================
// Chain & Network Types
// ============================================

export enum Chain {
  // EVM
  ETHEREUM = "ethereum",
  ARBITRUM = "arbitrum",
  BSC = "bsc",
  POLYGON = "polygon",
  BASE = "base",
  OPTIMISM = "optimism",
  AVALANCHE = "avalanche",
  // Move
  APTOS = "aptos",
  SUI = "sui",
  // Solana
  SOLANA = "solana",
}

export enum ChainType {
  EVM = "evm",
  APTOS = "aptos",
  SUI = "sui",
  SOLANA = "solana",
}

export const CHAIN_TYPE_MAP: Record<Chain, ChainType> = {
  [Chain.ETHEREUM]: ChainType.EVM,
  [Chain.ARBITRUM]: ChainType.EVM,
  [Chain.BSC]: ChainType.EVM,
  [Chain.POLYGON]: ChainType.EVM,
  [Chain.BASE]: ChainType.EVM,
  [Chain.OPTIMISM]: ChainType.EVM,
  [Chain.AVALANCHE]: ChainType.EVM,
  [Chain.APTOS]: ChainType.APTOS,
  [Chain.SUI]: ChainType.SUI,
  [Chain.SOLANA]: ChainType.SOLANA,
};

export interface ChainConfig {
  chain: Chain;
  chainType: ChainType;
  name: string;
  nativeToken: string;
  rpcUrl: string;
  explorerUrl: string;
  chainIdNumeric?: number; // EVM chain ID
}

export const EVM_CHAINS = [
  Chain.ETHEREUM,
  Chain.ARBITRUM,
  Chain.BSC,
  Chain.POLYGON,
  Chain.BASE,
  Chain.OPTIMISM,
  Chain.AVALANCHE,
] as const;

export const NON_EVM_CHAINS = [
  Chain.APTOS,
  Chain.SUI,
  Chain.SOLANA,
] as const;
