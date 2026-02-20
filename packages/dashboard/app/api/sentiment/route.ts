import { NextResponse } from "next/server";
import http from 'http';

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

export async function GET() {
  const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://localhost:8000";
  
  try {
    const data = await httpGet(`${AI_ENGINE_URL}/sentiment`);
    return NextResponse.json(JSON.parse(data));
  } catch (err) {
    console.error('[sentiment] error:', err);
    return NextResponse.json(
      { offline: true, message: "情绪服务不可用" },
      { status: 503 }
    );
  }
}
