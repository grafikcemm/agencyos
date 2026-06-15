"use client"

import { useEffect, useState, useCallback } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { EnrichedLead } from '@/lib/enrichLead'

// Fix Leaflet default icon paths
const fixLeafletIcons = () => {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  })
}

// Custom marker icon based on status/priority
const createCustomIcon = (status: string, priority?: string) => {
  // Calm Operator Console tokens (hex literals required inside Leaflet divIcon HTML strings)
  const accentColor = '#5ee6b0'  // --accent (mint)
  const successColor = '#5ee6b0' // --success
  const mutedColor = '#5e646e'   // --text-muted

  if (priority === 'high') {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="width: 16px; height: 16px; background-color: ${accentColor}; border-radius: 50%; box-shadow: 0 0 12px ${accentColor}; border: 2px solid #fff;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }

  const color = status === 'new' ? '#5ac8fa' :
                status === 'contacted' ? '#e5b567' :
                status === 'converted' ? successColor :
                status === 'lost' ? '#f2555a' : mutedColor

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="width: 12px; height: 12px; background-color: ${color}; border-radius: 50%; box-shadow: 0 0 8px ${color}; border: 1px solid #fff;"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  })
}

// Custom cluster icon showing count
function createClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount()
  let size = 'small'
  let dim = 36
  if (count >= 50) { size = 'large'; dim = 52 }
  else if (count >= 10) { size = 'medium'; dim = 44 }

  return L.divIcon({
    html: `<div class="cluster-icon cluster-${size}"><span>${count}</span></div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(dim, dim)
  })
}

// MarkerCluster layer component
function ClusterLayer({ leads, onLeadClick }: { leads: EnrichedLead[]; onLeadClick: (lead: EnrichedLead) => void }) {
  const map = useMap()

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      iconCreateFunction: createClusterIcon,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      animate: true,
    })

    leads.forEach(lead => {
      if (!lead.latitude || !lead.longitude) return
      const marker = L.marker([lead.latitude, lead.longitude], {
        icon: createCustomIcon(lead.status, lead.priority)
      })

      // Popup with minimal info
      marker.bindPopup(`
        <div style="font-family: system-ui; min-width: 180px; padding: 4px;">
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px;">${lead.business_name}</div>
          <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            ${lead.sector || ''} • ${lead.city || ''}${lead.district ? ' / ' + lead.district : ''}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px solid #2a2d33; border-bottom: 1px solid #2a2d33; margin-bottom: 8px;">
            <span style="font-size: 10px; color: #999; font-weight: 700;">SKOR</span>
            <span style="font-size: 12px; font-weight: 700; color: #5ee6b0;">${lead.potential_score || 0}</span>
          </div>
        </div>
      `, { className: 'dark-popup' })

      marker.on('click', () => onLeadClick(lead))

      clusterGroup.addLayer(marker)
    })

    map.addLayer(clusterGroup)

    return () => {
      map.removeLayer(clusterGroup)
    }
  }, [leads, map, onLeadClick])

  return null
}

export interface CircleArea {
  lat: number
  lng: number
  radius: number
}

const DEFAULT_CIRCLE_RADIUS = 1500

// Daire alan çizim katmanı — drawMode'da haritaya tıklamak merkezi belirler;
// L.circle + merkez işareti çizilir. leaflet-draw gerekmez (native Leaflet + useMapEvents).
function CircleDrawLayer({
  drawMode,
  circle,
  onCircleChange,
}: {
  drawMode: boolean
  circle: CircleArea | null
  onCircleChange?: (area: CircleArea) => void
}) {
  const map = useMap()

  // Inline handlers objesi her render'da yeni referans → useMapEvents handler'ı yeniden
  // bağlar → closure her zaman taze (stale closure yok).
  useMapEvents({
    click(e) {
      if (!drawMode || !onCircleChange) return
      onCircleChange({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        radius: circle?.radius ?? DEFAULT_CIRCLE_RADIUS,
      })
    },
  })

  useEffect(() => {
    if (!circle) return
    // hex zorunlu: var() Leaflet path option'larında çalışmaz (--accent = #5ee6b0).
    const area = L.circle([circle.lat, circle.lng], {
      radius: circle.radius,
      color: '#5ee6b0',
      weight: 2,
      fillColor: '#5ee6b0',
      fillOpacity: 0.08,
    }).addTo(map)
    const center = L.circleMarker([circle.lat, circle.lng], {
      radius: 4,
      color: '#5ee6b0',
      fillColor: '#5ee6b0',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map)
    return () => {
      map.removeLayer(area)
      map.removeLayer(center)
    }
  }, [circle, map])

  return null
}

interface LeadMapProps {
  leads: EnrichedLead[]
  onLeadClick?: (lead: EnrichedLead) => void
  drawMode?: boolean
  circle?: CircleArea | null
  onCircleChange?: (area: CircleArea) => void
}

export default function LeadMap({ leads, onLeadClick, drawMode = false, circle = null, onCircleChange }: LeadMapProps) {
  const [mounted, setMounted] = useState(false)

  const handleLeadClick = useCallback((lead: EnrichedLead) => {
    onLeadClick?.(lead)
  }, [onLeadClick])

  useEffect(() => {
    fixLeafletIcons()
    Promise.resolve().then(() => {
      setMounted(true)
    })
  }, [])

  if (!mounted) return null

  return (
    <div className={`w-full h-full relative${drawMode ? ' draw-mode' : ''}`}>
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
        <ClusterLayer leads={leads} onLeadClick={handleLeadClick} />
        <CircleDrawLayer drawMode={drawMode} circle={circle} onCircleChange={onCircleChange} />
      </MapContainer>

      {/* Cluster icon styles */}
      <style jsx global>{`
        .custom-cluster-icon {
          background: transparent !important;
          border: none !important;
        }
        .cluster-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-weight: 800;
          font-size: 12px;
          color: #fff;
          font-family: system-ui, sans-serif;
          letter-spacing: 0.02em;
        }
        .cluster-small {
          background: rgba(90, 200, 250, 0.85);
          border: 2px solid rgba(90, 200, 250, 0.4);
          box-shadow: 0 0 16px rgba(90, 200, 250, 0.4);
          width: 36px; height: 36px;
        }
        .cluster-medium {
          background: rgba(94, 230, 176, 0.85);
          border: 2px solid rgba(94, 230, 176, 0.4);
          box-shadow: 0 0 20px rgba(94, 230, 176, 0.4);
          width: 44px; height: 44px;
          font-size: 13px;
        }
        .cluster-large {
          background: rgba(94, 230, 176, 0.85);
          border: 2px solid rgba(94, 230, 176, 0.4);
          box-shadow: 0 0 24px rgba(94, 230, 176, 0.4);
          width: 52px; height: 52px;
          font-size: 14px;
        }
        .dark-popup .leaflet-popup-content-wrapper {
          background: #1a1c20;
          color: #e8eaed;
          border-radius: 10px;
          border: 1px solid #2a2d33;
        }
        .dark-popup .leaflet-popup-tip {
          background: #1a1c20;
        }
        .draw-mode .leaflet-container,
        .draw-mode .leaflet-grab {
          cursor: crosshair !important;
        }
      `}</style>
    </div>
  )
}
