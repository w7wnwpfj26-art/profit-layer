import { loadConfig, getDbPool, getRedisConnection, closeRedis } from '@profitlayer/common';
import { runPoolScan } from './jobs/scan-pools.js';

async function quickScan() {
  console.log('🚀 启动快速池子扫描...');

  // 加载配置
  const config = loadConfig();
  console.log('配置加载完成');

  // 检查数据库连接
  try {
    const db = getDbPool();
    await db.query('SELECT 1');
    console.log('✅ 数据库连接成功');
  } catch (err) {
    console.error('❌ 数据库连接失败:', (err as Error).message);
    process.exit(1);
  }

  // 检查 Redis 连接（扫描阶段会使用，不在此关闭）
  try {
    const redis = getRedisConnection();
    await redis.ping();
    console.log('✅ Redis 连接成功');
  } catch (err) {
    console.error('❌ Redis 连接失败:', (err as Error).message);
    process.exit(1);
  }

  // 运行池子扫描
  console.log('🔍 开始扫描 DeFi 池子...');
  try {
    await runPoolScan(config.scanner.minTvlUsd, config.scanner.minAprPct);
    console.log('✅ 池子扫描完成');
  } catch (err) {
    console.error('❌ 池子扫描失败:', (err as Error).message);
    process.exit(1);
  }

  // 验证数据
  const client = getDbPool();
  const result = await client.query('SELECT COUNT(*) as cnt FROM pools');
  console.log(`📊 当前池子数量: ${(result.rows[0] as { cnt: string }).cnt}`);

  await closeRedis();
  console.log('🎉 扫描任务完成！');
}

quickScan().catch((err) => {
  console.error('💥 扫描过程出错:', err);
  process.exit(1);
});
