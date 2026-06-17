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
        className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">CİLT BAKIMI</h2>
            <p className="text-xs font-medium tracking-widest uppercase text-[var(--text-muted)] mt-1">Günün Rutinleri</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--danger)]/10 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {allPackagesCompleted && (
          <div className="p-6 pb-0 animate-in slide-in-from-top duration-500">
             <div className="bg-[var(--success)] border border-[var(--success)]/30 rounded-xl py-3 px-4 text-[var(--success)] text-sm font-semibold text-center flex items-center justify-center gap-2">
               <span>✨</span>
               <span>TÜM RUTİNLER TAMAMLANDI</span>
             </div>
          </div>
        )}

        <div className="p-6 flex flex-col gap-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-[var(--info)]/20 border-t-[var(--info)] rounded-full animate-spin" />
              <span className="text-xs text-[var(--text-muted)] animate-pulse">Veriler yükleniyor...</span>
            </div>
          ) : (
            packages.map(pkg => {
              const isTaken = completedPackageIds.includes(pkg.id);
              return (
                <div 
                  key={pkg.id}
                  className={cn(
                    "border border-[var(--border-subtle)] rounded-2xl px-4 py-4 bg-[var(--bg-base)] transition-all duration-300",
                    isTaken && "opacity-80"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className={cn(
                        "text-base font-semibold transition-colors",
                        isTaken ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"
                      )}>
                        {pkg.title}
                      </h3>
                      {pkg.subtitle && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{pkg.subtitle}</p>
                      )}

                      <ul className="mt-3 space-y-1.5 list-disc pl-4">
                        {pkg.items.map((item, idx) => (
                          <li key={idx} className="text-xs text-[var(--text-muted)] leading-relaxed">
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
                          ? "bg-[var(--success)]/15 border border-[var(--success)]/30 text-[var(--success)] text-xs px-4 py-2 rounded-xl cursor-default"
                          : "bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs px-4 py-2 rounded-xl hover:border-[var(--border-strong)]"
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

        <div className="p-6 pt-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-b-3xl">
          {allPackagesCompleted && (
            <button
              onClick={handleFinalize}
              disabled={isPending}
              className="w-full py-3 bg-[var(--accent)] text-white text-sm font-semibold rounded-2xl hover:bg-[var(--accent-hover)] transition-colors shadow-soft active:scale-95 disabled:opacity-50 animate-in fade-in"
            >
              TAMAMLANDI — KAPAT
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
