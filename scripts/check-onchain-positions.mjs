#!/usr/bin/env node
import pg from "pg";
import { createPublicClient, http, formatUnits } from "viem";
import { arbitrum, base } from "viem/chains";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "defi_yield",
  user: process.env.POSTGRES_USER || "defi",
  password: process.env.POSTGRES_PASSWORD || "change_me_in_production",
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const AAVE_V3_POOL_ABI = [
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserAccountData",
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const MOONWELL_COMPTROLLER_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "getAssetsIn",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
];

async function checkAavePosition(walletAddress, chain) {
  const client = createPublicClient({
    chain: chain === "arbitrum" ? arbitrum : base,
    transport: http(),
  });

  const poolAddress = chain === "arbitrum"
    ? "0x794a61358D6845594F94dc1DB02A252b5b4814aD"  // Aave V3 Pool on Arbitrum
    : "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"; // Aave V3 Pool on Base

  try {
    const data = await client.readContract({
      address: poolAddress,
      abi: AAVE_V3_POOL_ABI,
      functionName: "getUserAccountData",
      args: [walletAddress],
    });

    const totalCollateralUSD = Number(formatUnits(data[0], 8)); // Aave uses 8 decimals for USD
    return totalCollateralUSD;
  } catch (err) {
    console.error(`Error checking Aave position on ${chain}:`, err.message);
    return 0;
  }
}

async function checkMoonwellPosition(walletAddress) {
  const client = createPublicClient({
    chain: base,
    transport: http(),
  });

  const comptrollerAddress = "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C"; // Moonwell Comptroller on Base

  try {
    const markets = await client.readContract({
      address: comptrollerAddress,
      abi: MOONWELL_COMPTROLLER_ABI,
      functionName: "getAssetsIn",
      args: [walletAddress],
    });

    return markets.length > 0;
  } catch (err) {
    console.error("Error checking Moonwell position:", err.message);
    return false;
  }
}

async function main() {
  try {
    console.log("=== Checking On-Chain Positions ===\n");

    const walletAddress = "0x41f74b75de939692191f87c3e671052eaa956677";

    // Get positions from database
    const result = await pool.query(`
      SELECT p.position_id, p.pool_id, p.value_usd, p.chain_id, pl.protocol_id
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.wallet_address = $1 AND p.status = 'active'
    `, [walletAddress]);

    console.log(`Found ${result.rows.length} active positions in database:\n`);

    for (const row of result.rows) {
      console.log(`Position: ${row.position_id}`);
      console.log(`  Pool: ${row.pool_id}`);
      console.log(`  Protocol: ${row.protocol_id}`);
      console.log(`  Chain: ${row.chain_id}`);
      console.log(`  DB Value: $${row.value_usd}`);

      // Check on-chain
      if (row.protocol_id === "aave-v3") {
        const onchainValue = await checkAavePosition(walletAddress, row.chain_id);
        console.log(`  On-Chain Value: $${onchainValue.toFixed(2)}`);
        console.log(`  Status: ${onchainValue > 1 ? "✓ EXISTS ON-CHAIN" : "✗ NOT FOUND ON-CHAIN"}`);
      } else if (row.protocol_id === "moonwell") {
        const exists = await checkMoonwellPosition(walletAddress);
        console.log(`  On-Chain: ${exists ? "✓ EXISTS" : "✗ NOT FOUND"}`);
      } else if (row.protocol_id === "camelot-v3") {
        console.log(`  On-Chain: (Camelot V3 LP check not implemented)`);
      }

      console.log();
    }

    console.log("\n=== Summary ===");
    console.log("If positions show '✗ NOT FOUND ON-CHAIN', they can be safely marked as closed in the database.");
    console.log("If positions show '✓ EXISTS ON-CHAIN', you need to run the Executor service to withdraw them.");

  } catch (err) {
    console.error("Error:", err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

main();
