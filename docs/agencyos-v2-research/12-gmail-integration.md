---
Doküman: 12-gmail-integration
Tarih: 2026-07-11
Kaynak kalitesi: karışık (Gmail API resmi dokümantasyonu ağırlıklı; bounce tespiti ve idempotency pratiği ikincil/topluluk kaynaklarıyla destekli)
Güven: yüksek (resmi API davranışı, scope'lar, kota) / orta (bounce parsing, gönderim hacmi pratikleri)
AgencyOS'a etki: Mevcut manuel-dispatch outreach modelinin (coldEmail.ts → operatör elle gönderir) üstüne, HITL onaylı, kademeli (L1→L2) gerçek Gmail gönderimi ve yanıt/bounce tespiti eklenmesi için somut bir mimari + scope + otomasyon-seviyesi çerçevesi verir.
---

## Özet

Gmail API; taslak oluşturma, thread içinde yanıt gönderme, gelen kutusunu okuma, değişiklikleri artımlı (History API) veya anlık (Pub/Sub push) izleme konusunda olgun ve resmî olarak desteklenen uçlar sunuyor [CERTAIN, developers.google.com, 2026-07-11 erişim]. Ancak API'nin **yerleşik idempotency-key'i, yerleşik bounce-tespit uç noktası veya "yalnız taslak, asla gönderemez" ayrık bir scope'u yok** — bunların hepsi uygulama katmanında (AgencyOS'ta) inşa edilmeli. AgencyOS'un mevcut mimarisi (manuel-dispatch `outreach_messages` + `follow_up_sequences` + Brain v2 HITL onay kapısı) bu inşa için zaten doğru iskelet; eksik olan sadece Gmail API'ye gerçek bir bağlantı katmanı ve birkaç ek DB kolonu. Bu doküman L0-L4 otomasyon seviyeleri tanımlıyor ve **L1 (Gmail taslağı) → L2 (uygulama-içi onay+gönder)**'i varsayılan yol olarak öneriyor; L4 (tam otomatik) açıkça önerilmiyor.

## 1. Gmail API resmi kabiliyetleri

