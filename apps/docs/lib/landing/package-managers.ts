/* Install and run commands for each package manager, checked against
   @primitree/cli@next in scratch projects (npm 11, pnpm 12, Yarn 1 and 4,
   Bun 1.4). The CLI needs Node.js 24 or newer under every manager, Bun
   included, because its bin runs on Node. */

export const packageManagers = ['npm', 'pnpm', 'yarn', 'bun'] as const

export type PackageManager = (typeof packageManagers)[number]

export const packageManagerNames: Record<PackageManager, string> = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'Yarn',
  bun: 'Bun',
}

/** Adds the CLI to a project as a dev dependency at the `next` tag. */
export const installCommands: Record<PackageManager, string> = {
  npm: 'npm install -D @primitree/cli@next',
  pnpm: 'pnpm add -D @primitree/cli@next',
  yarn: 'yarn add -D @primitree/cli@next',
  bun: 'bun add -d @primitree/cli@next',
}

/** Runs the CLI the project installed. */
export const runPrefixes: Record<PackageManager, string> = {
  npm: 'npx primitree',
  pnpm: 'pnpm exec primitree',
  yarn: 'yarn primitree',
  bun: 'bunx primitree',
}

/** The storage key and root attribute that carry the visitor's choice. */
export const PACKAGE_MANAGER_KEY = 'primitree-package-manager'

export function isPackageManager(value: unknown): value is PackageManager {
  return (
    typeof value === 'string' &&
    (packageManagers as readonly string[]).includes(value)
  )
}

/** Sets `data-package-manager` on the root before first paint, so a stored
 * choice shows on the server-rendered page with no flash of npm. */
export const packageManagerScript = `try{var m=localStorage.getItem('${PACKAGE_MANAGER_KEY}');if(m==='npm'||m==='pnpm'||m==='yarn'||m==='bun'){document.documentElement.dataset.packageManager=m}}catch(e){}`
