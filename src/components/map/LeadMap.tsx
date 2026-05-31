"use client"

import { useEffect, useState, useCallback } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
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
                status === 'converted' ? successColor :
                status === 'lost' ? '#EF4444' : mutedColor

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
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px solid #333; border-bottom: 1px solid #333; margin-bottom: 8px;">
            <span style="font-size: 10px; color: #999; font-weight: 700;">SKOR</span>
            <span style="font-size: 12px; font-weight: 700; color: #E8440A;">${lead.potential_score || 0}</span>
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

interface LeadMapProps {
  leads: EnrichedLead[]
  onLeadClick?: (lead: EnrichedLead) => void
}

export default function LeadMap({ leads, onLeadClick }: LeadMapProps) {
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
        <ClusterLayer leads={leads} onLeadClick={handleLeadClick} />
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
          background: rgba(55, 138, 221, 0.85);
          border: 2px solid rgba(55, 138, 221, 0.4);
          box-shadow: 0 0 16px rgba(55, 138, 221, 0.4);
          width: 36px; height: 36px;
        }
        .cluster-medium {
          background: rgba(232, 68, 10, 0.85);
          border: 2px solid rgba(232, 68, 10, 0.4);
          box-shadow: 0 0 20px rgba(232, 68, 10, 0.4);
          width: 44px; height: 44px;
          font-size: 13px;
        }
        .cluster-large {
          background: rgba(29, 158, 117, 0.85);
          border: 2px solid rgba(29, 158, 117, 0.4);
          box-shadow: 0 0 24px rgba(29, 158, 117, 0.4);
          width: 52px; height: 52px;
          font-size: 14px;
        }
        .dark-popup .leaflet-popup-content-wrapper {
          background: #1a1a2e;
          color: #e0e0e0;
          border-radius: 10px;
          border: 1px solid #333;
        }
        .dark-popup .leaflet-popup-tip {
          background: #1a1a2e;
        }
      `}</style>
    </div>
  )
}
