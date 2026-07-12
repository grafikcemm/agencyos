// Telegram webhook yetkilendirme E2E'si (Faz B3) — prod build'e karşı.
//
// GÜVENLİK SINIRI: Bu testler YALNIZ reddedilen yolları sürer. Reddedilen
// yollar handler'da HER TÜRLÜ DB yazımından ÖNCE döner → LIFE DB'ye sıfır iz.
// Geçerli chat+user kombinasyonu ASLA gönderilmez (o yol gerçek LIFE DB'ye
// konuşma turu yazar — E2E'de yasak). Bot token boş → dış Telegram çağrısı
// yapısal olarak imkânsız.

import { test, expect } from '@playwright/test'
import {
  E2E_TELEGRAM_SECRET,
  E2E_TELEGRAM_CHAT_ID,
  E2E_TELEGRAM_USER_ID,
} from '../playwright.config'

const WEBHOOK = '/api/telegram'

function update(overrides: {
  chatId?: string | number
  fromId?: string | number
  text?: string
  updateId?: number
}) {
  return {
    update_id: overrides.updateId ?? 900001,
    message: {
      message_id: 1,
      text: overrides.text ?? 'merhaba',
      ...(overrides.chatId != null ? { chat: { id: overrides.chatId } } : {}),
      ...(overrides.fromId != null ? { from: { id: overrides.fromId } } : {}),
    },
  }
}

test('Telegram 1 — secret header yok → 401', async ({ request }) => {
  const res = await request.post(WEBHOOK, { data: update({ chatId: E2E_TELEGRAM_CHAT_ID }) })
  expect(res.status()).toBe(401)
})

test('Telegram 2 — yanlış secret → 401', async ({ request }) => {
  const res = await request.post(WEBHOOK, {
    headers: { 'x-telegram-bot-api-secret-token': 'yanlis-secret' },
    data: update({ chatId: E2E_TELEGRAM_CHAT_ID }),
  })
  expect(res.status()).toBe(401)
})

test('Telegram 3 — doğru secret, yanlış chat → yan etkisiz no-op', async ({ request }) => {
  const res = await request.post(WEBHOOK, {
    headers: { 'x-telegram-bot-api-secret-token': E2E_TELEGRAM_SECRET },
    data: update({ chatId: '999999', fromId: E2E_TELEGRAM_USER_ID }),
  })
  expect(res.status()).toBe(200)
  expect(await res.json()).toMatchObject({ ok: true, ignored: 'chat' })
})

test('Telegram 4 — doğru chat, yanlış user → yan etkisiz no-op', async ({ request }) => {
  const res = await request.post(WEBHOOK, {
    headers: { 'x-telegram-bot-api-secret-token': E2E_TELEGRAM_SECRET },
    data: update({ chatId: E2E_TELEGRAM_CHAT_ID, fromId: '888888' }),
  })
  expect(res.status()).toBe(200)
  expect(await res.json()).toMatchObject({ ok: true, ignored: 'user' })
})

test('Telegram 5 — from alanı eksik → fail-closed no-op', async ({ request }) => {
  const res = await request.post(WEBHOOK, {
    headers: { 'x-telegram-bot-api-secret-token': E2E_TELEGRAM_SECRET },
    data: update({ chatId: E2E_TELEGRAM_CHAT_ID }),
  })
  expect(res.status()).toBe(200)
  expect(await res.json()).toMatchObject({ ok: true, ignored: 'user' })
})

test('Telegram 6 — chat alanı eksik → fail-closed no-op', async ({ request }) => {
  const res = await request.post(WEBHOOK, {
    headers: { 'x-telegram-bot-api-secret-token': E2E_TELEGRAM_SECRET },
    data: update({ fromId: E2E_TELEGRAM_USER_ID }),
  })
  expect(res.status()).toBe(200)
  expect(await res.json()).toMatchObject({ ok: true, ignored: 'chat' })
})

test('Telegram 7 — bozuk JSON → 400', async ({ request }) => {
  // Buffer → Playwright yeniden serialize ETMEZ; ham bozuk gövde gider.
  const res = await request.post(WEBHOOK, {
    headers: {
      'x-telegram-bot-api-secret-token': E2E_TELEGRAM_SECRET,
      'content-type': 'application/json',
    },
    data: Buffer.from('{bozuk'),
  })
  expect(res.status()).toBe(400)
})

test('Telegram 8 — mesaj-dışı update (callback_query) → güvenli no-op', async ({ request }) => {
  const res = await request.post(WEBHOOK, {
    headers: { 'x-telegram-bot-api-secret-token': E2E_TELEGRAM_SECRET },
    data: { update_id: 900002, callback_query: { id: 'x' } },
  })
  expect(res.status()).toBe(200)
  expect((await res.json()).ok).toBe(true)
})
