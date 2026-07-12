import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lifeSupabaseAdmin as supabaseAdmin } from '@/lib/lifeSupabaseAdmin';
import { requireApiAccess } from '@/lib/auth';
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards';
import fs from 'fs';
import path from 'path';

// Tüm alanlar opsiyonel (handler ?? varsayılanla dolduruyor); boş gövde → {} kabul.
const AssistantSettingsBodySchema = z
  .object({
    telegramNotifications: z.boolean(),
    desktopNotifications: z.boolean(),
    morningTime: z.string(),
    noonTime: z.string(),
    eveningTime: z.string(),
    nightTime: z.string(),
    lowEnergyOverride: z.boolean(),
    notificationTone: z.string(),
    timezone: z.string(),
  })
  .partial()
  .strict();

interface AssistantSettings {
  telegramNotifications: boolean;
  desktopNotifications: boolean;
  morningTime: string;
  noonTime: string;
  eveningTime: string;
  nightTime: string;
  lowEnergyOverride: boolean;
  notificationTone: string;
  timezone: string;
}

let inMemorySettings: AssistantSettings | null = null;

const DEFAULT_SETTINGS: AssistantSettings = {
  telegramNotifications: true,
  desktopNotifications: false,
  morningTime: "08:30",
  noonTime: "13:00",
  eveningTime: "19:30",
  nightTime: "22:30",
  lowEnergyOverride: false,
  notificationTone: "net",
  timezone: "Europe/Istanbul"
};

function getFallbackPath() {
  try {
    const tempDir = process.env.TEMP || process.env.TMP || '/tmp';
    return path.join(tempDir, 'feed_the_goat_assistant_settings.json');
  } catch {
    return null;
  }
}

function readFallback() {
  if (inMemorySettings) return inMemorySettings;
  const p = getFallbackPath();
  if (p && fs.existsSync(p)) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}

function writeFallback(settings: AssistantSettings) {
  inMemorySettings = settings;
  const p = getFallbackPath();
  if (p) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(p, JSON.stringify(settings), 'utf8');
      return true;
    } catch (e) {
      console.error('Failed to write fallback settings file:', e);
    }
  }
  return false;
}

export async function GET() {
  const access = await requireApiAccess();
  if ("response" in access) return access.response;
  try {
    // 1. Try to read from assistant_settings table
    try {
      const { data, error } = await supabaseAdmin
        .from('assistant_settings')
        .select('*')
        .eq('user_key', 'global')
        .maybeSingle();

      if (data && !error) {
        return NextResponse.json({
          telegramNotifications: data.telegram_notifications ?? true,
          desktopNotifications: data.desktop_notifications ?? false,
          morningTime: data.morning_time ?? "08:30",
          noonTime: data.noon_time ?? "13:00",
          eveningTime: data.evening_time ?? "19:30",
          nightTime: data.night_time ?? "22:30",
          lowEnergyOverride: data.low_energy_override ?? false,
          notificationTone: data.notification_tone ?? "net",
          timezone: data.timezone ?? "Europe/Istanbul"
        });
      }
    } catch (dbErr) {
      console.warn('assistant_settings table query failed, trying assistant_daily_state...', dbErr);
    }

    // 2. Try to read from daily_v2 table (legacy JSON structure)
    try {
      const { data, error } = await supabaseAdmin
        .from('daily_v2')
        .select('*')
        .eq('date', 'global_settings')
        .maybeSingle();

      if (data && data.today_plan_json && !error) {
        const parsed = typeof data.today_plan_json === 'string' 
          ? JSON.parse(data.today_plan_json) 
          : data.today_plan_json;
        return NextResponse.json({
          ...DEFAULT_SETTINGS,
          ...parsed
        });
      }
    } catch (dbErrLegacy) {
      console.warn('daily_v2 table query failed too...', dbErrLegacy);
    }

    // 3. Fallback to local server-side files or memory
    const fallback = readFallback();
    if (fallback) {
      return NextResponse.json({
        ...DEFAULT_SETTINGS,
        ...fallback
      });
    }

    // 4. Return default settings
    return NextResponse.json(DEFAULT_SETTINGS);
  } catch (error) {
    console.error('Failed to get assistant settings:', error);
    // Absolute fallback: never return a 500 error, return default settings
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req);
  if ("response" in access) return access.response;
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  let body: Partial<AssistantSettings>;
  try {
    body = await parseJsonBody(req, AssistantSettingsBodySchema);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Ensure fields are populated
  const settings = {
    telegramNotifications: body.telegramNotifications ?? true,
    desktopNotifications: body.desktopNotifications ?? false,
    morningTime: body.morningTime ?? "08:30",
    noonTime: body.noonTime ?? "13:00",
    eveningTime: body.eveningTime ?? "19:30",
    nightTime: body.nightTime ?? "22:30",
    lowEnergyOverride: body.lowEnergyOverride ?? false,
    notificationTone: body.notificationTone ?? "net",
    timezone: body.timezone ?? "Europe/Istanbul"
  };

  let savedToDb = false;
  let errorMsg = '';

  // 1. Try to upsert into assistant_settings table
  try {
    const dbData = {
      user_key: 'global',
      telegram_notifications: settings.telegramNotifications,
      desktop_notifications: settings.desktopNotifications,
      morning_time: settings.morningTime,
      noon_time: settings.noonTime,
      evening_time: settings.eveningTime,
      night_time: settings.nightTime,
      low_energy_override: settings.lowEnergyOverride,
      notification_tone: settings.notificationTone,
      timezone: settings.timezone,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin
      .from('assistant_settings')
      .upsert(dbData, { onConflict: 'user_key' });

    if (!error) {
      savedToDb = true;
    } else {
      errorMsg = error.message;
      console.warn('Upsert to assistant_settings failed:', error);
    }
  } catch (dbErr) {
    errorMsg = String(dbErr);
    console.warn('DB upsert to assistant_settings failed, falling back to daily_v2...', dbErr);
  }

  // 2. Try to fallback to daily_v2
  if (!savedToDb) {
    try {
      const { error } = await supabaseAdmin
        .from('daily_v2')
        .upsert({
          date: 'global_settings',
          today_plan_json: settings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'date' });

      if (!error) {
        savedToDb = true;
      } else {
        console.warn('Upsert to assistant_daily_state failed:', error);
      }
    } catch (dbErrLegacy) {
      console.warn('DB upsert to assistant_daily_state failed too...', dbErrLegacy);
    }
  }

  // 3. Fallback to local server-side files or memory
  const savedToLocal = writeFallback(settings);

  return NextResponse.json({
    success: true,
    savedToDb,
    savedToLocal,
    isFallback: !savedToDb,
    errorMessage: savedToDb ? undefined : (errorMsg || 'Database tables not available')
  });
}
