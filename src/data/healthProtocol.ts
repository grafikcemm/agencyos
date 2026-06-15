export const PROTOCOL_START_DATE = '2026-06-01';

export type HealthPhase = 'attack' | 'control' | 'maintenance';

export const PHASE_LABELS: Record<HealthPhase, string> = {
  attack: 'Saldırı Modu',
  control: 'Kontrol Modu',
  maintenance: 'Kalıcı Koruma',
};

export function getProtocolDay(today: string): number {
  const start = new Date(PROTOCOL_START_DATE);
  const current = new Date(today);
  const diff = Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1; // Can be <= 0 if before start date
}

export function getPhase(day: number): HealthPhase {
  if (day <= 14) return 'attack';
  if (day <= 30) return 'control';
  return 'maintenance';
}

export function getProtocolWeek(day: number): number {
  return Math.ceil(Math.max(day, 1) / 7);
}

export type ShampooEntry = {
  product: string;
  wait?: string;
  instruction: string;
  isRequired: boolean;
};

// dow: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
export function getTodayShampoo(
  phase: HealthPhase,
  dow: number,
  protocolWeek: number,
): ShampooEntry | null {
  if (phase === 'attack') {
    if (dow === 1) return { product: 'Konazol', wait: '3–5 dk', instruction: 'Saçlı deri + saç çizgisi, parmak uçlarıyla masaj, ılık suyla durula. Tırnakla kazıma yok.', isRequired: true };
    if (dow === 3) return { product: 'Sebamed Günlük', instruction: 'Normal yıka, bekletme yok. Saç derisini yormadan temizle.', isRequired: true };
    if (dow === 5) return { product: 'Ducray Kelual DS', wait: '~3 dk', instruction: 'Saç derisine uygula, ılık suyla durula.', isRequired: true };
    if (dow === 0) return { product: 'Sebamed Günlük', instruction: 'Spor/ter sonrası gerekirse kullan.', isRequired: false };
    return null; // Sal, Prş, Cmt — programlanmış yıkama yok
  }
  if (phase === 'control') {
    if (dow === 1) return { product: 'Konazol', wait: '3–5 dk', instruction: 'Saçlı deriye uygula, beklet, ılık suyla durula.', isRequired: true };
    if (dow === 4) return { product: 'Ducray Kelual DS', wait: '~3 dk', instruction: 'Saç derisine uygula, ılık suyla durula.', isRequired: true };
    return { product: 'Sebamed Günlük', instruction: 'Normal yıka.', isRequired: false };
  }
  // Maintenance: çift hafta Ducray, tek hafta Konazol
  const isEvenWeek = protocolWeek % 2 === 0;
  if (dow === 1) {
    return isEvenWeek
      ? { product: 'Ducray Kelual DS', wait: '~3 dk', instruction: 'Haftada 1 kez koruma.', isRequired: true }
      : { product: 'Konazol', wait: '3–5 dk', instruction: 'Haftada 1 kez koruma.', isRequired: true };
  }
  return { product: 'Sebamed Günlük', instruction: 'Normal yıka.', isRequired: false };
}

// Mon/Tue/Thu/Sat = antrenman günü
export const WORKOUT_DAYS = new Set([1, 2, 4, 6]);

export function getTodayFocusLine(phase: HealthPhase, shampoo: ShampooEntry | null): string {
  const shampooPart = shampoo?.isRequired ? shampoo.product : 'Sebamed (gerekirse)';
  if (phase === 'attack') return `${shampooPart} + 150g protein + sıfır kaçak`;
  if (phase === 'control') return `${shampooPart} + 150g protein + kontrol modu`;
  return `${shampooPart} + protein + koruma modu`;
}
