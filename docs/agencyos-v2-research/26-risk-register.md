---
Doküman: 26-risk-register
Tarih: 2026-07-11
Kaynak kalitesi: birincil (repo + diğer 21 araştırma dokümanının sentezi)
Güven: yüksek (tanımlı riskler) / orta (olasılık tahminleri)
AgencyOS'a etki: v2 geliştirmesinde izlenecek risk envanteri; her risk için sahip + azaltma.
---

# AgencyOS v2 — Risk Register

Olasılık/Etki: Düşük / Orta / Yüksek. Riskler kategoriye göre gruplu. Azaltma sütunu mevcut korumaları referanslar.

## Mevzuat / Hukuki
| ID | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| L1 | KVKK/ticari e-ileti ihlali (kişisel adrese ön-onaysız outreach) | Orta | Yüksek | `isFreemail()` sinyalini uyum-dikkate bağla; kişisel-vs-kurumsal adres ayrımı; tacir/esnaf iş adresi varsayılanı; İYS; profesyonel hukuk incelemesi flag'i (`11-compliance`) |
| L2 | İlk itiraza rağmen gönderime devam (opt-out ihlali) | Düşük | Yüksek | `outreach_suppressions` tablosu + gönderim öncesi zorunlu kontrol; reply-intel unsubscribe sınıfı kalıcı durdurur |
| L3 | Hukuki kesinlik iddiası (bu araştırma hukuki tavsiye değil) | Orta | Orta | Tüm mevzuat bulgularında "profesyonel inceleme" etiketi; kesin ifade yok |
| L4 | Gelen 3. taraf e-postasını LLM'e göndermenin KVKK "veri işleyen" sonucu | Orta | Orta | Veri minimizasyonu; redaction; hukuki inceleme (`23-security`) |

## Deliverability / E-posta
| ID | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| D1 | SPF/DKIM/DMARC eksikliği → kalıcı 550 red / spam | Orta | Yüksek | Gönderim öncesi DNS doğrulama (operatör, tek seferlik); Postmaster Tools (V1) |
| D2 | Yüksek bounce/complaint → domain reputation çökmesi | Düşük (düşük hacim) | Yüksek | Düşük hacim + HITL + suppression; bounce/complaint ayrımı (`10-deliverability`) |
| D3 | Open-tracking pixel'e aşırı güven (yanıltıcı + gizlilik) | Orta | Düşük | Ana metrik = delivered/replied/positive-reply/meeting/won (opens değil) |

## Güvenlik
| ID | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| S1 | Gelen e-posta/web içeriğindeki prompt injection | Yüksek | Yüksek | Dış içerik = VERİ; lethal-trifecta guard (`brain/permissions.ts`); `redactPreview`; sınıflandırma yalnız etiket üretir, eylem tetiklemez |
| S2 | OAuth/refresh token sızıntısı | Düşük | Yüksek | Şifreli ayrı tablo (Supabase Vault); least-privilege scope; `gmail.send`-only MVP |
| S3 | Yetkisiz veya DUPLICATE gönderim | Düşük | Yüksek | Digest-locked HITL (`approvals/integrity.ts`); idempotency `outreach_messages.id` |
| S4 | Cross-lead memory sızıntısı (bir lead verisi başkasına) | Orta | Yüksek | Namespace ayrımı ZORUNLU (V1 öncesi mimari boşluk kapat); provenance/scope (`16-memory`) |
| S5 | Company identity confusion (yanlış şirket eşleşmesi) | Orta | Orta | Domain doğrulama; duplicate resolver; kanıt-tabanlı |
| S6 | RLS bypass / SQLi | Düşük | Yüksek | RLS default-deny + REVOKE; `sanitizeWriteBody` alan-allowlist tamamlanmalı (S6 açık: field-şema eksik) |

## Model / AI
| ID | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| M1 | Stale/kırık model ID → runtime 404/fallback yok | **Yüksek (şu an)** | Orta | `models:[primary,...fallbacks]` dizisi; canlı `/api/v1/models` doğrulama (`18-routing`) — URGENT |
| M2 | Preview model kaldırılması / provider outage | Orta | Orta | Stable fallback zorunlu; `allow_fallbacks` |
| M3 | Hallucination (uydurma hizmet/metrik/portfolyo) | Orta | Yüksek | Offer-matcher katalog-kilidi; council evidence_id zorunluluğu; `brain/verify.ts`; deterministik checks |
| M4 | Model maliyeti patlaması | Düşük | Orta | `caps.ts` $20/ay + $0.40/gün lead-intel; en pahalı model varsayılan değil; cache (V2) |
| M5 | Aynı-aile judge (kendi çıktısını onaylama) | Orta | Orta | Çapraz-aile Tier-5 judge (GPT↔Claude) |

## Veri / Sistem
| ID | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| V1 | Repo migration'ları ≠ canlı DB (manuel-apply drift) | Yüksek | Orta | Uygulama öncesi `list_migrations`/`list_tables`; strip-retry pattern zaten toleranslı |
| V2 | Worker idempotency ihlali (duplicate iş) | Orta | Orta | Kanonik run/step lease-retry (ADR-001, mig 038); idempotency key |
| V3 | Kişisel veri aşırı saklama | Orta | Orta | `retention_until` kolonu; data-expiry worker; veri minimizasyonu |

## Ürün / Kapsam
| ID | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| P1 | Görev/alışkanlık modülünün bozulması | Düşük | Yüksek | Modül izole (LIFE DB); v2 dokunmaz; "koru" kuralı |
| P2 | Dashboard/ekran çoğalması (scope sprawl) | Orta | Orta | Yeni ekran son çare; mevcut 4 ekranı yeniden kompoze (`02-ux`); ≤3 adım kuralı |
| P3 | Notification fatigue (2 paralel yarım bildirim sistemi) | Orta | Düşük | Tek kanal (Telegram) veya gerçek sayaca bağlı zil; birini seç |
| P4 | Ölü kod birikimi (dashboard/RightPanel/KanbanBoard) | Orta | Düşük | Ayrı temizlik görevi; kasıtlı-taslak mı belirsiz → Cem karar |

## Bağımlılık / Dış
| ID | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| X1 | **Gmail OAuth yetkisi alınamaması** (blokör) | Orta | Yüksek | MVP'yi Gmail'siz tasarla; #1/#2 V1'e ertele; Cem connector onayı verene kadar shadow |
| X2 | Apollo/Firecrawl/Places API politika/fiyat değişimi | Düşük | Orta | Tool-cost logging (V1); sağlayıcı-agnostik soyutlama |
| X3 | Supply-chain (bağımlılık zafiyeti) | Düşük | Orta | Dependency audit; least-privilege |

## En kritik 5 (planlama önceliği)
1. **X1 Gmail OAuth blokörü** — MVP kapsamını belirler.
2. **M1 stale model ID** — şu an aktif, hızlı fix.
3. **S1 prompt injection** (reply ingest geldiğinde) — mimari kontrol V1 öncesi.
4. **S4 cross-lead memory sızıntısı** — namespace ayrımı V1 öncesi.
5. **L1/L2 KVKK opt-out** — suppression + hukuki inceleme.
