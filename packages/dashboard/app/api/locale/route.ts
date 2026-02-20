import { NextResponse } from "next/server";

const LOCALE_COOKIE = "locale";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locale = body.locale === "en" ? "en" : "zh-CN";
  const res = NextResponse.json({ ok: true, locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  });
  return res;
}
