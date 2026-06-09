// `server-only` paketinin test (node) ortamı için no-op stub'ı.
// Üretimde gerçek paket client component'lerde import edilirse build'i kırar;
// vitest node ortamında o guard'a gerek yok — boş modül yeterli.
export {}
