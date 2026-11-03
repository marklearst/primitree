import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  installCommands,
  isPackageManager,
  PACKAGE_MANAGER_KEY,
  packageManagerScript,
  packageManagers,
  runPrefixes,
} from '../lib/landing/package-managers.ts'

/** Runs the pre-paint script against a stored value and returns what it set
 * on the root, or undefined when it left the root alone. */
function paint(stored: string | null | Error) {
  const dataset: { packageManager?: string } = {}
  const storage = {
    getItem(key: string) {
      assert.equal(key, PACKAGE_MANAGER_KEY)
      if (stored instanceof Error) {
        throw stored
      }
      return stored
    },
  }
  new Function('localStorage', 'document', packageManagerScript)(storage, {
    documentElement: { dataset },
  })
  return dataset.packageManager
}

test('each manager installs the CLI as a dev dependency at the next tag', () => {
  for (const manager of packageManagers) {
    const command = installCommands[manager]
    assert.ok(command.startsWith(`${manager} `), command)
    assert.match(command, / -[Dd] @primitree\/cli@next$/u)
  }
})

test('each manager runs the CLI the project installed', () => {
  assert.deepEqual(runPrefixes, {
    npm: 'npx primitree',
    pnpm: 'pnpm exec primitree',
    yarn: 'yarn primitree',
    bun: 'bunx primitree',
  })
})

test('the pre-paint script applies a stored manager and nothing else', () => {
  for (const manager of packageManagers) {
    assert.equal(paint(manager), manager)
    assert.equal(isPackageManager(manager), true)
  }
  for (const stored of [null, '', 'npx', 'NPM', '<img>']) {
    assert.equal(paint(stored), undefined)
    assert.equal(isPackageManager(stored), false)
  }
})

test('the pre-paint script survives blocked storage', () => {
  assert.equal(paint(new Error('SecurityError')), undefined)
})
