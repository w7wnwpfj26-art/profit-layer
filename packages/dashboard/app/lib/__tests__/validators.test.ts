import { describe, it, expect } from "vitest";
import { configValidators } from "../validators";

describe("configValidators", () => {
  describe("deepseek_api_key", () => {
    it("接受空字符串", () => {
      expect(configValidators.deepseek_api_key("")).toEqual({ valid: true, error: null });
    });
    it("拒绝无效前缀", () => {
      expect(configValidators.deepseek_api_key("invalid").valid).toBe(false);
    });
    it("拒绝过短的 key", () => {
      expect(configValidators.deepseek_api_key("sk-short").valid).toBe(false);
    });
    it("接受有效 key", () => {
      expect(configValidators.deepseek_api_key("sk-12345678901234567890").valid).toBe(true);
    });
  });

  describe("total_capital_usd", () => {
    it("拒绝负数", () => {
      expect(configValidators.total_capital_usd("-100").valid).toBe(false);
    });
    it("拒绝超大金额", () => {
      expect(configValidators.total_capital_usd("99999999").valid).toBe(false);
    });
    it("接受合理金额", () => {
      expect(configValidators.total_capital_usd("10000").valid).toBe(true);
    });
    it("拒绝非数字", () => {
      expect(configValidators.total_capital_usd("abc").valid).toBe(false);
    });
  });

  describe("stop_loss_pct", () => {
    it("拒绝超 100", () => {
      expect(configValidators.stop_loss_pct("150").valid).toBe(false);
    });
    it("拒绝负数", () => {
      expect(configValidators.stop_loss_pct("-5").valid).toBe(false);
    });
    it("接受 0-100", () => {
      expect(configValidators.stop_loss_pct("10").valid).toBe(true);
    });
  });

  describe("evm_wallet_address", () => {
    it("接受空字符串", () => {
      expect(configValidators.evm_wallet_address("").valid).toBe(true);
    });
    it("拒绝短地址", () => {
      expect(configValidators.evm_wallet_address("0x123").valid).toBe(false);
    });
    it("接受有效地址", () => {
      expect(configValidators.evm_wallet_address("0xdAC17F958D2ee523a2206206994597C13D831ec7").valid).toBe(true);
    });
  });

  describe("solana_wallet_address", () => {
    it("接受空字符串", () => {
      expect(configValidators.solana_wallet_address("").valid).toBe(true);
    });
    it("拒绝含非法字符", () => {
      expect(configValidators.solana_wallet_address("0xNotSolana").valid).toBe(false);
    });
  });
});
