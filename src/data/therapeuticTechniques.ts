// ─────────────────────────────────────────────────────────────────────────────
// Terapötik teknik bilgi tabanı — masaüstündeki manüellerden (ACT/DBT/MI/GROW/
// pozitif psikoloji / sınır-girişkenlik) damıtılmış, Cem'in persona desenlerine
// (kaygılı bağlanma, ruminasyon, öz-değer, erteleme, kıyas) göre uyarlanmış.
//
// Runtime'da durum-eşleşmeli seçilir (techniqueRetrieval) ve mentor prompt'una
// enjekte edilir → mentor genel çerçeveyi değil, O ANA uygun SOMUT tekniği uygular.
// Tamamen lokal veri + lokal eşleşme; hiçbir şey dışarı çıkmaz, anahtar gerekmez.
// ─────────────────────────────────────────────────────────────────────────────

export interface TechniqueCard {
  id: string
  title: string
  /** Eşleşme için anahtar kelime/durum (normalize edilmiş, ASCII-Türkçe). */
  triggers: string[]
  /** Mentora "bunu şu an uygula" talimatı (yanıta sızdırılmaz, davranışı yönlendirir). */
  guidance: string
}

export const THERAPEUTIC_TECHNIQUES: TechniqueCard[] = [
  {
    id: 'rumination_defusion',
    title: 'Ruminasyon / takılıp kalma (ACT defüzyon)',
    triggers: ['surekli dusunuyorum', 'aklimdan cikmiyor', 'takildim', 'kafam dolu', 'dusunmeden duramiyorum', 'zihnim', 'kuruntu', 'overthinking', 'kafama takti'],
    guidance: 'ACT defüzyon uygula: düşünceyi gerçek/emir sanmaktan ayır — "Bu bir düşünce, gerçeğin kendisi değil" çerçevesi. "Aklım bana ... diyor" diye etiketlemesini öner. Bastırmaya/çözmeye çalışma; düşünceye yer aç, dikkati değere-bağlı tek somut eyleme çevir.',
  },
  {
    id: 'breakup_letgo',
    title: 'Ayrılık / eski ilişki / yalnızlık',
    triggers: ['eski sevgili', 'ayrilik', 'eski', 'yalnizlik', 'yalniz hissediyorum', 'onu ozledim', 'hesabina baktim', 'geri donmek', 'unutamiyorum', 'eski kiz'],
    guidance: 'Yargılama yok, normalize et: 1-2 ay içinde anıların gelmesi normal, "atlatamadım" demek değil. Geçmişe bakma dürtüsünü (hesabına bakma) iradeyle değil küçük yerine-koyma ile azalt. Dikkati Cem\'in kendi değerlerine ve bugünkü rutinine çevir. Eski partneri idealize ettiren düşünceleri defüze et. "Seni istemeyen birini zihninde taşıma" çerçevesini şefkatli ver, suçlamadan.',
  },
  {
    id: 'distress_tip',
    title: 'Yüksek sıkıntı / dağılma / kriz anı (DBT TIP-STOP)',
    triggers: ['dagildim', 'cok kotuyum', 'panik', 'bunaldim', 'patlayacagim', 'dayanamiyorum', 'krizdeyim', 'cok stresli', 'nefes alamiyorum'],
    guidance: 'ÖNCE regülasyon, sonra problem çözme. DBT STOP: Dur → bir adım geri → gözlemle → bilinçli devam. Hızlı sakinleşme: yavaş uzun nefes (4 içeri / 6 dışarı), soğuk su, kısa fiziksel mola. Bu anda çözüm/karar dayatma; "şu an dalgayı sür, karar sonra" de. Sakinleşince tek küçük adıma in.',
  },
  {
    id: 'procrastination_activation',
    title: 'Erteleme / bitkinlik / "ölü toprağı" (davranışsal aktivasyon)',
    triggers: ['erteliyorum', 'baslayamiyorum', 'motivasyonum yok', 'bitkin', 'yorgun', 'olu topragi', 'istek yok', 'uyusuk', 'yapamiyorum', 'gaza gelemiyorum', 'tembellik'],
    guidance: 'Motivasyonu bekleme — eylem motivasyonu DOĞURUR (davranışsal aktivasyon). Görevi gülünç derecede küçült: "sadece dosyayı/uygulamayı aç, 5 dk bak". Minimum gün mantığı: spor + 1 üretim + dosyayı aç = gün kayıp değil. Suçluluk yükleme; "neden" sorusunu bıraktır, ilk mikro-adıma odakla.',
  },
  {
    id: 'self_worth',
    title: 'Öz-değer / değersizlik / yetersizlik hissi',
    triggers: ['yetersiz', 'degersiz', 'kotuyum', 'beceriksiz', 'basaramiyorum', 'ozguvenim yok', 'kendimi kotu', 'ise yaramaz', 'kendimden nefret'],
    guidance: 'Öz-değeri dış onay/performansla eşitletme. Pozitif psikoloji: somut güçlü yönleri ve son kazançları görünür kıl, say. Öz-eleştiriyi öz-şefkatle değiştir: "bir dostuna ne derdin?" Değerin sabit, performans dalgalı — ayır. Eylemle küçük bir kanıt üretmesini öner.',
  },
  {
    id: 'boundaries_assertive',
    title: 'Sınır koyma / girişkenlik / hayır diyememe',
    triggers: ['hayir diyemiyorum', 'sinir', 'kullaniliyorum', 'ezildim', 'sustum', 'cekiniyorum', 'soyleyemedim', 'onun dediği oldu', 'dominasyon', 'on odeme', 'sozlesme', 'pasif kaldim'],
    guidance: 'Girişkenliği eyleme dök: net, kısa, suçlamasız "ben dili" cümlesi hazırlat ("Bunu böyle istiyorum / bu benim için uygun değil"). İş için somut sınır: ön ödeme + sözleşme şartı. Karşı tarafın dominasyonuna izin verme — eşit masada ol. Susmak yerine o an konuşmayı, çekilmek yerine net olmayı pekiştir. "Birileri gidecek diye sınırını bırakma."',
  },
  {
    id: 'approval_seeking',
    title: 'Onay arama / kaygılı bağlanma / yapışma',
    triggers: ['onay', 'begenilmek', 'kabul gormek', 'bana kizdi mi', 'neden yazmadi', 'yapisiyorum', 'surekli ariyorum', 'merak ediyorum napiyor', 'sevilmemek'],
    guidance: 'Onay arama dürtüsünü fark ettir, beslenmesin. Kaygılı bağlanma deseni: belirsizliği felakete çevirme eğilimi — alternatif/nötr yorum üret. Değerini başkasının tepkisine bağlama. Dürtüsel mesaj/kontrol yerine "bekle ve tolere et" pratiği. Kendi hayatını/rutinini doldurmak en iyi panzehir.',
  },
  {
    id: 'comparison_income',
    title: 'Kıyaslama / gelir kaygısı / "az mı kazanıyorum"',
    triggers: ['az kazaniyorum', 'gelir', 'para yetmiyor', 'kiyasliyorum', 'baskalari daha', 'geride kaldim', 'zengin', 'yeterince degil', 'basarisizim', 'yas'],
    guidance: 'Kıyas hırsızıdır — kendi ilerleme metriğine döndür (geçen ay/yıl vs bugün). 23 yaşında 2 üniversite + iş + müşteri = nesnel ilerleme; bunu somut göster. Kaygıyı eyleme kanalize et: "daha fazla" paniği yerine TEK yüksek-kaldıraçlı adım seç. Erkek gelişiminin uzun vade olduğunu sakin perspektifle hatırlat, ama bahane olarak değil.',
  },
  {
    id: 'decision_grow',
    title: 'Karar / kafa karışıklığı / ne yapmalıyım',
    triggers: ['ne yapmaliyim', 'karar veremiyorum', 'kafam karisik', 'hangisini', 'emin degilim', 'secemiyorum', 'ne onerirsin', 'yol ayrimi'],
    guidance: 'GROW mikro-çerçevesi uygula: Hedef (ne istiyorsun, net?) → Gerçeklik (şu an eldeki durum/kısıt) → Seçenekler (2-3 yol) → İrade (ilk somut adım + ne zaman). Cem\'in kendi cevabını çıkar (öğüt dayatma); sonunda TEK adımı netleştir.',
  },
  {
    id: 'mi_ambivalence',
    title: 'İstiyorum ama yapamıyorum / çelişki (MI)',
    triggers: ['istiyorum ama', 'yapmam lazim ama', 'celiski', 'bir yandan', 'kararsizim', 'hem hem', 'bilmiyorum istiyor muyum'],
    guidance: 'Motivational Interviewing: ambivalansı normalleştir, iki yanı da duy. Çözüm dayatma; değişim konuşmasını evoke et — "Bunu yapmak senin için neyi değiştirir?", "1-10 arası ne kadar önemli, neden o kadar?". Cem kendi gerekçesini söyleyince eyleme bağla.',
  },
  {
    id: 'family_individuation',
    title: 'Aileden bağımsızlaşma / fazla ilgi / birey olma',
    triggers: ['ailem', 'annem', 'babam', 'fazla ilgi', 'bagimsiz', 'birey olmak', 'ailemden', 'mudahale'],
    guidance: 'Bağımsız birey olma değerini destekle; aile sevgisini reddetmeden sağlıklı sınır. Her zorluğa kendi göğüs germe hedefini pekiştir — küçük özerklik adımları. Suçluluk olmadan "kendi kararım" kasını çalıştır.',
  },
  {
    id: 'win_savoring',
    title: 'Başarı / iyi gün / kazanç (pozitif pekiştirme)',
    triggers: ['yaptim', 'bitirdim', 'basardim', 'iyi gun', 'oldu', 'tamamladim', 'kazandim', 'gurur'],
    guidance: 'Pozitif psikoloji savoring: kazancı geçiştirme — tadını çıkart, neyi doğru yaptığını adlandır (öz-yetkinlik pekişsin). Kısa ve içten takdir; sonra momentumu koruyacak tek sonraki adıma bağla. Abartı/şişirme yok.',
  },
]
