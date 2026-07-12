import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseJsonBody, BadRequestError, MAX_JSON_BODY_BYTES } from './guards'

// Boyut-sınırlı + Zod-doğrulamalı gövde okuyucu (Faz 1 input-validation katmanı).

const Schema = z.object({ name: z.string().min(1).max(50) }).strict()

function post(body: string): Request {
  return new Request('http://localhost:3000/api/x', { method: 'POST', body })
}

describe('parseJsonBody', () => {
  it('geçerli gövdeyi şema tipiyle döner', async () => {
    const data = await parseJsonBody(post(JSON.stringify({ name: 'test' })), Schema)
    expect(data.name).toBe('test')
  })

  it('boş gövde {} olarak parse edilir (opsiyonel-alan şemaları için)', async () => {
    const Optional = z.object({ q: z.string().optional() }).strict()
    const data = await parseJsonBody(post(''), Optional)
    expect(data).toEqual({})
  })

  it('boyut sınırını aşan gövde reddedilir', async () => {
    const huge = JSON.stringify({ name: 'a'.repeat(MAX_JSON_BODY_BYTES + 10) })
    await expect(parseJsonBody(post(huge), Schema)).rejects.toThrow(BadRequestError)
  })

  it('özel maxBytes sınırı uygulanır', async () => {
    const body = JSON.stringify({ name: 'abcdefghij' })
    await expect(parseJsonBody(post(body), Schema, 5)).rejects.toThrow('çok büyük')
  })

  it('bozuk JSON reddedilir', async () => {
    await expect(parseJsonBody(post('{bozuk'), Schema)).rejects.toThrow('geçerli JSON değil')
  })

  it('şema ihlali alan yoluyla raporlanır', async () => {
    await expect(parseJsonBody(post(JSON.stringify({ name: 123 })), Schema)).rejects.toThrow('name')
  })

  it('strict şemada bilinmeyen anahtar reddedilir (allowlist davranışı)', async () => {
    const body = JSON.stringify({ name: 'ok', evil: 'x' })
    await expect(parseJsonBody(post(body), Schema)).rejects.toThrow(BadRequestError)
  })
})
