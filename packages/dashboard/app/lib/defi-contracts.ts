/**
 * 常用 DeFi 协议合约地址配置
 * 用于一键批量授权功能
 */

export interface ProtocolContract {
  name: string;
  protocol: string;
  address: string;
  chainId: number;
  chainName: string;
  description: string;
}

export interface TokenContract {
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  decimals: number;
}

// ============================================
// 主流稳定币地址（多链）
// ============================================
export const STABLECOINS: TokenContract[] = [
  // Ethereum
  { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", chainId: 1, decimals: 6 },
  { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", chainId: 1, decimals: 6 },
  { symbol: "DAI", name: "Dai Stablecoin", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", chainId: 1, decimals: 18 },
  { symbol: "USDE", name: "Ethena USD", address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", chainId: 1, decimals: 18 },
  
  // Arbitrum
  { symbol: "USDT", name: "Tether USD", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", chainId: 42161, decimals: 6 },
  { symbol: "USDC", name: "USD Coin", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", chainId: 42161, decimals: 6 },
  { symbol: "DAI", name: "Dai Stablecoin", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", chainId: 42161, decimals: 18 },
  
  // Base
  { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chainId: 8453, decimals: 6 },
  { symbol: "USDbC", name: "USD Base Coin", address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", chainId: 8453, decimals: 6 },
  
  // Polygon
  { symbol: "USDT", name: "Tether USD", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", chainId: 137, decimals: 6 },
  { symbol: "USDC", name: "USD Coin", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", chainId: 137, decimals: 6 },
  
  // BSC
  { symbol: "USDT", name: "Tether USD", address: "0x55d398326f99059fF775485246999027B3197955", chainId: 56, decimals: 18 },
  { symbol: "USDC", name: "USD Coin", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", chainId: 56, decimals: 18 },
];

// ============================================
// 常用 DeFi 协议路由/合约地址
// ============================================
export const DEFI_PROTOCOLS: ProtocolContract[] = [
  // ---- Uniswap ----
  { name: "Uniswap V3 Router", protocol: "uniswap-v3", address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", chainId: 1, chainName: "Ethereum", description: "Uniswap V3 交易路由" },
  { name: "Uniswap V3 Router", protocol: "uniswap-v3", address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", chainId: 42161, chainName: "Arbitrum", description: "Uniswap V3 交易路由" },
  { name: "Uniswap V3 Router", protocol: "uniswap-v3", address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", chainId: 137, chainName: "Polygon", description: "Uniswap V3 交易路由" },
  { name: "Uniswap V3 Router", protocol: "uniswap-v3", address: "0x2626664c2603336E57B271c5C0b26F421741e481", chainId: 8453, chainName: "Base", description: "Uniswap V3 交易路由" },
  { name: "Uniswap Universal Router", protocol: "uniswap", address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", chainId: 1, chainName: "Ethereum", description: "Uniswap 通用路由" },
  { name: "Uniswap Universal Router", protocol: "uniswap", address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", chainId: 42161, chainName: "Arbitrum", description: "Uniswap 通用路由" },
  
  // ---- Curve ----
  { name: "Curve Router", protocol: "curve", address: "0x99a58482BD75cbab83b27EC03CA68fF489b5788f", chainId: 1, chainName: "Ethereum", description: "Curve 交易路由" },
  { name: "Curve 3pool", protocol: "curve", address: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7", chainId: 1, chainName: "Ethereum", description: "Curve 3pool (USDT/USDC/DAI)" },
  { name: "Curve Router", protocol: "curve", address: "0x4c2Af2Df2a7E567B5155879720619EA06C5BB15D", chainId: 42161, chainName: "Arbitrum", description: "Curve 交易路由" },
  
  // ---- Aave ----
  { name: "Aave V3 Pool", protocol: "aave-v3", address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", chainId: 1, chainName: "Ethereum", description: "Aave V3 借贷池" },
  { name: "Aave V3 Pool", protocol: "aave-v3", address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", chainId: 42161, chainName: "Arbitrum", description: "Aave V3 借贷池" },
  { name: "Aave V3 Pool", protocol: "aave-v3", address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", chainId: 137, chainName: "Polygon", description: "Aave V3 借贷池" },
  { name: "Aave V3 Pool", protocol: "aave-v3", address: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", chainId: 8453, chainName: "Base", description: "Aave V3 借贷池" },
  
  // ---- Compound ----
  { name: "Compound V3 USDC", protocol: "compound-v3", address: "0xc3d688B66703497DAA19211EEdff47f25384cdc3", chainId: 1, chainName: "Ethereum", description: "Compound V3 USDC 市场" },
  { name: "Compound V3 USDC", protocol: "compound-v3", address: "0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA", chainId: 42161, chainName: "Arbitrum", description: "Compound V3 USDC 市场" },
  { name: "Compound V3 USDC", protocol: "compound-v3", address: "0xb125E6687d4313864e53df431d5425969c15Eb2F", chainId: 8453, chainName: "Base", description: "Compound V3 USDC 市场" },
  
  // ---- 1inch ----
  { name: "1inch Router V5", protocol: "1inch", address: "0x1111111254EEB25477B68fb85Ed929f73A960582", chainId: 1, chainName: "Ethereum", description: "1inch 聚合器路由" },
  { name: "1inch Router V5", protocol: "1inch", address: "0x1111111254EEB25477B68fb85Ed929f73A960582", chainId: 42161, chainName: "Arbitrum", description: "1inch 聚合器路由" },
  { name: "1inch Router V5", protocol: "1inch", address: "0x1111111254EEB25477B68fb85Ed929f73A960582", chainId: 137, chainName: "Polygon", description: "1inch 聚合器路由" },
  { name: "1inch Router V5", protocol: "1inch", address: "0x1111111254EEB25477B68fb85Ed929f73A960582", chainId: 56, chainName: "BSC", description: "1inch 聚合器路由" },
  
  // ---- GMX ----
  { name: "GMX Router", protocol: "gmx", address: "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064", chainId: 42161, chainName: "Arbitrum", description: "GMX 交易路由" },
  { name: "GMX Vault", protocol: "gmx", address: "0x489ee077994B6658eAfA855C308275EAd8097C4A", chainId: 42161, chainName: "Arbitrum", description: "GMX 金库" },
  
  // ---- Lido ----
  { name: "Lido stETH", protocol: "lido", address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", chainId: 1, chainName: "Ethereum", description: "Lido 流动质押" },
  { name: "Lido wstETH", protocol: "lido", address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", chainId: 1, chainName: "Ethereum", description: "Wrapped stETH" },
  
  // ---- Pendle ----
  { name: "Pendle Router V3", protocol: "pendle", address: "0x00000000005BBB0EF59571E58418F9a4357b68A0", chainId: 1, chainName: "Ethereum", description: "Pendle 收益交易路由" },
  { name: "Pendle Router V3", protocol: "pendle", address: "0x00000000005BBB0EF59571E58418F9a4357b68A0", chainId: 42161, chainName: "Arbitrum", description: "Pendle 收益交易路由" },
  
  // ---- Convex ----
  { name: "Convex Booster", protocol: "convex", address: "0xF403C135812408BFbE8713b5A23a04b3D48AAE31", chainId: 1, chainName: "Ethereum", description: "Convex 收益增强" },
  
  // ---- Yearn ----
  { name: "Yearn Router", protocol: "yearn", address: "0x1112dbCF805682e828606f74AB717abf4b4FD8DE", chainId: 1, chainName: "Ethereum", description: "Yearn 金库路由" },
  
  // ---- Balancer ----
  { name: "Balancer Vault", protocol: "balancer", address: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", chainId: 1, chainName: "Ethereum", description: "Balancer V2 金库" },
  { name: "Balancer Vault", protocol: "balancer", address: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", chainId: 42161, chainName: "Arbitrum", description: "Balancer V2 金库" },
  { name: "Balancer Vault", protocol: "balancer", address: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", chainId: 137, chainName: "Polygon", description: "Balancer V2 金库" },
  
  // ---- SushiSwap ----
  { name: "SushiSwap Router", protocol: "sushiswap", address: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F", chainId: 1, chainName: "Ethereum", description: "SushiSwap 交易路由" },
  { name: "SushiSwap Router", protocol: "sushiswap", address: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", chainId: 42161, chainName: "Arbitrum", description: "SushiSwap 交易路由" },
  
  // ---- PancakeSwap ----
  { name: "PancakeSwap Router V3", protocol: "pancakeswap", address: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", chainId: 56, chainName: "BSC", description: "PancakeSwap V3 路由" },
  { name: "PancakeSwap Router V2", protocol: "pancakeswap", address: "0x10ED43C718714eb63d5aA57B78B54704E256024E", chainId: 56, chainName: "BSC", description: "PancakeSwap V2 路由" },
  
  // ---- Aerodrome (Base) ----
  { name: "Aerodrome Router", protocol: "aerodrome", address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", chainId: 8453, chainName: "Base", description: "Aerodrome DEX 路由" },
  
  // ---- Velodrome (Optimism) ----
  { name: "Velodrome Router", protocol: "velodrome", address: "0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858", chainId: 10, chainName: "Optimism", description: "Velodrome DEX 路由" },
];

// 按链分组
export function getProtocolsByChain(chainId: number): ProtocolContract[] {
  return DEFI_PROTOCOLS.filter(p => p.chainId === chainId);
}

export function getStablecoinsByChain(chainId: number): TokenContract[] {
  return STABLECOINS.filter(t => t.chainId === chainId);
}

// 链 ID 到名称映射
export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BSC",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
};

// 链 ID 到 RPC 映射
export const CHAIN_RPC: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  10: "https://mainnet.optimism.io",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon-rpc.com",
  8453: "https://mainnet.base.org",
  42161: "https://arb1.arbitrum.io/rpc",
};
