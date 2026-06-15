import { NextRequest } from "next/server";

// Lightweight in-memory cache for IP rate-limiting (per Vercel instance)
const ipCache = new Map<string, { count: number; resetAt: number }>();

/**
 * Checks if the request was made from the same origin as the host server.
 * Returns true if referer or origin header matches the request host.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const referer = req.headers.get("referer");

  // Browser POST/DELETE requests usually populate origin or referer
  if (!origin && !referer) {
    return false;
  }

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return true;
      }
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Rate limiting guard checking client IP.
 * Defaults to 20 requests per minute per server instance.
 */
export function checkRateLimit(req: NextRequest, limit = 20, windowMs = 60000): boolean {
  const ip =
    (req as NextRequest & { ip?: string }).ip ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";
  
  const now = Date.now();
  const state = ipCache.get(ip);

  if (!state || now > state.resetAt) {
    ipCache.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }

  state.count++;
  if (state.count > limit) {
    return true;
  }
  return false;
}
