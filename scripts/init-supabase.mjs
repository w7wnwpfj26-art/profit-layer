import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 数据库连接配置（从环境变量读取）
const client = new pg.Client({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'defi_yield',
  user: process.env.POSTGRES_USER || 'defi',
  password: process.env.POSTGRES_PASSWORD || 'change_me_in_production',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function main() {
  console.log('Connecting to Supabase...');
  
  try {
    await client.connect();
    console.log('✓ Connected to Supabase');
    
    // Read SQL file
    const sqlPath = join(__dirname, '../infra/postgres/init-supabase.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    console.log(`✓ Read SQL file (${sql.length} chars)`);
    
    // Execute SQL
    console.log('Executing SQL...');
    await client.query(sql);
    console.log('✓ SQL executed successfully!');
    
    // Verify tables
    const result = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    console.log('\n✓ Created tables:');
    result.rows.forEach(row => console.log(`  - ${row.tablename}`));
    
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
