"use client";

import React, { useState } from "react";
import { cn } from "@/utils/cn";
import { ChevronDown, ChevronUp, BookOpen, Film, Layers, FileText } from "lucide-react";

export function GrafikcemPlan() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"roadmap" | "pdf_skeleton" | "reels_template">("roadmap");

  const weeks = [
    {
      week: 1,
      title: "Marka Konumlandırma & Temeller",
      goal: "Grafikcem Creative Studio markasının nişini belirlemek, hizmet paketlerini tasarlamak ve kimliğini netleştirmek.",
      output: "Branding Planı PDF Taslağı + Fiyatlandırma Politikası",
      reels: "Neden standart bir grafik tasarımcıyla çalışmamalısın? (Tasarımcı vs. Stratejist farkı)",
      carousel: "Grafik Tasarımın öldüğü ve stratejik tasarımın başladığı o ince çizgi.",
      channels: "Instagram, LinkedIn, X",
    },
    {
      week: 2,
      title: "Süreç Otomasyonu & n8n Entegrasyonu",
      goal: "Bozma Creative ve Grafikcem operasyonlarını AI ve n8n ile bağlayıp, Cem'in tasarım dışındaki operasyonel yükünü sıfırlamak.",
      output: "Otomatik Müşteri Onboarding ve Revizyon n8n Workflow'u",
      reels: "Yapay zeka işimi elimden mi alacak? Hayır, yapay zekayı kullanan bir tasarımcı alacak.",
      carousel: "Tasarım süreçlerini %80 hızlandıran 3 gizli n8n otomasyonu.",
      channels: "LinkedIn, TikTok, YouTube",
    },
    {
      week: 3,
      title: "Küresel Pazara Açılış & İngilizce İçerik",
      goal: "Yerel pazarın düşük bütçeli ve kaprisli yapısından kurtulmak; dolarla fatura kesebilecek küresel bir sistem kurmak.",
      output: "İngilizce Soğuk Erişim (Cold Email/DM) Şablonları & Behance Güncellemesi",
      reels: "How I design for global clients without speaking perfect English (AI/Grammar tools)",
      carousel: "Local pazardan Global pazara geçiş yaparken yaptığım 3 ölümcül hata.",
      channels: "X, Behance, LinkedIn",
    },
    {
      week: 4,
      title: "Haftalık Üretim Sistemi & Ölçeklenme",
      goal: "Haftada sadece 4 saat harcayarak 3 platformda (LinkedIn, Instagram, X) aktif olabilecek bir içerik fabrikası kurmak.",
      output: "İçerik Üretim Takvimi + Teklif Paketi Şablonu",
      reels: "Haftada 4 saat çalışarak 3 sosyal medya platformunu nasıl domine ediyorum? (Sistem tanıtımı)",
      carousel: "İçerik fabrikası sistemi: 1 fikir, 3 format, 5 platform.",
      channels: "Tüm Kanallar",
    },
  ];

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden mb-6">
      {/* Header Banner Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl shrink-0">🎨</span>
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-bold block">
              GRAFİKCEM CREATIVE STUDIO
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
              Marka Planlama ve Üretim Yol Haritası
            </span>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/30 px-5 py-5">
          {/* Internal Tabs */}
          <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-3 mb-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab("roadmap")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider flex items-center gap-2 border transition-all shrink-0",
                activeTab === "roadmap"
                  ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]"
                  : "bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
            >
              <Layers size={12} />
              4 HAFTALIK YOL HARİTASI
            </button>
            <button
              onClick={() => setActiveTab("pdf_skeleton")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider flex items-center gap-2 border transition-all shrink-0",
                activeTab === "pdf_skeleton"
                  ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]"
                  : "bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
            >
              <FileText size={12} />
              PDF İÇERİK İSKELETİ
            </button>
            <button
              onClick={() => setActiveTab("reels_template")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider flex items-center gap-2 border transition-all shrink-0",
                activeTab === "reels_template"
                  ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]"
                  : "bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
            >
              <Film size={12} />
              REELS YAYIN ŞABLONU
            </button>
          </div>

          {/* ROADMAP TAB */}
          {activeTab === "roadmap" && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-muted)] italic leading-relaxed">
                * Grafikcem Creative Studio&apos;yu sıfırdan kurmak ve küresel pazarda ölçeklemek için 4 haftalık taktiksel yol haritası.
              </p>
              <div className="grid grid-cols-1 gap-4">
                {weeks.map((w) => (
                  <div
                    key={w.week}
                    className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--bg-surface)]"
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="text-[10px] font-mono bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-2 py-0.5 rounded text-[var(--accent)] font-bold">
                        HAFTA {w.week}
                      </span>
                      <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-tight">
                        {w.title}
                      </h4>
                    </div>

                    <div className="space-y-2.5 mt-3 text-[11px] leading-relaxed">
                      <div>
                        <span className="text-[var(--text-muted)] font-mono uppercase font-bold text-[9px] tracking-wider block">HEDEF</span>
                        <span className="text-[var(--text-secondary)]">{w.goal}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-[var(--text-muted)] font-mono uppercase font-bold text-[9px] tracking-wider block">HAFTALIK ÇIKTI</span>
                          <span className="text-[var(--text-primary)] font-medium">{w.output}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)] font-mono uppercase font-bold text-[9px] tracking-wider block">REELS (İÇERİK)</span>
                          <span className="text-[var(--text-primary)] font-medium">&quot;{w.reels}&quot;</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <span className="text-[var(--text-muted)] font-mono uppercase font-bold text-[9px] tracking-wider block">CAROUSEL DÖNÜŞÜM</span>
                          <span className="text-[var(--text-primary)] font-medium">&quot;{w.carousel}&quot;</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)] font-mono uppercase font-bold text-[9px] tracking-wider block">DAĞITIM KANALLARI</span>
                          <span className="text-[var(--accent)] font-mono font-bold tracking-tight">{w.channels}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PDF SKELETON TAB */}
          {activeTab === "pdf_skeleton" && (
            <div className="space-y-4 text-xs">
              <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--bg-surface)] leading-relaxed space-y-4">
                <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
                  <BookOpen size={14} className="text-[var(--accent)]" />
                  <h4 className="font-mono font-bold text-[var(--text-primary)] text-[11px] tracking-wider">
                    MARKALAŞMA YOL HARİTASI PDF SKELETİ
                  </h4>
                </div>

                <div className="space-y-3.5 text-[11px]">
                  <div>
                    <span className="text-[var(--accent)] font-mono font-bold block mb-1">1. Bölüm: Marka Konumlandırma & Niş</span>
                    <p className="text-[var(--text-muted)]">
                      Cem&apos;in Grafikcem Creative Studio altındaki konumlandırması. &quot;Piksel itici grafik tasarımcı&quot; değil, &quot;Milyon dolarlık markalara yapay zeka kaldıraçlı görsel büyüme stratejisti&quot;.
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--accent)] font-mono font-bold block mb-1">2. Bölüm: Hizmetler & Çözümler</span>
                    <p className="text-[var(--text-muted)]">
                      - Stratejik UI/UX Tasarımı (Landing Page & Mobil Arayüz)<br />
                      - AI Destekli Marka Kimliği & Görsel Konsept Tasarımı<br />
                      - n8n Entegrasyonlu Müşteri Portalı ve Tasarım Operasyon Sistemi (Bozma Creative kaldıracı)
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--accent)] font-mono font-bold block mb-1">3. Bölüm: İçerik Sütunları (Content Pillars)</span>
                    <p className="text-[var(--text-muted)]">
                      - **AI Kaldıracı**: n8n ve yapay zekanın tasarım süreçlerindeki gücü.<br />
                      - **Sınır ve Disiplin**: Müşteri yönetimindeki katı kurallar, tasarımlardaki estetik sadeleşme.<br />
                      - **Portfolyo Vaka Analizleri**: Öncesi/sonrası gerçek dönüşüm oranları.
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--accent)] font-mono font-bold block mb-1">4. Bölüm: Fiyatlandırma & Teklif Paketleri</span>
                    <p className="text-[var(--text-muted)]">
                      - **Bronze**: Aylık 2.000$ (Sadece UI/UX Revizyonlar ve Mini Destek)<br />
                      - **Silver (Tavsiye Edilen)**: Aylık 4.500$ (Abonelik Usulü Sınırsız Tasarım & AI Desteği)<br />
                      - **Gold**: Aylık 8.000$ (Tam Sistem Kurulumu, UI/UX Yenileme + n8n Otomasyon Portalı Entegrasyonu)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* REELS TEMPLATE TAB */}
          {activeTab === "reels_template" && (
            <div className="space-y-4 text-xs">
              <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--bg-surface)] leading-relaxed space-y-4">
                <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
                  <Film size={14} className="text-[var(--accent)]" />
                  <h4 className="font-mono font-bold text-[var(--text-primary)] text-[11px] tracking-wider">
                    ACIMASIZ VE VURUCU REELS FORMATI
                  </h4>
                </div>

                <div className="space-y-3.5 text-[11px]">
                  <div>
                    <span className="text-[var(--danger)] font-mono font-bold block mb-1">🔥 HOOK (İlk 3 Saniye)</span>
                    <p className="text-[var(--text-muted)] italic">
                      &quot;Gece yarısı müşterinin attığı mesaja cevap veriyorsan, profesyonel değil tasmali bir kölesin.&quot;
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--accent)] font-mono font-bold block mb-1">📸 SAHNE / B-ROLL PLANI</span>
                    <p className="text-[var(--text-muted)]">
                      Cem karanlık temalı odada, sadece klavye ışıkları yanarken vibe-coding yapıyor veya n8n ekranındaki karmaşık nodeları gösteriyor. Kamera yavaşça yandan yaklaşıyor (B-roll).
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--info)] font-mono font-bold block mb-1">💡 DEĞER SUNUMU & GÖVDE</span>
                    <p className="text-[var(--text-muted)]">
                      &quot;Müşteriler senin tasarım yeteneğine değil, onların sorununu ne kadar hızlı ve zahmetsizce çözdüğüne para öder. n8n otomasyonu kurup revizyon portalı entegre etmemin nedeni bu. Süreç hızlı, sınırlar katı, çıktılar çelik gibi net.&quot;
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--success)] font-mono font-bold block mb-1">🎯 CTA (Aksiyon Çağrısı)</span>
                    <p className="text-[var(--text-muted)] italic">
                      &quot;Tasarım süreçlerini otomatikleştirip dolarla fatura kesmek istiyorsan profilimdeki &apos;Yol Haritası PDF&apos;ini ücretsiz indir.&quot;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
