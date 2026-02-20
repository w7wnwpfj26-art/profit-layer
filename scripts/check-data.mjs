import pg from 'pg';

// 从环境变量读取数据库配置
const client = new pg.Client({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'defi_yield',
  user: process.env.POSTGRES_USER || 'defi',
  password: process.env.POSTGRES_PASSWORD || 'change_me_in_production',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function scan() {
  await client.connect();
  
  console.log('🔍 正在扫描...');
  
  // 检查现有数据
  const poolCount = await client.query('SELECT COUNT(*) as cnt FROM pools');
  const posCount = await client.query('SELECT COUNT(*) as cnt FROM positions');
  
  console.log(`📊 当前数据:`);
  console.log(`   池子: ${poolCount.rows[0].cnt} 个`);
  console.log(`   持仓: ${posCount.rows[0].cnt} 个`);
  
  // 如果没有持仓，提示用户连接钱包
  if (posCount.rows[0].cnt === '0') {
    console.log('\n💡 请执行以下步骤:');
    console.log('1. 访问 http://localhost:3002/wallet');
    console.log('2. 连接 OKX 钱包');
    console.log('3. 点击"扫描余额"按钮');
    console.log('4. 等待数据同步完成');
  }
  
  await client.end();
}

scan().catch(err => {
  console.error('❌ 扫描失败:', err.message);
  process.exit(1);
});
