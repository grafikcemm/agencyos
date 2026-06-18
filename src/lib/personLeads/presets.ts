// Apollo People Search presetleri — pozisyon/kişi bazlı lead hedefleme.
//
// Desen: sectorPriority.ts / cityTargeting.ts gibi tipli TS sabiti (DB değil) —
// versiyonlanır, type-check edilir, deterministik. Değerler ekran görüntüsündeki
// "100-micro-saas" CSV'sinin "Apollo Filtreleri (B2B)" kolonundan türetilmiştir.
//
// İki amaç:
//   APOLLO_B2B_PRESETS  → ajansın satacağı karar vericiler (Pazarlama Müdürü, Kurucu, CMO…)
//   POSITION_PRESETS    → iş başvurusu için işe alım yöneticisi / kreatif direktör / recruiter
//
// industries alanı şu an etiket/dokümantasyon + q_keywords zenginleştirmesi içindir;
// apollo.ts yalnızca Apollo'nun güvenli desteklediği alanları gönderir (titles,
// seniorities, locations, num_employees_ranges, q_keywords) — geçersiz alan → 422 riskini önler.

import type { PersonLeadPurpose, ApolloSearchFilters } from './types'

export interface ApolloPreset {
  /** Stabil id — person_leads.preset_id + dedup/loglama. */
  id: string
  /** UI'da gösterilen "Apollo Filtreleri (B2B)" etiketi. */
  label: string
  purpose: PersonLeadPurpose
  /** sectorPriority.ts profiline gevşek bağ — değer tahmini için (opsiyonel). */
  sectorId?: string
  /** Dokümantasyon/etiket amaçlı sektör adları (apollo.ts q_keywords'e katar). */
  industries?: string[]
  filters: ApolloSearchFilters
  /** Bu preset için tek taramada hedeflenen kabul (kişi akışı kendi temposunda). */
  dailyTarget: number
}

// ── B2B SATIŞ — karar vericiler ──────────────────────────────────────────────
export const APOLLO_B2B_PRESETS: ApolloPreset[] = [
  {
    id: 'b2b_marketing_lead',
    label: 'Pazarlama Müdürü / İçerik Müdürü / CMO · Marketing & Advertising · 11-200',
    purpose: 'b2b_sell',
    sectorId: 'marketing_agency',
    industries: ['marketing and advertising', 'media production'],
    filters: {
      person_titles: ['marketing manager', 'pazarlama müdürü', 'içerik müdürü', 'cmo', 'marka yöneticisi'],
      person_seniorities: ['manager', 'director', 'c_suite'],
      organization_num_employees_ranges: ['11,50', '51,200'],
      person_locations: ['Turkey'],
      q_keywords: 'içerik pazarlama content marketing',
    },
    dailyTarget: 4,
  },
  {
    id: 'b2b_ecommerce_owner',
    label: 'Owner / E-ticaret Müdürü / Founder · Retail & Fashion · 1-50',
    purpose: 'b2b_sell',
    sectorId: 'ecommerce',
    industries: ['retail', 'apparel and fashion', 'consumer goods'],
    filters: {
      person_titles: ['owner', 'founder', 'e-ticaret müdürü', 'e-commerce manager', 'kurucu'],
      person_seniorities: ['owner', 'founder', 'manager'],
      organization_num_employees_ranges: ['1,10', '11,50'],
      person_locations: ['Turkey'],
      q_keywords: 'e-ticaret trendyol shopify',
    },
    dailyTarget: 4,
  },
  {
    id: 'b2b_restaurant_owner',
    label: 'Owner / İşletme Sahibi / Pazarlama Müdürü · Restaurants & Hospitality · 1-50',
    purpose: 'b2b_sell',
    sectorId: 'restaurant',
    industries: ['restaurants', 'hospitality', 'retail'],
    filters: {
      person_titles: ['owner', 'işletme sahibi', 'pazarlama müdürü', 'general manager', 'genel müdür'],
      person_seniorities: ['owner', 'manager'],
      organization_num_employees_ranges: ['1,10', '11,50'],
      person_locations: ['Turkey'],
      q_keywords: 'restoran şube franchise',
    },
    dailyTarget: 3,
  },
  {
    id: 'b2b_realestate_broker',
    label: 'Emlak Danışmanı / Broker / Owner · Real Estate · 1-50',
    purpose: 'b2b_sell',
    sectorId: 'real_estate',
    industries: ['real estate'],
    filters: {
      person_titles: ['emlak danışmanı', 'broker', 'owner', 'real estate agent'],
      person_seniorities: ['owner', 'manager'],
      organization_num_employees_ranges: ['1,10', '11,50'],
      person_locations: ['Turkey'],
      q_keywords: 'emlak gayrimenkul danışman',
    },
    dailyTarget: 3,
  },
  {
    id: 'b2b_clinic_owner',
    label: 'Owner / Klinik Müdürü / İşletme Sahibi · Health & Wellness · 1-50',
    purpose: 'b2b_sell',
    sectorId: 'health_clinic',
    industries: ['health, wellness and fitness', 'medical practice', 'consumer services'],
    filters: {
      person_titles: ['owner', 'klinik müdürü', 'işletme sahibi', 'clinic manager', 'kurucu'],
      person_seniorities: ['owner', 'manager'],
      organization_num_employees_ranges: ['1,10', '11,50'],
      person_locations: ['Turkey'],
      q_keywords: 'randevu klinik estetik salon',
    },
    dailyTarget: 4,
  },
  {
    id: 'b2b_agency_owner',
    label: 'Agency Owner / Hesap Müdürü / Performans Müdürü · Marketing & Advertising · 1-100',
    purpose: 'b2b_sell',
    sectorId: 'marketing_agency',
    industries: ['marketing and advertising'],
    filters: {
      person_titles: ['agency owner', 'hesap müdürü', 'account manager', 'performans pazarlama müdürü', 'founder'],
      person_seniorities: ['owner', 'founder', 'manager'],
      organization_num_employees_ranges: ['1,10', '11,50', '51,200'],
      person_locations: ['Turkey'],
      q_keywords: 'dijital ajans performans pazarlama',
    },
    dailyTarget: 3,
  },
]

