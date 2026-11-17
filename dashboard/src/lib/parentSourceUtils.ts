import { Newspaper, Facebook, MessageCircle, AlertTriangle } from 'lucide-react'

// Parent source IDs mapping
export const PARENT_SOURCE_IDS = {
  BAO: '206f085b-2a63-494e-af3b-9662d40f035d',
  FACEBOOK: 'c315ac35-4378-43b8-8cb1-3885034cc929', 
  TELEGRAM: '3514a6f4-684b-481c-97b3-c6591e0b945e',
  FACEBOOK_PHAN_DONG: 'e9731f2c-b7a8-4696-ab0e-f3263044aed8'
} as const

// Parent source names mapping
export const PARENT_SOURCE_NAMES = {
  [PARENT_SOURCE_IDS.BAO]: 'Báo',
  [PARENT_SOURCE_IDS.FACEBOOK]: 'Facebook',
  [PARENT_SOURCE_IDS.TELEGRAM]: 'Telegram', 
  [PARENT_SOURCE_IDS.FACEBOOK_PHAN_DONG]: 'Facebook Phản động'
} as const

// Parent source icons mapping
export const PARENT_SOURCE_ICONS = {
  [PARENT_SOURCE_IDS.BAO]: Newspaper,
  [PARENT_SOURCE_IDS.FACEBOOK]: Facebook,
  [PARENT_SOURCE_IDS.TELEGRAM]: MessageCircle,
  [PARENT_SOURCE_IDS.FACEBOOK_PHAN_DONG]: AlertTriangle
} as const

// Parent source colors mapping
export const PARENT_SOURCE_COLORS = {
  [PARENT_SOURCE_IDS.BAO]: 'text-blue-600',
  [PARENT_SOURCE_IDS.FACEBOOK]: 'text-blue-500',
  [PARENT_SOURCE_IDS.TELEGRAM]: 'text-sky-500',
  [PARENT_SOURCE_IDS.FACEBOOK_PHAN_DONG]: 'text-red-500'
} as const

/**
 * Get parent source information by parent_id
 */
export function getParentSourceInfo(parentId: string | null | undefined) {
  if (!parentId) return null
  
  return {
    id: parentId,
    name: PARENT_SOURCE_NAMES[parentId as keyof typeof PARENT_SOURCE_NAMES] || 'Unknown',
    icon: PARENT_SOURCE_ICONS[parentId as keyof typeof PARENT_SOURCE_ICONS] || Newspaper,
    color: PARENT_SOURCE_COLORS[parentId as keyof typeof PARENT_SOURCE_COLORS] || 'text-gray-500'
  }
}

/**
 * Get parent source name by parent_id
 */
export function getParentSourceName(parentId: string | null | undefined): string | null {
  if (!parentId) return null
  return PARENT_SOURCE_NAMES[parentId as keyof typeof PARENT_SOURCE_NAMES] || null
}

/**
 * Get parent source icon component by parent_id
 */
export function getParentSourceIcon(parentId: string | null | undefined) {
  if (!parentId) return null
  return PARENT_SOURCE_ICONS[parentId as keyof typeof PARENT_SOURCE_ICONS] || null
}

/**
 * Get parent source color class by parent_id
 */
export function getParentSourceColor(parentId: string | null | undefined): string {
  if (!parentId) return 'text-gray-500'
  return PARENT_SOURCE_COLORS[parentId as keyof typeof PARENT_SOURCE_COLORS] || 'text-gray-500'
}