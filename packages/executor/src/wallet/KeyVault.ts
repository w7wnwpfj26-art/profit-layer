// ============================================
// Secure Key Storage
// ============================================

import { createLogger } from "@profitlayer/common";
import crypto from "node:crypto";

const logger = createLogger("executor:keyvault");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts and decrypts private keys using AES-256-GCM.
 * Keys are never stored in plaintext.
 */
export class KeyVault {
  private encryptionKey: Buffer;
  private decryptedKeys = new Map<string, string>();

  constructor(encryptionKeyHex?: string) {
    const keyStr = encryptionKeyHex || process.env.WALLET_ENCRYPTION_KEY || "";
    if (keyStr.length < 32) {
      throw new Error("WALLET_ENCRYPTION_KEY must be at least 32 characters");
    }
    // Derive a proper 256-bit key
    this.encryptionKey = crypto
      .createHash("sha256")
      .update(keyStr)
      .digest();

    logger.info("KeyVault initialized");
  }

  /** Encrypt a private key for storage */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:ciphertext
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /** Decrypt a stored key */
  decrypt(encryptedStr: string): string {
    const [ivHex, authTagHex, ciphertext] = encryptedStr.split(":");
    if (!ivHex || !authTagHex || !ciphertext) {
      throw new Error("Invalid encrypted key format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /** Store a key in memory (decrypted, for runtime use) */
  setKey(chainId: string, key: string): void {
    this.decryptedKeys.set(chainId, key);
    logger.info(`Key loaded for chain: ${chainId}`);
  }

  /** Get a decrypted key */
  getKey(chainId: string): string | undefined {
    return this.decryptedKeys.get(chainId);
  }

  /** Get secret from environment variable */
  async getSecret(envName: string): Promise<string | null> {
    const value = process.env[envName];
    if (!value) return null;
    return value;
  }

  /** Clear all keys from memory */
  clearAll(): void {
    this.decryptedKeys.clear();
    logger.info("All keys cleared from memory");
  }
}
