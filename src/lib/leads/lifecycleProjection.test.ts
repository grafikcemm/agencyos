import { describe, it, expect } from 'vitest'
import {
  project,
  reconcile,
  stageFromStatus,
  isTerminal,
  LIFECYCLE_STAGES,
  STAGE_LABELS,
  type LifecycleEvent,
  type LeadProjectionInput,
} from './lifecycleProjection'

function ev(action: string, toStatus = 'contacted', evidence: Record<string, unknown> = {}): LifecycleEvent {
  return {
    action,
    from_status: 'new',
    to_status: toStatus,
    evidence,
    actor: 'test',
    occurred_at: '2026-08-10T00:00:00.000Z',
  }
}

const bareLead: LeadProjectionInput = { status: 'new' }

const fullyQualifiedLead: LeadProjectionInput = {
  status: 'new',
  evidence_urls: ['https://example.com'],
  verified_at: '2026-08-09T00:00:00.000Z',
  research_score: 94,
  contact_status: 'enriched',
  lawful_basis: 'legitimate_interest',
  suppression_status: 'clear',
}

describe('project — olay akışından aşama', () => {
  it('olay yoksa found ve sıradaki adım signal_verified', () => {
    const p = project(bareLead, [])
    expect(p.stage).toBe('found')
    expect(p.next).toBe('signal_verified')
    expect(p.terminal).toBe(false)
  })

  it('en ileri aşamayı alır, olay sırası önemli değil', () => {
    const p = project(fullyQualifiedLead, [ev('qualify'), ev('verify_signal')])
    expect(p.stage).toBe('qualified')
    expect(p.reached).toEqual(['signal_verified', 'qualified'])
  })

  it('terminal olay akışı kapatır — sonrası ilerleme gösterilmez', () => {
    const p = project(fullyQualifiedLead, [ev('verify_signal'), ev('qualify'), ev('suppress')])
    expect(p.stage).toBe('suppressed')
    expect(p.terminal).toBe(true)
    expect(p.next).toBeNull()
  })

  it('terminal olay ÖNCE gelse bile akış kapalı sayılır', () => {
    const p = project(fullyQualifiedLead, [ev('suppress'), ev('qualify')])
    expect(p.terminal).toBe(true)
    expect(p.stage).toBe('suppressed')
  })

  it('bilinmeyen eylemi yok sayar, patlamaz', () => {
    const p = project(fullyQualifiedLead, [ev('verify_signal'), ev('__bilinmeyen__')])
    expect(p.stage).toBe('signal_verified')
  })

  it('olay akışı yoksa leads.status tek kanıttır (069 öncesi kayıtlar)', () => {
    expect(project({ status: 'responded' }, []).stage).toBe('replied')
    expect(project({ status: 'converted' }, []).stage).toBe('onboarded')
    expect(project({ status: 'lost' }, []).terminal).toBe(true)
  })

  it('son aşamada next null döner', () => {
    const p = project(fullyQualifiedLead, [ev('grow')])
    expect(p.stage).toBe('grown')
    expect(p.next).toBeNull()
  })
})

describe('blockers — kanıt kapıları', () => {
  it('kanıtsız lead sinyal doğrulamasına geçemez', () => {
    const p = project(bareLead, [])
    expect(p.blockers).toContain('kanıt URL’si yok')
    expect(p.blockers).toContain('doğrulama tarihi yok')
  })

  it('skoru olmayan lead nitelendirilemez', () => {
    const lead: LeadProjectionInput = { ...fullyQualifiedLead, research_score: null }
    const p = project(lead, [ev('verify_signal')])
    expect(p.next).toBe('qualified')
    expect(p.blockers).toEqual(['açıklanabilir skor yok'])
  })

  it('yasal dayanağı veya suppression clear olmayan lead uyum kapısını geçemez', () => {
    const lead: LeadProjectionInput = {
      ...fullyQualifiedLead,
      lawful_basis: null,
      suppression_status: 'unknown',
    }
    const p = project(lead, [ev('verify_signal'), ev('qualify'), ev('enrich_contact')])
    expect(p.next).toBe('compliance_checked')
    expect(p.blockers).toEqual(['yasal dayanak tanımsız', 'suppression durumu clear değil'])
  })

  it('gönderim HER ZAMAN insan onayı ister — koşulsuz', () => {
    const p = project(fullyQualifiedLead, [
      ev('verify_signal'), ev('qualify'), ev('enrich_contact'),
      ev('compliance_check'), ev('draft'), ev('request_approval'),
    ])
    expect(p.next).toBe('sent')
    expect(p.blockers).toEqual(['insan onayı gerekir (otomatik gönderim yok)'])
  })

  it('vaka üretimi HER ZAMAN müşteri izni ister', () => {
    const p = project(fullyQualifiedLead, [
      ev('verify_signal'), ev('qualify'), ev('enrich_contact'), ev('compliance_check'),
      ev('draft'), ev('request_approval'), ev('send'), ev('reply'), ev('convert'), ev('onboard'),
    ])
    expect(p.next).toBe('case_produced')
    expect(p.blockers).toEqual(['müşteri izni gerekir'])
  })

  it('tüm koşulları sağlayan lead uyum kapısında engelsiz', () => {
    const p = project(fullyQualifiedLead, [ev('verify_signal'), ev('qualify'), ev('enrich_contact')])
    expect(p.blockers).toEqual([])
  })
})

