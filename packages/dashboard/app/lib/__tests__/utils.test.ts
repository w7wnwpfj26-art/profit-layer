import { describe, it, expect } from "vitest";
import { truncateAddress, formatUsd, formatCompact, safeDivide, formatAge } from "../utils";

describe("truncateAddress", () => {
  it("返回 '未连接' 当地址为空", () => {
    expect(truncateAddress(undefined)).toBe("未连接");
    expect(truncateAddress(null)).toBe("未连接");
    expect(truncateAddress("")).toBe("未连接");
  });
  it("截断长地址", () => {
    expect(truncateAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7")).toBe("0xdAC1...1ec7");
  });
  it("短地址原样返回", () => {
    expect(truncateAddress("0x123", 3, 3)).toBe("0x123");
  });
});

describe("formatUsd", () => {
  it("返回 '-' 当 null/undefined/NaN", () => {
    expect(formatUsd(null)).toBe("-");
    expect(formatUsd(undefined)).toBe("-");
    expect(formatUsd(NaN)).toBe("-");
  });
  it("正常格式化", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });
});

describe("formatCompact", () => {
  it("格式化十亿", () => {
    expect(formatCompact(1_500_000_000)).toBe("$1.50B");
  });
  it("格式化百万", () => {
    expect(formatCompact(3_500_000)).toBe("$3.5M");
  });
  it("格式化千", () => {
    expect(formatCompact(120_000)).toBe("$120K");
  });
  it("null 返回 '-'", () => {
    expect(formatCompact(null)).toBe("-");
  });
});

describe("safeDivide", () => {
  it("正常除法", () => {
    expect(safeDivide(10, 2)).toBe(5);
  });
  it("除零返回 fallback", () => {
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(10, 0, -1)).toBe(-1);
  });
});

describe("formatAge", () => {
  it("秒", () => {
    expect(formatAge(30)).toBe("30秒前");
  });
  it("分钟", () => {
    expect(formatAge(120)).toBe("2分钟前");
  });
  it("小时", () => {
    expect(formatAge(7200)).toBe("2小时前");
  });
  it("天", () => {
    expect(formatAge(172800)).toBe("2天前");
  });
  it("null", () => {
    expect(formatAge(null)).toBe("-");
  });
});
