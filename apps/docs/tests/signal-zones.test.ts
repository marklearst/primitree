import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  collisionsByHue,
  signalZones,
  zoneCovers,
} from '../lib/tokens/signal-zones.ts'

describe('the ring zones', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`match the collision measure at every hue in ${theme}`, () => {
      const zones = signalZones(theme)
      const measured = collisionsByHue(theme)
      for (let hue = 0; hue < 360; hue += 1) {
        const drawn = zones
          .filter(zone => zoneCovers(zone, hue))
          .map(zone => zone.name)
          .sort()
        assert.deepEqual(
          drawn,
          [...(measured[hue] ?? [])].sort(),
          `${theme} hue ${hue}`
        )
      }
    })
  }

  test('every arc has width and carries its theme', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const zone of signalZones(theme)) {
        assert.equal(zone.theme, theme)
        assert.ok(zone.to > zone.from, `${zone.name} ${zone.from}-${zone.to}`)
        assert.ok(zone.from >= 0 && zone.from < 360)
      }
    }
  })
})