| Kabiliyet | Uç nokta / mekanizma | Not | Kaynak/Güven |
|---|---|---|---|
| Taslak oluştur/güncelle | `users.drafts.create` / `.update` | Draft ID sabit kalır, içerik değiştirilebilir; gönderilene kadar hiçbir yere gitmez | [CERTAIN] developers.google.com/gmail/api/guides/drafts |
| Kullanıcı onayıyla gönder | `users.drafts.send` | Draft otomatik silinir, `SENT` etiketli yeni mesaj oluşur | [CERTAIN] aynı kaynak |
| Doğrudan gönder | `users.messages.send` | Draft adımı olmadan tek çağrıda gönderim | [CERTAIN] developers.google.com/gmail/api/guides/sending |
| Thread içinde yanıt | Aynı `Subject` + doğru `References`/`In-Reply-To` header'ları (RFC 2822) | `threadId` de mesaj gövdesine eklenmeli | [CERTAIN] |
| Mesaj formatı | `raw` alanında base64url + RFC 2822 MIME | Ek dosya = multipart MIME | [CERTAIN] |
| Yanıt takibi (push) | `users.watch` + Cloud Pub/Sub | 7 günde bir yenilenmeli (günlük öneriliyor); ek GCP altyapısı (topic+subscription+public HTTPS) gerektirir | [CERTAIN] developers.google.com/gmail/api/guides/push |
| Yanıt takibi (poll) | `users.history.list(startHistoryId)` | Ucuz (2 kota birimi); history kayıtları "en az 1 hafta" garantili, süre dolarsa 404 → tam re-sync gerekir | [CERTAIN] developers.google.com/gmail/api/guides/sync |
| Etiketleme | `users.labels`, `messages.modify` | Operatörün kendi Gmail'inde "AgencyOS" etiketi gibi organizasyon için | [CERTAIN] |
| Token yenileme | Standart OAuth2 `refresh_token` akışı | `google-auth-library`/`googleapis` istemcisi otomatik yeniler | [CERTAIN] developers.google.com/identity/protocols/oauth2 |
| Bounce tespiti | **Yok — yerleşik uç nokta yok** | `mailer-daemon@` gönderen mesajları normal mesaj gibi gelir; `X-Failed-Recipients`, DSN `Action`/`Status` header'ları elle parse edilir | [LIKELY] ikincil kaynaklar (labnol.org, support.google.com toplulukları) |
| Idempotency | **Yok — yerleşik idempotency-key parametresi yok** (Resend'in aksine) | Tekilleştirme tamamen uygulama sorumluluğu | [LIKELY] genel API tasarım analizleri + Resend karşılaştırması |

## 2. OAuth scope seçimi (least-privilege)

| Scope | Ne yapar | Hassasiyet | AgencyOS önerisi |
|---|---|---|---|
| `gmail.compose` | Taslak oluştur/oku/güncelle/sil **+ taslağı gönder** | Restricted | L1 (taslak) ve L2 (gönder) için temel scope — draft-then-send akışı bununla tam kapanır |
| `gmail.send` | Yalnız gönderim, başka hiçbir okuma yok | Sensitive | Draft akışı yerine doğrudan `messages.send` kullanılacaksa `gmail.readonly` ile birlikte |
| `gmail.readonly` | Tüm mesaj/thread okuma, yazma yok | Restricted | Thread context (doğru `References`/`In-Reply-To`) + yanıt/bounce tespiti için gerekli |
| `gmail.modify` | Oku+yaz (etiket, silme hariç), gönderme dahil değil ayrı | Restricted | Gerekmiyor — `compose`+`readonly` kombinasyonu daha dar kapsamlı |
| `gmail.labels` | Sadece etiket oku/düzenle | Non-sensitive | V2 nice-to-have (operatör tarafı organizasyon) |
| `https://mail.google.com/` | Tam erişim + **kalıcı silme** | En geniş | **Asla kullanılmasın** — bu ürün için hiçbir senaryoda gerekmiyor |

Önerilen minimal kombinasyon: **`gmail.compose` + `gmail.readonly`**. Not: Google, "taslak oluşturabilen ama asla gönderemeyen" ayrı bir scope sunmuyor — `gmail.compose` teknik olarak gönderme yetkisini de taşıyor. Yani **L1'de "operatör kendisi gönderir" garantisi scope düzeyinde değil, kod düzeyinde** sağlanır: uygulama kodu hiçbir zaman `drafts.send`/`messages.send` çağırmaz. [ASSUMPTION — implementasyon anında Google'ın güncel per-method scope tablosuyla teyit edilmeli, özellikle `users.watch` için gereken minimum scope net doğrulanmadı.]

## 3. Otomasyon seviyeleri (L0-L4)

| Seviye | Davranış | Gmail API kullanımı | HITL | Önerilen durum |
|---|---|---|---|---|
| **L0 — Metin öneri** | Sistem yalnız metni üretir (bugünkü `coldEmail.ts` davranışı); operatör kendi istemcisinde elden yazar | Yok | Yok (zaten insan eylemi) | Mevcut/canlı |
| **L1 — Gmail taslağı** | Sistem OAuth ile bağlanır, `drafts.create` çağırır → taslak doğrudan operatörün Gmail "Taslaklar" klasöründe belirir; operatör Gmail'de inceleyip kendisi gönderir | `drafts.create/update` | Doğal (Gmail'in kendi gönder tuşu) | **MVP — varsayılan öneri** |
| **L2 — Uygulama içi onay + gönder** | Operatör AgencyOS arayüzünde taslağı görür, "Onayla ve Gönder" der → sistem `drafts.send` çağırır | `drafts.create` + `drafts.send` | Brain v2 `approval_requests` kapısından geçer (digest-lock ile aynı mesaj 2 kez gönderilemez) | **V1 hedefi** |
| **L3 — Önceden onaylı follow-up kuralı** | Operatör "bu sekansın 2. adımını, yanıt gelmezse otomatik gönder" diye TTL'li toplu onay verir (örn. günlük tavan 5) | `drafts.send` (arka planda, cron tetikli) | TTL'li önceden-onay + günlük tavan | **V2 — sınırlı/dikkatli** |
| **L4 — Tam otomatik** | Karar→taslak→gönder→takip→yanıt-sınıflandır zinciri insan onayı olmadan | Tümü | Yok | **Önerilmiyor** |

