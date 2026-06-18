// Telegram Bot API HTML parse_mode için kaçış. Yalnızca `<`, `>`, `&` kaçılmalı
// (https://core.telegram.org/bots/api#html-style). User-derived metni <b>…</b>
// gibi etiketlerin içine koymadan ÖNCE bundan geçir — aksi halde kullanıcı metni
// parse'ı bozar veya beklenmeyen biçim üretir.
export function escapeTelegramHtml(input: string | null | undefined): string {
  if (!input) return ''
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
