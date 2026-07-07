// Aktif Görevler yüzeyinin değişmez ilkeleri.
//
// STATİK bilinçli tercih: düzenlenebilir kural sistemi kurmak "yeni sistem/araç
// inşa etmek yasak" ilkesinin (Kural 2) ihlali olurdu. İçerik değişecekse bu
// dosya elle düzenlenir — UI'dan CRUD YOK.
export interface TaskRule {
  n: number
  text: string
  /** 1 numaralı kural görsel olarak vurgulanır (en önemli çapa). */
  emphasis?: boolean
}

export const TASK_RULES: TaskRule[] = [
  {
    n: 1,
    emphasis: true,
    text: 'Aktif görevler dışında Gelişim + Alışkanlıklar’a uyum sürer. İkisi sistemin parçası, ayrı değil — görevler de onların içinde.',
  },
  {
    n: 2,
    text: 'Yeni sistem/araç inşa etmek yasak. Her fikir tek testten geçer: “Aktif fazın çıktısını hızlandırıyor mu?” Hayırsa nota yazılır (Bekleyen), yapılmaz.',
  },
  {
    n: 3,
    text: 'Sağlık (spor + beslenme) planın dışında değil, altında. Rutinleri — özellikle spor + beslenme — aksatma.',
  },
  {
    n: 4,
    text: 'Okula full odak, hocalarla full iletişim. Bitirme Çalışması: birinci öncelik, ikinci şans yok. Haziran: mezuniyet, GPA ≥ 2.00 ile kapanış.',
  },
]
