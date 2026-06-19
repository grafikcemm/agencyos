import { describe, it, expect } from 'vitest'
import { classifyMessageIntent } from './intent'

describe('classifyMessageIntent', () => {
  it('selamlamayı taahhüt sanmaz (asıl bug)', () => {
    expect(classifyMessageIntent('Selam')).toBe('greeting')
    expect(classifyMessageIntent('selam')).toBe('greeting')
    expect(classifyMessageIntent('merhaba')).toBe('greeting')
    expect(classifyMessageIntent('Günaydın Cem')).toBe('greeting')
    expect(classifyMessageIntent('nasılsın?')).toBe('greeting')
    expect(classifyMessageIntent('naber abi')).toBe('greeting')
  })

  it('slash komutları command', () => {
    expect(classifyMessageIntent('/plan')).toBe('command')
    expect(classifyMessageIntent('/durum')).toBe('command')
  })

  it('yetenek soruları meta', () => {
    expect(classifyMessageIntent('ne yapabilirsin?')).toBe('meta')
    expect(classifyMessageIntent('neler yapabilirsin')).toBe('meta')
    expect(classifyMessageIntent('kimsin')).toBe('meta')
    expect(classifyMessageIntent('komutlar')).toBe('meta')
  })

  it('sorular question (taahhüt değil)', () => {
    expect(classifyMessageIntent('bugün ne yapmalıyım?')).toBe('question')
    expect(classifyMessageIntent('kaçta?')).toBe('question')
    expect(classifyMessageIntent('neden böyle oldu')).toBe('question')
  })

  it('gerçek taahhüt cümleleri commitment_candidate', () => {
    expect(classifyMessageIntent('bugün sunum taslağını bitireceğim')).toBe('commitment_candidate')
    expect(classifyMessageIntent('logo işini bugün hallederim')).toBe('commitment_candidate')
    expect(classifyMessageIntent('spora gideceğim')).toBe('commitment_candidate')
    expect(classifyMessageIntent('müşteriye teklifi göndereceğim')).toBe('commitment_candidate')
  })

  it('kısa taahhüt-olmayan kalıntı smalltalk', () => {
    expect(classifyMessageIntent('eve geldim')).toBe('smalltalk')
    expect(classifyMessageIntent('hmm')).toBe('smalltalk')
    expect(classifyMessageIntent('')).toBe('smalltalk')
  })
})
