import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAccountMock = vi.fn()
const findMock = vi.fn()
const sendMock = vi.fn()
const buildRawMock = vi.fn()

vi.mock('@/lib/gmail/tokenVault', () => ({
  getActiveGmailAccount: (...args: unknown[]) => getAccountMock(...args),
}))
vi.mock('@/lib/outreach/gmailRestTransport', () => ({
  createGmailRestTransport: () => ({ findByRfcMessageId: findMock, send: sendMock }),
}))
vi.mock('@/lib/outreach/gmail', () => ({
  buildRawMessage: (...args: unknown[]) => buildRawMock(...args),
}))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: {} }))

import {
  reconcileTechnicalGmailCanaryReply,
  runTechnicalGmailCanary,
  TECHNICAL_CANARY_MESSAGE_ID,
  type CanaryLedgerState,
  type TechnicalCanaryLedger,
  type TechnicalCanaryReplyStore,
} from './technicalCanary'

function makeLedger(initial: CanaryLedgerState | null = null) {
  let state = initial
  const ledger: TechnicalCanaryLedger = {
    read: vi.fn(async () => state),
    claim: vi.fn(async () => {
      if (state !== null) return false
      state = 'claimed'
      return true
    }),
    write: vi.fn(async (next) => { state = next }),
  }
  return ledger
}

beforeEach(() => {
  getAccountMock.mockReset()
  findMock.mockReset()
  sendMock.mockReset()
  buildRawMock.mockReset()
  getAccountMock.mockResolvedValue({ email_address: 'info@grafikcem.com' })
  findMock.mockResolvedValue(null)
  sendMock.mockResolvedValue({ id: 'gmail-id', threadId: 'thread-id' })
  buildRawMock.mockReturnValue('base64url-raw')
})

describe('runTechnicalGmailCanary', () => {
  it('geçersiz alıcıyı Vault/provider çağrısından önce reddeder', async () => {
    await expect(runTechnicalGmailCanary('invalid', makeLedger())).rejects.toThrow('GMAIL_CANARY_RECIPIENT')
    expect(getAccountMock).not.toHaveBeenCalled()
  })

  it('aktif hesap yoksa fail-closed kalır', async () => {
    getAccountMock.mockResolvedValue(null)
    await expect(runTechnicalGmailCanary('operator@example.com', makeLedger())).rejects.toThrow('Aktif Gmail')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sabit Message-ID zaten varsa tekrar göndermez', async () => {
    const result = await runTechnicalGmailCanary('operator@example.com', makeLedger('sent'))
    expect(result).toEqual({ ok: true, sent: false, deduplicated: true, transport: 'gmail', replied: false })
    expect(findMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('ticari olmayan sabit mesajı yalnız bir kez gönderir', async () => {
    const ledger = makeLedger()
    const result = await runTechnicalGmailCanary('Operator@Example.com', ledger)
    expect(result).toEqual({ ok: true, sent: true, deduplicated: false, transport: 'gmail', replied: false })
    expect(buildRawMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'operator@example.com',
      messageId: TECHNICAL_CANARY_MESSAGE_ID,
      subject: expect.stringContaining('Teknik Gmail canary'),
      body: expect.stringContaining('ticari bir teklif değildir'),
    }))
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(ledger.write).toHaveBeenCalledWith('sent')
  })

  it('claim/unknown durumda provider henüz bulamıyorsa otomatik resend yapmaz', async () => {
    await expect(runTechnicalGmailCanary('operator@example.com', makeLedger('unknown')))
      .rejects.toThrow('otomatik yeniden gönderim engellendi')
    expect(findMock).toHaveBeenCalledWith(TECHNICAL_CANARY_MESSAGE_ID)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('claim yarışını tek çağrı kazanır; kaybeden resend yapmaz', async () => {
    const ledger = makeLedger()
    const first = runTechnicalGmailCanary('operator@example.com', ledger)
    const second = runTechnicalGmailCanary('operator@example.com', ledger)
    const results = await Promise.allSettled([first, second])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('reply doğrulanmış durumdaysa yeniden göndermez', async () => {
    const result = await runTechnicalGmailCanary('operator@example.com', makeLedger('replied'))
    expect(result).toEqual({ ok: true, sent: false, deduplicated: true, transport: 'gmail', replied: true })
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('reconcileTechnicalGmailCanaryReply', () => {
  it('sabit RFC referansı + beklenen gönderen eşleşirse replied yazar', async () => {
    const ledger = makeLedger('sent')
    const store: TechnicalCanaryReplyStore = {
      findCandidate: vi.fn(async () => ({ fromAddress: 'Ali <operator@example.com>' })),
    }
    const result = await reconcileTechnicalGmailCanaryReply('operator@example.com', ledger, store)
    expect(result).toEqual({ replied: true })
    expect(store.findCandidate).toHaveBeenCalledWith(expect.objectContaining({
      rfcMessageId: TECHNICAL_CANARY_MESSAGE_ID,
      replySubject: 'Re: [AgencyOS] Teknik Gmail canary — yanıt testi',
    }))
    expect(ledger.write).toHaveBeenCalledWith('replied')
  })

  it('karantina kaydı yoksa state değiştirmez', async () => {
    const ledger = makeLedger('sent')
    const store: TechnicalCanaryReplyStore = { findCandidate: vi.fn(async () => null) }
    await expect(reconcileTechnicalGmailCanaryReply('operator@example.com', ledger, store))
      .resolves.toEqual({ replied: false })
    expect(ledger.write).not.toHaveBeenCalled()
  })

  it('beklenmeyen göndereni reply kanıtı saymaz', async () => {
    const ledger = makeLedger('sent')
    const store: TechnicalCanaryReplyStore = {
      findCandidate: vi.fn(async () => ({ fromAddress: 'attacker@example.com' })),
    }
    await expect(reconcileTechnicalGmailCanaryReply('operator@example.com', ledger, store))
      .rejects.toThrow('beklenen test adresiyle uyuşmuyor')
    expect(ledger.write).not.toHaveBeenCalled()
  })
})
