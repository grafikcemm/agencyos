import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Bu proje, üst dizininde (…\scratch) başka lockfile'lar bulunan bir klasörde
  // duruyor. Next/Turbopack workspace kökünü otomatik tespit ederken üst dizini
  // seçip "Can't resolve 'tailwindcss'" + OOM ile çöküyordu. Kökü projeye sabitle.
  turbopack: {
    root: path.join(__dirname),
  },
  // outputFileTracingRoot, prod build dosya izlemeyi de aynı köke sabitler.
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    return [
      // Eski/legacy nav route'ları — kırık bookmark'ları geçerli yüzeylere yönlendir.
      { source: "/map", destination: "/harita", permanent: true },
      { source: "/playbooks", destination: "/harita", permanent: true },
      // Çift Lead Radar yüzeyi: /radar kaldırıldı, /harita kanonik kaldı.
      { source: "/radar", destination: "/harita", permanent: true },
    ];
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
