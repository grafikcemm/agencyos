"use client"

import React from 'react'
import { FollowUpWidget } from '../dashboard/FollowUpWidget'
import { AICostWidget } from '../dashboard/AICostWidget'
import { UrgentLeadsWidget } from '../dashboard/UrgentLeadsWidget'

export function RightPanel() {
  return (
    <div className="flex flex-col h-full p-6 space-y-10 overflow-y-auto">
      <UrgentLeadsWidget />
      <FollowUpWidget />
      <AICostWidget />
    </div>
  )
}
