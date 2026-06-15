import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateAction } from "@/lib/commandCenter/actions";
import { getIstanbulDateAndDay } from "@/lib/assistant/timezone";
import { isSameOrigin, checkRateLimit } from "@/lib/commandCenter/security";
import { requireApiAccess } from "@/lib/auth";

const BodySchema = z.object({
  key: z.enum(["agency_sales", "news_read", "xagent_approve"]),
  state: z.enum(["done", "skipped"]),
});

export async function POST(req: NextRequest) {
  // Oturum auth (giriş kapısı) — gerçek kimlik doğrulama.
  const access = await requireApiAccess(req);
  if ("response" in access) return access.response;
  // Allowed origin check (same-origin only) — CSRF
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }

  // Rate-limiting guard
  if (checkRateLimit(req, 20)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "key ve state gerekli" }, { status: 400 });
    }
    const { todayStr } = getIstanbulDateAndDay();
    await updateAction(todayStr, parsed.data.key, parsed.data.state);
    return NextResponse.json({ ok: true, date: todayStr, key: parsed.data.key, state: parsed.data.state });
  } catch (err) {
    console.error("[command-center/action]", err);
    return NextResponse.json({ error: "İşlem başarısız" }, { status: 500 });
  }
}
