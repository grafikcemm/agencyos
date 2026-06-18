import { describe, it, expect } from 'vitest'
import { escapeTelegramHtml } from './telegramHtml'

describe('escapeTelegramHtml', () => {
  it('< > & karakterlerini kaçar', () => {
    expect(escapeTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d')
  })
  it('tag enjeksiyonunu etkisizleştirir', () => {
    expect(escapeTelegramHtml('</b><img src=x onerror=alert(1)>')).toBe(
      '&lt;/b&gt;&lt;img src=x onerror=alert(1)&gt;',
    )
  })
  it('boş/null için boş string döner', () => {
    expect(escapeTelegramHtml('')).toBe('')
    expect(escapeTelegramHtml(null)).toBe('')
    expect(escapeTelegramHtml(undefined)).toBe('')
  })
})
