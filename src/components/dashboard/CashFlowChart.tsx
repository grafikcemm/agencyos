"use client"

import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

export interface CashFlowPoint {
  name: string
  inflow: number
  outflow: number
}

// Recharts'ı ana dashboard bundle'ından ayırmak için izole edildi — DashboardClient
// bunu `dynamic(() => import('./CashFlowChart'), { ssr: false })` ile lazy yükler (M11).
export default function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data}>
        {/* SVG <stop>/tick render as presentation attributes where CSS var()
            does NOT resolve, so these mirror the globals.css dark token hexes:
            success #30d158, info #64d2ff, text-muted #999999. */}
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#30d158" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#30d158" stopOpacity={0.15} />
          </linearGradient>
          <linearGradient id="barGradSecondary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#64d2ff" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#64d2ff" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#999999', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', fontSize: '10px', color: 'var(--text-primary)' }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [
            `₺${Number(value).toLocaleString('tr-TR')}`,
            name === 'inflow' ? 'Giriş' : 'Çıkış',
          ]}
        />
        <Bar dataKey="inflow" fill="url(#barGrad)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
