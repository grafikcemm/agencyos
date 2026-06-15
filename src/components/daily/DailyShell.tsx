import React from "react";

export function DailyShell({ children }: { children: React.ReactNode }) {
  return (
    <div 
      className="min-h-screen w-full px-4 md:px-10 py-6 md:py-8"
      style={{ backgroundColor: "#0A0A0B" }}
    >
      <div 
        className="w-full max-w-[860px] min-w-0 mx-auto flex flex-col gap-4"
      >
        {children}
      </div>
    </div>
  );
}