L4'ün önerilmeme gerekçesi: (a) CLAUDE.md/proje kuralı "kritik e-postalar insan onayı olmadan gönderilmez" ilkesini doğrudan ihlal eder; (b) tek kişilik, ismi markayla özdeş bir stüdyoda yanlış lead'e/yanlış zamanda giden bir e-posta itibar riski taşır; (c) Brain v2'nin zaten kurulu lethal-trifecta guard + scope sınıflandırması (dış-iletişim + yazma birleşimi = en yüksek kısıt) mantığıyla çelişir. Bu, mevcut sistemin kendi tasarım ilkesine aykırı olurdu — yeni bir istisna açmak yerine mevcut kısıtı korumak öneriliyor.

## 4. Yanıt ve bounce tespiti: poll vs push

AgencyOS'ta zaten Vercel cron altyapısı var (`src/app/api/cron/daily-scan/route.ts` deseni, `CRON_SECRET` bearer auth). Bu, **History API polling**'i düşük karmaşıklıkla mümkün kılıyor:

- **Poll (önerilen, MVP/V1):** Yeni bir cron rotası (`src/app/api/cron/gmail-sync` gibi), her N dakikada bir `history.list(startHistoryId)` çağırır (2 kota birimi — ucuz), yeni gelen mesajları `threadId` üzerinden `outreach_messages`'a eşler, eşleşen bir thread'de yeni mesaj varsa `status='replied'` yapar. Basit, ek GCP altyapısı gerektirmez.
- **Push (V2, gerekirse):** `users.watch` + Cloud Pub/Sub, near-real-time bildirim sağlar ama (a) ayrı bir GCP projesi + topic + subscription + public HTTPS endpoint kurulumu, (b) watch'ın **7 günde bir yenilenmesi** için zaten bir cron gerektirir. Yani push bile poll benzeri bir cron'dan kaçamıyor — sadece "yanıt geldi" bildirimini anlık yapıyor. Tek operatörlü, düşük hacimli bu üründe 15-30 dakikalık poll gecikmesi gerçek bir sorun yaratmaz; push'un getirdiği ek altyapı karmaşıklığı MVP için gerekçelendirilemiyor.

**Bounce tespiti** ayrı bir uç nokta değil — aynı poll/push mekanizmasıyla gelen mesajlar arasında `mailer-daemon@` göndereni veya `Content-Type: multipart/report; report-type=delivery-status` + DSN `Action=failed`/`Status=5.x.x` header'larını arayan bir sınıflandırma dalı. Reply-detection'ın bir V1 uzantısı olarak eklenmeli, ayrı bir sistem değil.

**Kapsam sınırı:** Bu doküman yalnız "bir yanıt/bounce geldiğini Gmail API üzerinden nasıl tespit ederiz"i kapsıyor. Gelen yanıtın **içeriğinin anlaşılması/sınıflandırılması** (niyet analizi, sonraki adım önerisi) ayrı bir eksik alan olarak brief'te işaretli ("Reply intelligence YOK") — bu doküman o işi çözmüyor, sadece tetikleyici sinyali (yeni mesaj geldi + kimden + hangi thread'e) üretiyor.

## 5. Idempotency ve tekrar-gönderim önleme

Gmail API'nin Resend gibi bir `idempotency-key` parametresi yok. Tekilleştirme tamamen AgencyOS'un sorumluluğunda ve zaten `markMessageSent` (`src/lib/outreach/email.ts`) içinde kanıtlanmış bir desen var: satır zaten `'sent'` ise no-op başarı döndürülüyor. Aynı desen gerçek Gmail gönderimine de uygulanmalı:

1. Gönderim çağrısından **önce** `outreach_messages.status !== 'sent'` kontrolü (race koşulu için DB seviyesinde `status='approved'` → `WHERE status='approved'` update ile tek seferlik geçiş garantisi).
2. Gmail API'den dönen gerçek `id` (mesaj) ve `threadId` **veritabanına yazılmalı** — bugün `outreach_messages` tablosunda (migration 010/022) bu alanlar **yok**. V1 için ek migration gerekiyor: `gmail_message_id`, `gmail_thread_id`, `gmail_history_id` gibi kolonlar (bu dokümanın kapsamı dışında yazılacak — sadece ihtiyaç burada tespit ediliyor).
3. Brain v2'nin mevcut digest-lock/idempotency mekanizması (paylaşılan bağlamda tanımlı) L2 onay akışında zaten "aynı isteğin 2 kez onaylanmasını" engelliyor — gönderim tarafında ayrı bir tekilleştirme katmanı icat etmek yerine bu mekanizma yeniden kullanılmalı.

## 6. Kota, hız limiti, gönderim hacmi

