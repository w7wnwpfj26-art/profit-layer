import { describe, it, expect } from "vitest";
import { computeHealthScore, type PoolHealthInput } from "../utils/healthScore.js";

describe("computeHealthScore", () => {
  it("returns max score for ideal pool", () => {
    const input: PoolHealthInput = {
      tvlUsd: 50_000_000,
      volume24hUsd: 100_000_000,
      metadata: { stablecoin: true, ilRisk: "no", sigma: 2, outlier: false },
    };
    const score = computeHealthScore(input);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns low score for risky pool", () => {
    const input: PoolHealthInput = {
      tvlUsd: 5_000,
      volume24hUsd: 0,
      metadata: { stablecoin: false, ilRisk: "yes", sigma: 80, outlier: true },
    };
    const score = computeHealthScore(input);
    expect(score).toBeLessThanOrEqual(20);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("penalizes outlier pools", () => {
    const base: PoolHealthInput = {
      tvlUsd: 1_000_000,
      volume24hUsd: 500_000,
      metadata: { outlier: false },
    };
    const outlier: PoolHealthInput = { ...base, metadata: { outlier: true } };
    expect(computeHealthScore(base)).toBeGreaterThan(computeHealthScore(outlier));
  });

  it("rewards stablecoin pools", () => {
    const stable: PoolHealthInput = {
      tvlUsd: 1_000_000,
      volume24hUsd: 500_000,
      metadata: { stablecoin: true, ilRisk: "no" },
    };
    const volatile: PoolHealthInput = {
      tvlUsd: 1_000_000,
      volume24hUsd: 500_000,
      metadata: { stablecoin: false, ilRisk: "yes" },
    };
    expect(computeHealthScore(stable)).toBeGreaterThan(computeHealthScore(volatile));
  });

  it("scores TVL tiers correctly", () => {
    const small = computeHealthScore({ tvlUsd: 1_000, volume24hUsd: 0 });
    const medium = computeHealthScore({ tvlUsd: 500_000, volume24hUsd: 0 });
    const large = computeHealthScore({ tvlUsd: 50_000_000, volume24hUsd: 0 });
    expect(large).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(small);
  });

  it("handles missing metadata gracefully", () => {
    const score = computeHealthScore({ tvlUsd: 1_000_000, volume24hUsd: 100_000 });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("never returns below 0 or above 100", () => {
    const extreme: PoolHealthInput = {
      tvlUsd: 0,
      volume24hUsd: 0,
      metadata: { outlier: true, sigma: 999 },
    };
    const score = computeHealthScore(extreme);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
