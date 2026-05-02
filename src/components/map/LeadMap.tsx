"use client"

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
// Harita motoru başladığında Leaflet'in default ikon sorunlarını düzelt
const fixLeafletIcons = () => {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  })
}

// Custom Marker İkonu
const createCustomIcon = (status: string, priority?: string) => {
  const accentColor = '#E8440A'
  const successColor = '#1D9E75'
  const mutedColor = '#737373'

  if (priority === 'high') {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="width: 16px; height: 16px; background-color: ${accentColor}; border-radius: 50%; box-shadow: 0 0 12px ${accentColor}; border: 2px solid #fff;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }

  const color = status === 'new' ? '#378ADD' : 
                status === 'contacted' ? '#BA7517' : 
                status === 'converted' ? successColor : mutedColor
                
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="width: 12px; height: 12px; background-color: ${color}; border-radius: 50%; box-shadow: 0 0 8px ${color}; border: 1px solid #fff;"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  })
}

export default function LeadMap({ leads }: { leads: any[] }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    fixLeafletIcons()
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="w-full h-full relative">
      <MapContainer 
        center={[38.96, 35.24]} 
        zoom={5.5} 
        scrollWheelZoom={true}
        className="w-full h-full bg-[var(--bg-base)]"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {leads.map(lead => {
          if (!lead.latitude || !lead.longitude) return null
          return (
            <Marker 
              key={lead.id} 
              position={[lead.latitude, lead.longitude]} 
              icon={createCustomIcon(lead.status, lead.priority)}
            >
              <Popup className="custom-popup">
                <div className="p-1 space-y-3 min-w-[180px]">
                  <div>
                    <div className="font-bold text-[14px] text-[var(--text-primary)] mb-1">{lead.business_name}</div>
                    <div className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold tracking-wider">
                      {lead.sector} • {lead.city}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-y border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Potansiyel Skor</span>
                    <span className="text-[12px] font-bold text-[var(--accent)]">{lead.score || lead.potential_score || 0}</span>
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 bg-[var(--accent)] text-white text-[10px] font-bold py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors">
                      DETAY
                    </button>
                    <button className="flex-1 border border-[var(--border-subtle)] text-[var(--text-primary)] text-[10px] font-bold py-2 rounded-lg hover:bg-[var(--bg-surface)] transition-colors">
                      JARVIS
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
