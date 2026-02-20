// ============================================
// Wallet Manager - Multi-chain & Multi-type
// ============================================

import { 
  createLogger, 
  Chain, 
  ChainType, 
  CHAIN_TYPE_MAP,
  loadConfig 
} from "@defi-yield/common";
import { KeyVault } from "./KeyVault.js";
import { createWalletClient, http, type WalletClient, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, arbitrum, polygon, bsc, base, optimism, avalanche } from "viem/chains";
import { Aptos, AptosConfig, Network, Account as AptosAccount, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { Keypair, Connection } from "@solana/web3.js";
import bs58 from "bs58";

const logger = createLogger("executor:wallet");

export class WalletManager {
  private evmWallets: Map<string, { client: WalletClient; account: Account }> = new Map();
  private aptosWallet: { client: any; account: AptosAccount } | null = null;
  private solanaWallet: { connection: any; keypair: Keypair } | null = null;
  private keyVault: KeyVault | null = null;

  constructor(encryptionKey?: string) {
    if (encryptionKey) {
      this.keyVault = new KeyVault(encryptionKey);
    }
  }

  /**
   * 直接加载 EVM 钱包（从私钥）
   */
  loadEvmWallet(privateKey: string): void {
    const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(key as `0x${string}`);
    this.setupEvmClient(account);
    logger.info(`Loaded EVM Hot Wallet: ${account.address}`);
  }

  /**
   * 直接加载 Aptos 钱包（从私钥）
   */
  loadAptosWallet(privateKey: string): void {
    try {
      const pk = new Ed25519PrivateKey(privateKey);
      const account = AptosAccount.fromPrivateKey({ privateKey: pk });
      const aptosRpc = process.env.APTOS_RPC_URL || "https://fullnode.mainnet.aptoslabs.com/v1";
      const aptosClient = new Aptos(new AptosConfig({
        network: Network.MAINNET,
        fullnode: aptosRpc,
      }));
      this.aptosWallet = { client: aptosClient, account };
      logger.info(`Loaded Aptos Hot Wallet: ${account.accountAddress}`);
    } catch (err) {
      logger.error("Failed to load Aptos wallet", { error: (err as Error).message });
    }
  }

  /**
   * 直接加载 Solana 钱包（从私钥）
   */
  loadSolanaWallet(privateKey: string): void {
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
      const solanaRpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(solanaRpc, "confirmed");
      this.solanaWallet = { connection, keypair };
      logger.info(`Loaded Solana Hot Wallet: ${keypair.publicKey.toBase58()}`);
    } catch (err) {
      logger.error("Failed to load Solana wallet", { error: (err as Error).message });
    }
  }

  /**
   * 从 KeyVault 加载所有钱包
   */
  async loadWallets(): Promise<void> {
    if (!this.keyVault) {
      logger.warn("KeyVault not initialized, skipping loadWallets");
      return;
    }
    
    // 1. 加载 EVM 钱包
    const evmKey = await this.keyVault.getSecret("EXECUTOR_EVM_PRIVATE_KEY");
    if (evmKey) {
      this.loadEvmWallet(evmKey);
    }

    // 2. 加载 Aptos 钱包
    const aptosKey = await this.keyVault.getSecret("EXECUTOR_APTOS_PRIVATE_KEY");
    if (aptosKey) {
      this.loadAptosWallet(aptosKey);
    }

    // 3. 加载 Solana 钱包
    const solKey = await this.keyVault.getSecret("EXECUTOR_SOLANA_PRIVATE_KEY");
    if (solKey) {
      this.loadSolanaWallet(solKey);
    }
  }

  /**
   * 列出所有已加载的钱包
   */
  listWallets(): Array<{ chain: string; address: string }> {
    const wallets: Array<{ chain: string; address: string }> = [];
    
    // EVM 钱包
    for (const [chainName, wallet] of this.evmWallets) {
      wallets.push({ chain: chainName, address: wallet.account.address });
    }
    
    // Aptos 钱包
    if (this.aptosWallet) {
      wallets.push({ chain: "aptos", address: this.aptosWallet.account.accountAddress.toString() });
    }
    
    // Solana 钱包
    if (this.solanaWallet) {
      wallets.push({ chain: "solana", address: this.solanaWallet.keypair.publicKey.toBase58() });
    }
    
    return wallets;
  }

  private setupEvmClient(account: Account) {
    // Map Chain enum → viem chain object
    const CHAIN_MAP: Record<string, Parameters<typeof createWalletClient>[0]["chain"]> = {
      [Chain.ETHEREUM]: mainnet,
      [Chain.ARBITRUM]: arbitrum,
      [Chain.POLYGON]: polygon,
      [Chain.BSC]: bsc,
      [Chain.BASE]: base,
      [Chain.OPTIMISM]: optimism,
      [Chain.AVALANCHE]: avalanche,
    };

    for (const [chainEnum, viemChain] of Object.entries(CHAIN_MAP)) {
      const client = createWalletClient({
        account,
        chain: viemChain,
        transport: http(),
      });
      this.evmWallets.set(chainEnum, { client, account });
    }
  }

  getAddress(chain: Chain): string | null {
    const type = CHAIN_TYPE_MAP[chain];
    if (type === ChainType.EVM) return this.evmWallets.get(chain)?.account.address || null;
    if (type === ChainType.APTOS) return this.aptosWallet?.account.accountAddress.toString() || null;
    if (type === ChainType.SOLANA) return this.solanaWallet?.keypair.publicKey.toBase58() || null;
    return null;
  }

  getEvmClient(chain: string) { return this.evmWallets.get(chain); }
  getAptosClient() { return this.aptosWallet; }
  getSolanaClient() { return this.solanaWallet; }
}
