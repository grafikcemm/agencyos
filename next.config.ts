import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