| Metrik | Değer | Kaynak |
|---|---|---|
| Proje başına dakikalık kota | 1.200.000 birim | [CERTAIN] developers.google.com/gmail/api/reference/quota |
| Kullanıcı başına dakikalık kota | 6.000 birim | aynı |
| `messages.send` / `drafts.send` maliyeti | 100 birim/çağrı | aynı |
| `history.list` maliyeti | 2 birim/çağrı | aynı |
| Standart Gmail hesabı günlük gönderim | 500 e-posta/24 saat (kayan pencere) | [CERTAIN] knowledge.workspace.google.com |
| Google Workspace günlük gönderim | 2.000 e-posta/24 saat | aynı |
| 429/kota hatası önerisi | Truncated exponential backoff: `min((2^n)+rastgele_ms, max)` | [CERTAIN] Google resmi kota rehberi |

**Çıkarım:** Bu limitler AgencyOS'un gerçek hacmiyle (tek operatör, muhtemelen günde tek haneli-onlarca outreach) kıyaslandığında pratik bir darboğaz değil — asıl kısıt teknik kota değil, **deliverability disiplini** (SPF/DKIM/DMARC, düşük şikayet oranı) ki bu zaten paylaşılan bağlamda ayrı doğrulanmış bulgu olarak mevcut.

## 7. Token yenileme ve re-auth

`google-auth-library`/`googleapis` istemcisi saklanan `refresh_token`'dan yeni `access_token` üretmeyi otomatik yapar [CERTAIN]. `invalid_grant` hatası (kullanıcı erişimi iptal etti, 6 ay kullanılmayan token, şifre değişikliği, test-modu uygulamalarda 7 günlük otomatik iptal) durumunda **tekrar deneme işe yaramaz** — yeniden OAuth consent akışı tetiklenmeli [LIKELY, Nango/GitHub issue kaynakları]. AgencyOS tek operatörlü olduğu için bu, çok kullanıcılı bir "hesap bağlantısı koptu" bildirim sistemi değil, tek bir admin-only banter/uyarı yeterli: "Gmail bağlantısı kesildi, yeniden bağlan."

**Fail-closed kural:** Refresh başarısız olursa otomatik gönderim/taslak akışı durur, HITL kapısı bypass edilmez — asla "bağlantı koptu, o zaman direkt SMTP'ye düş" gibi bir gizli fallback açılmamalı.

## 8. AgencyOS'a entegrasyon (mevcut dosya yollarıyla)

