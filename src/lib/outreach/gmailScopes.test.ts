import { describe, it, expect } from 'vitest'
import { checkGrantedScopes, ALLOWED_GMAIL_SCOPES } from './gmailScopes'

// Pozitif scope allowlist (Faz 4 / 21 T4): yalnız gmail.send + gmail.readonly.
// gmail.modify, compose, mail.google.com vb. YAPISAL reddedilir.

const SEND = 'https://www.googleapis.com/auth/gmail.send'
const READONLY = 'https://www.googleapis.com/auth/gmail.readonly'

describe('checkGrantedScopes', () => {
  it('kanonik MVP kümesi (send + readonly) geçer', () => {
    const r = checkGrantedScopes([SEND, READONLY])
    expect(r.ok).toBe(true)
    expect(r.gmailScopes).toEqual([SEND, READONLY])
  })

  it('kimlik scope\'ları tolere edilir ama envantere GİRMEZ (iki gmail scope ile)', () => {
    const r = checkGrantedScopes(['openid', 'email', SEND, READONLY])
    expect(r.ok).toBe(true)
    expect(r.gmailScopes).toEqual([SEND, READONLY])
  })

  it('ZORUNLU scope eksik (yalnız send) → red; missing readonly listeler', () => {
    const r = checkGrantedScopes(['openid', 'email', SEND])
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual([READONLY])
    expect(r.disallowed).toEqual([])
  })

  it('ZORUNLU scope eksik (yalnız readonly) → red; missing send listeler', () => {
    const r = checkGrantedScopes([READONLY])
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual([SEND])
  })

  it('boş grant → red (her iki zorunlu scope eksik)', () => {
    const r = checkGrantedScopes([])
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual([SEND, READONLY])
  })

  it('yalnız kimlik scope\'ları → red (gmail yetkisi yok)', () => {
    const r = checkGrantedScopes(['openid', 'email', 'profile'])
    expect(r.ok).toBe(false)
    expect(r.missing).toHaveLength(2)
    expect(r.disallowed).toEqual([])
  })

  it('gmail.modify → red (fail-closed)', () => {
    const r = checkGrantedScopes([SEND, 'https://www.googleapis.com/auth/gmail.modify'])
    expect(r.ok).toBe(false)
    expect(r.disallowed).toContain('https://www.googleapis.com/auth/gmail.modify')
  })

  it('tam erişim (mail.google.com) → red', () => {
    const r = checkGrantedScopes(['https://mail.google.com/'])
    expect(r.ok).toBe(false)
  })

  it('gmail.compose gibi allowlist-dışı Gmail scope\'u → red (pozitif allowlist)', () => {
    const r = checkGrantedScopes([SEND, 'https://www.googleapis.com/auth/gmail.compose'])
    expect(r.ok).toBe(false)
  })

  it('tekrar eden scope tekilleştirilir', () => {
    const r = checkGrantedScopes([SEND, SEND, READONLY])
    expect(r.gmailScopes).toEqual([SEND, READONLY])
  })

  it('allowlist tam olarak 2 scope içerir (genişleme = bilinçli migration)', () => {
    expect(ALLOWED_GMAIL_SCOPES).toHaveLength(2)
  })
})
