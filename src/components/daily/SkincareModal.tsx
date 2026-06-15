"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { getSkincarePackages, takeSkincarePackage } from '@/app/actions/skincareActions';
import { toggleTemplateTask } from '@/app/actions/taskActions';
import { fireTaskConfetti } from '@/lib/confetti';
import { cn } from '@/utils/cn';

interface SkincarePackage {
  id: string;
  title: string;
  subtitle: string;
  items: string[];
  is_active: boolean;
  sort_order: number;
}

interface SkincareModalProps {
  isOpen: boolean;
  onClose: () => void;
  completedPackageIds: string[];
  onPackageTaken: (packageId: string) => void;
  templateId: string;
}

export function SkincareModal({ 
  isOpen, 
  onClose, 
  completedPackageIds, 
  onPackageTaken,
  templateId 
}: SkincareModalProps) {
  const [packages, setPackages] = useState<SkincarePackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      const fetchPackages = async () => {
        setIsLoading(true);
        const data = await getSkincarePackages();
        setPackages(data);
        setIsLoading(false);
      };
      fetchPackages();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTake = (packageId: string) => {
    onPackageTaken(packageId);

    startTransition(async () => {
      const result = await takeSkincarePackage(packageId, templateId);
      if (!result.success) {
        console.error('[SkincareModal] Failed to log package:', result.error);
      }
    });
  };

  const handleFinalize = async () => {
    startTransition(async () => {
      await toggleTemplateTask(templateId, false);
      fireTaskConfetti();
      onClose();
    });
  };

  const allPackagesCompleted = packages.length > 0 && packages.every(p => completedPackageIds.includes(p.id));

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-[#141414] border border-[#2a2a2a] rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a] bg-[#0a0a0a]">
          <div>
            <h2 className="text-xl font-bold text-white">CİLT BAKIMI</h2>
            <p className="text-xs font-medium tracking-widest uppercase text-[#666666] mt-1">Günün Rutinleri</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#ff453a]/10 text-[#666666] hover:text-[#ff453a] transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {allPackagesCompleted && (
          <div className="p-6 pb-0 animate-in slide-in-from-top duration-500">
             <div className="bg-[#30d158] border border-[#30d158]/30 rounded-xl py-3 px-4 text-[#30d158] text-sm font-semibold text-center flex items-center justify-center gap-2">
               <span>✨</span>
               <span>TÜM RUTİNLER TAMAMLANDI</span>
             </div>
          </div>
        )}

        <div className="p-6 flex flex-col gap-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-[#6366f1]/20 border-t-[#6366f1] rounded-full animate-spin" />
              <span className="text-xs text-[#666666] animate-pulse">Veriler yükleniyor...</span>
            </div>
          ) : (
            packages.map(pkg => {
              const isTaken = completedPackageIds.includes(pkg.id);
              return (
                <div 
                  key={pkg.id}
                  className={cn(
                    "border border-[#222222] rounded-2xl px-4 py-4 bg-[#0a0a0a] transition-all duration-300",
                    isTaken && "opacity-80"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className={cn(
                        "text-base font-semibold transition-colors",
                        isTaken ? "text-[#666666] line-through" : "text-white"
                      )}>
                        {pkg.title}
                      </h3>
                      {pkg.subtitle && (
                        <p className="text-xs text-[#666666] mt-0.5">{pkg.subtitle}</p>
                      )}
                      
                      <ul className="mt-3 space-y-1.5 list-disc pl-4">
                        {pkg.items.map((item, idx) => (
                          <li key={idx} className="text-xs text-[#888888] leading-relaxed">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => handleTake(pkg.id)}
                      disabled={isTaken || isPending}
                      className={cn(
                        "shrink-0 transition-all duration-300",
                        isTaken 
                          ? "bg-[#30d158]/15 border border-[#30d158]/30 text-[#30d158] text-xs px-4 py-2 rounded-xl cursor-default" 
                          : "bg-[#1c1c1c] border border-[#2a2a2a] text-[#888888] text-xs px-4 py-2 rounded-xl hover:border-[#333333]"
                      )}
                    >
                      {isTaken ? '✓ ALINDI' : 'ALDIM'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-6 pt-2 border-t border-[#2a2a2a] bg-[#141414] rounded-b-3xl">
          {allPackagesCompleted && (
            <button
              onClick={handleFinalize}
              disabled={isPending}
              className="w-full py-3 bg-[#6366f1] text-white text-sm font-semibold rounded-2xl hover:bg-[#4f46e5] transition-colors shadow-lg shadow-[#6366f1]/30 active:scale-95 disabled:opacity-50 animate-in fade-in"
            >
              TAMAMLANDI — KAPAT
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