// ── İŞ BAŞVURUSU — işe alan kişiler / kreatif liderler ─────────────────────────
export const POSITION_PRESETS: ApolloPreset[] = [
  {
    id: 'job_creative_director',
    label: 'Creative Director / Sanat Yönetmeni · Marketing & Advertising · işe alım',
    purpose: 'job_application',
    industries: ['marketing and advertising', 'design'],
    filters: {
      person_titles: ['creative director', 'sanat yönetmeni', 'art director', 'kreatif direktör', 'design lead'],
      person_seniorities: ['director', 'head', 'manager', 'vp'],
      organization_num_employees_ranges: ['11,50', '51,200', '201,500'],
      person_locations: ['Turkey'],
      q_keywords: 'tasarım kreatif sosyal medya',
    },
    dailyTarget: 3,
  },
  {
    id: 'job_recruiter_design',
    label: 'İK / Recruiter / Talent · ajans & dijital · işe alım',
    purpose: 'job_application',
    industries: ['marketing and advertising', 'staffing and recruiting'],
    filters: {
      person_titles: ['recruiter', 'talent acquisition', 'ik uzmanı', 'human resources', 'işe alım uzmanı'],
      person_seniorities: ['manager', 'senior', 'director'],
      organization_num_employees_ranges: ['11,50', '51,200'],
      person_locations: ['Turkey'],
      q_keywords: 'ajans dijital tasarım işe alım',
    },
    dailyTarget: 2,
  },
  {
    id: 'job_agency_founder',
    label: 'Ajans Kurucusu / Genel Müdür · küçük ajans · freelance/iş',
    purpose: 'job_application',
    industries: ['marketing and advertising'],
    filters: {
      person_titles: ['founder', 'kurucu', 'general manager', 'genel müdür', 'managing partner'],
      person_seniorities: ['owner', 'founder', 'c_suite'],
      organization_num_employees_ranges: ['1,10', '11,50'],
      person_locations: ['Turkey'],
      q_keywords: 'reklam ajansı dijital ajans kreatif',
    },
    dailyTarget: 2,
  },
]

/** Tüm presetler (B2B + pozisyon) — scan döngüsü için. */
export const ALL_PRESETS: ApolloPreset[] = [...APOLLO_B2B_PRESETS, ...POSITION_PRESETS]