| Mevcut yapı | Değişiklik/ekleme |
|---|---|
| `src/lib/outreach/email.ts` (`markMessageSent`) | Kanal `whatsapp/instagram/linkedin/phone/x` için AYNEN kalır (manuel-dispatch). `channel==='email'` için yeni bir fonksiyon (örn. `sendViaGmail`) eklenir; `markMessageSent`'in idempotent-check desenini tekrar kullanır |
| `src/lib/coldEmail.ts`, `coldEmailTemplates.ts` | Değişmez — ürettiği subject+body+KVKK footer, Gmail MIME `raw` payload'ının girdisi olur |
| `outreach_messages` (migration 010, genişletme 022) | Status enum'da (`draft/approved/sent/replied/failed`) zaten `replied`/`failed` var — **şema bunu bekliyormuş gibi tasarlanmış**, sadece dolduran kod eksik. Yeni migration gerekli: `gmail_message_id`, `gmail_thread_id`, `gmail_history_id` kolonları |
| `src/lib/outreach/sequences.ts` (`scheduleFollowUp`, `processDueSequences`) | Mekanizma değişmez; sadece cron'un ürettiği `agent_task` artık L1'de "taslak oluştur", L2'de "onaya sun" anlamına gelir |
| `src/lib/brain/permissions.ts`, `active.ts` (HITL + scope sınıflandırma) | Gerçek Gmail gönderimi en az "external" (sistem dışına çıkıyor), fiilen "write" (lead/outreach durumunu değiştiriyor) scope'unda sınıflandırılmalı — mevcut `approval_requests`/digest-lock/TTL mekanizması aynen kullanılır, paralel bir onay sistemi icat edilmez |
| `src/lib/skills/catalog.ts` / `registry.ts` | `outreach.gmail_send_draft`, `outreach.gmail_check_replies` gibi yeni skill kayıtları + gerçek handler'lar (bugün ~30 skill kataloğunda sadece 3'ü wired) |
| `src/app/api/cron/daily-scan/route.ts` (desen) | Yeni `src/app/api/cron/gmail-sync/route.ts` — `history.list` poll, aynı `CRON_SECRET` bearer deseni |
| `.env.example` | Yeni: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`. Refresh token bir env değişkeni DEĞİL, DB'de saklanmalı (tek operatörün kişisel OAuth grant'i, build-time secret değil) — bu repoda kullanıcı-seviyeli OAuth token saklama için mevcut bir konvansiyon yok, mimari karar gerekiyor [ASSUMPTION] |
| `package.json` | `googleapis` (Google'ın resmi Node istemcisi) yeni bağımlılık — repo standard-library veya mevcut çözümle karşılanamıyor, ekleme gerekçeli |
| Uyum/KVKK footer (migration 018, `buildComplianceFooter`) | Değişmez; RFC 8058 one-click-unsubscribe header'ı iyi-pratik olarak eklenebilir ama Google'ın "bulk sender" kuralları teknik olarak günde 5.000+ eşiğinde tetikleniyor — Cem'in hacmi çok altında, bu yüzden **zorunlu değil, iyi-pratik** [LIKELY] |
| Görev/Alışkanlık modülü | Dokunulmuyor — tamamen ayrı LIFE DB yüzeyi, bu entegrasyon hiçbir şekilde temas etmiyor |

## 9. MVP / V1 / V2 ayrımı

- **MVP (L1):** OAuth bağlantı akışı (tek operatör, tek Gmail hesabı) + `drafts.create` — `coldEmail.ts` çıktısı MIME'a çevrilip operatörün Gmail Taslaklar klasörüne düşer. Kod hiçbir zaman gönderme uç noktasını çağırmaz. Gerekenler: `googleapis` bağımlılığı, OAuth client/secret, token saklama tablosu, `outreach_messages`'a `gmail_message_id`/`gmail_thread_id` kolonları (kullanılmasa bile ileride eşleşme için).
- **V1:** L2 (in-app onay+gönder, Brain v2 HITL üzerinden) + History-API polling ile yanıt tespiti (`status→'replied'`, `leads.status→'responded'` — bu değer zaten pipeline enum'unda mevcut) + bounce sınıflandırma dalı (`status→'failed'`, ilgili `follow_up_sequences` adımlarını durdur).
- **V2 (opsiyonel, gerekirse):** Watch+Pub/Sub push (yalnız poll gecikmesi gerçek bir sorun olursa); L3 önceden-onaylı follow-up (TTL+günlük tavan); ek dosya/portfolyo eki (portfolyo-eşleştirme özelliği hazır olduğunda); Gmail etiketleme; Reply Intelligence (ayrı doküman/özellik — bu doküman kapsamında değil).

## 10. Açık sorular / doğrulanamayanlar

- `users.watch` için gereken minimum scope (`gmail.readonly` yeterli mi, yoksa daha geniş bir scope mi istiyor) bağımsız olarak resmi per-method tablo üzerinden doğrulanmadı — implementasyon öncesi kontrol edilmeli.
- RFC 8058 one-click-unsubscribe'ın Cem'in hacminde (günde muhtemelen <20 e-posta, Google'ın 5.000/gün bulk-sender eşiğinin çok altında) yasal/pratik olarak zorunlu mu yoksa sadece iyi-pratik mi olduğu netleştirilmedi — bu dokümanda "iyi pratik, zorunlu değil" varsayımıyla işlendi.
- Tek operatörün OAuth refresh token'ının nerede/nasıl saklanacağı (yeni bir DB tablosu mu, mevcut bir tabloya kolon mu, şifreli mi) mimari bir karar gerektiriyor; bu repo'da kullanıcı-seviyeli OAuth grant saklama emsali yok (Apollo/Firecrawl/SerpAPI hepsi statik API key, OAuth değil).
- TR ticari elektronik ileti mevzuatının Gmail üzerinden gönderilen mesajlara özel bir farkı olup olmadığı (kanal fark etmeksizin aynı kural rejimi olduğu varsayılıyor) — paylaşılan bağlamda zaten profesyonel hukuk incelemesi gerektiği not edilmişti, bu doküman o notu değiştirmiyor.
- Bounce/DSN header parsing'inin farklı alıcı mail sunucularında (Outlook/Microsoft 365, kurumsal mail geçitleri) ne kadar tutarlı biçimlendiği bağımsız test edilmedi — yalnız Gmail-tarafı davranış doğrulandı.
