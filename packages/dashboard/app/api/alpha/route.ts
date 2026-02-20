import { NextResponse } from "next/server";

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${AI_ENGINE_URL}/alpha`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return NextResponse.json({ signals: [], count: 0 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ signals: [], count: 0 });
  }
}
