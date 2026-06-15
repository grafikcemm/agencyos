import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, checkRateLimit } from "@/lib/commandCenter/security";
import { requireApiAccess } from "@/lib/auth";
import { ensureCommandPlan } from "@/lib/commandCenter/orchestration";
import { getIstanbulDateAndDay } from "@/lib/assistant/timezone";

export async function POST(req: NextRequest) {
  // Oturum auth (giriş kapısı) — gerçek kimlik doğrulama.
  const access = await requireApiAccess(req);
  if ("response" in access) return access.response;
  // Allowed origin check (same-origin only) — CSRF
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }

  // Rate-limiting guard to prevent abuse/brute force
  if (checkRateLimit(req, 10)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { todayStr } = getIstanbulDateAndDay();
    const { plan, cached } = await ensureCommandPlan(todayStr);
    return NextResponse.json({ plan, cached });
  } catch (err) {
    console.error("[command-center POST]", err);
    return NextResponse.json({ error: "İşlem başarısız" }, { status: 500 });
  }
}

// Force-refresh: cache sil ve yeniden üret
export async function DELETE(req: NextRequest) {
  // Oturum auth (giriş kapısı) — gerçek kimlik doğrulama.
  const access = await requireApiAccess(req);
  if ("response" in access) return access.response;
  // Allowed origin check (same-origin only) — CSRF
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }

  // Rate-limiting guard to prevent abuse of the deletion endpoint
  if (checkRateLimit(req, 10)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { todayStr } = getIstanbulDateAndDay();
    const { plan, cached } = await ensureCommandPlan(todayStr, { force: true });
    return NextResponse.json({ plan, cached });
  } catch (err) {
    console.error("[command-center DELETE]", err);
    return NextResponse.json({ error: "İşlem başarısız" }, { status: 500 });
  }
}