describe('reconcile — projeksiyon ↔ leads.status', () => {
  it('tutarlı akışta drift yok', () => {
    const r = reconcile({ ...fullyQualifiedLead, status: 'contacted' }, [
      ev('verify_signal'), ev('qualify'), ev('enrich_contact'),
      ev('compliance_check'), ev('draft'), ev('request_approval'), ev('send'),
    ])
    expect(r.consistent).toBe(true)
    expect(r.drift).toBeNull()
  })

  it('status olay akışından İLERİDEYSE RPC dışı yazma bildirir', () => {
    // status 'converted' (→ onboarded) ama akış yalnız verify_signal'a kadar.
    const r = reconcile({ ...fullyQualifiedLead, status: 'converted' }, [ev('verify_signal')])
    expect(r.consistent).toBe(false)
    expect(r.drift).toContain('RPC dışı yazma')
  })

  it('terminal durumlar birebir eşleşmeli', () => {
    const mismatch = reconcile({ ...fullyQualifiedLead, status: 'archived' }, [ev('suppress')])
    expect(mismatch.consistent).toBe(false)
    expect(mismatch.drift).toContain('olay akışı=suppressed')

    const match = reconcile({ ...fullyQualifiedLead, status: 'suppressed' }, [ev('suppress')])
    expect(match.consistent).toBe(true)
  })

  it('bilinmeyen status sessizce geçmez', () => {
    const r = reconcile({ status: 'yeni-bir-durum' }, [])
    expect(r.consistent).toBe(false)
    expect(r.drift).toContain('bilinmeyen leads.status')
  })

  it('projeksiyon status ten ileri olabilir — olay yazıldı, status aynı kaldı', () => {
    // 'qualify' status değiştirmez; bu tutarsızlık DEĞİLDİR.
    const r = reconcile({ ...fullyQualifiedLead, status: 'new' }, [ev('verify_signal'), ev('qualify')])
    expect(r.consistent).toBe(true)
  })
})

describe('sözleşme bütünlüğü', () => {
  it('13 aşama tanımlı ve sıralı', () => {
    expect(LIFECYCLE_STAGES).toHaveLength(13)
    expect(LIFECYCLE_STAGES[0]).toBe('found')
    expect(LIFECYCLE_STAGES[12]).toBe('grown')
  })

  it('her aşamanın Türkçe etiketi var', () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(STAGE_LABELS[stage], `${stage} etiketi yok`).toBeTruthy()
    }
  })

  it('olumsuz sonuçlar modellenmiş', () => {
    for (const t of ['disqualified', 'suppressed', 'lost', 'archived'] as const) {
      expect(isTerminal(t)).toBe(true)
      expect(STAGE_LABELS[t]).toBeTruthy()
    }
  })

  it('stageFromStatus tüm bilinen LeadStatus değerlerini karşılar', () => {
    const known = [
      'new', 'contacted', 'responded', 'meeting', 'proposal',
      'converted', 'lost', 'waiting', 'disqualified', 'suppressed', 'archived',
    ]
    for (const s of known) {
      expect(stageFromStatus(s), `${s} eşlenmemiş`).not.toBeNull()
    }
    expect(stageFromStatus('uydurma')).toBeNull()
  })
})
