import type { Color } from '@figmavars/core'
import type { DTCGColorValue } from './types'

function channelToHex(channel: number): string {
  const clamped = Math.min(1, Math.max(0, channel))
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')
}

/**
 * Convert a Figma RGBA color (0–1 channels) to a hex string (`#rrggbb` or
 * `#rrggbbaa` when alpha < 1).
 *
 * @public
 */
export function colorToHex(color: Color): string {
  const rgb = `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`
  return color.a < 1 ? `${rgb}${channelToHex(color.a)}` : rgb
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * Convert a Figma RGBA color into a DTCG 2025.10 color value object
 * (sRGB components with a hex fallback).
 *
 * @public
 */
export function figmaColorToDTCG(color: Color): DTCGColorValue {
  return {
    colorSpace: 'srgb',
    components: [round(color.r), round(color.g), round(color.b)],
    alpha: round(color.a),
    hex: colorToHex({ ...color, a: 1 }),
  }
}

/** Type guard for Figma color objects. @public */
export function isFigmaColor(value: unknown): value is Color {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Color).r === 'number' &&
    typeof (value as Color).g === 'number' &&
    typeof (value as Color).b === 'number' &&
    typeof (value as Color).a === 'number'
  )
}
