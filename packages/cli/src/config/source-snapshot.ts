import type { BigIntStats } from 'node:fs'

export interface ConfiguredSourceFileFingerprint {
  readonly dev: bigint
  readonly ino: bigint
  readonly size: bigint
  readonly mtimeNs: bigint
  readonly ctimeNs: bigint
}

export interface ConfiguredSourcePathSnapshot {
  readonly targetKey: string
  readonly fingerprint?: ConfiguredSourceFileFingerprint
}

export type ConfiguredSourcePathVerifier =
  () => Promise<ConfiguredSourcePathSnapshot>

const configuredSourceFileFingerprints = new WeakMap<
  object,
  ConfiguredSourceFileFingerprint
>()
const configuredSourcePathVerifiers = new WeakMap<
  object,
  ConfiguredSourcePathVerifier
>()

export function retainConfiguredSourceFileFingerprint(
  source: object,
  fingerprint: ConfiguredSourceFileFingerprint
): void {
  configuredSourceFileFingerprints.set(source, fingerprint)
}

export function readConfiguredSourceFileFingerprint(
  source: object
): ConfiguredSourceFileFingerprint | undefined {
  return configuredSourceFileFingerprints.get(source)
}

export function retainConfiguredSourcePathVerifier(
  source: object,
  verifier: ConfiguredSourcePathVerifier
): void {
  configuredSourcePathVerifiers.set(source, verifier)
}

export function readConfiguredSourcePathVerifier(
  source: object
): ConfiguredSourcePathVerifier | undefined {
  return configuredSourcePathVerifiers.get(source)
}

export function configuredSourceFileFingerprint(
  stats: BigIntStats
): ConfiguredSourceFileFingerprint {
  return {
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    mtimeNs: stats.mtimeNs,
    ctimeNs: stats.ctimeNs,
  }
}

export function sameConfiguredSourceFile(
  left: ConfiguredSourceFileFingerprint,
  right: ConfiguredSourceFileFingerprint
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}
