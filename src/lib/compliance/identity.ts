/** MERSİS numarası 16 rakamdan oluşur. Placeholder/uydurma değerler pilot
 * kapısını açamaz; hukuki kimlik her zaman resmî kaynaktan gelmelidir. */
export function isPlausibleMersis(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').replace(/\s+/g, '')
  return /^\d{16}$/.test(normalized) && !/^(\d)\1{15}$/.test(normalized)
}
