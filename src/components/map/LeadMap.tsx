"use client"

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { FilterPanel } from './FilterPanel'

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
  // Yüksek öncelikli markerlar sarı/turuncu (#f59e0b)
  if (priority === 'high') {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="width: 14px; height: 14px; background-color: #f59e0b; border-radius: 50%; box-shadow: 0 0 12px #f59e0b; border: 2px solid #fff;"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    })
  }

  const color = status === 'new' ? '#06b6d4' : 
                status === 'contacted' ? '#f59e0b' : 
                status === 'converted' ? '#10b981' : '#6b7280'
                
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
      
      {/* Sol Filtre Paneli */}
      <FilterPanel />
      
      <MapContainer 
        center={[38.96, 35.24]} 
        zoom={5.5} 
        scrollWheelZoom={true}
        className="w-full h-full bg-[#050810]"
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
              <Popup className="font-mono">
                <div className="space-y-2 pb-1">
                  <div className="font-bold text-sm tracking-widest text-[var(--os-cyan)] uppercase">{lead.business_name}</div>
                  <div className="text-[10px] text-[#6b7280] flex justify-between">
                    <span>{lead.sector} / {lead.city}</span>
                    <span className="text-[#f59e0b] font-bold">{lead.potential_score} OBP</span>
                  </div>
                  <div className="pt-2 flex gap-2 w-full">
                    <button className="flex-1 bg-[#f59e0b] text-[#050810] text-[10px] font-bold py-1.5 rounded-sm">DETAY GÖR</button>
                    <button className="flex-1 border border-[#06b6d4] text-[#06b6d4] text-[10px] font-bold py-1.5 rounded-sm">JARVIS</button>
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
