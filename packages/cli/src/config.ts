import type {
  PolicyOwnershipInput,
  PolicyValueRule,
} from '@primitree/core/policy'

/** One layer used when checking a token source. @public */
export interface PrimitreeLayerConfig {
  /** Name used in findings. */
  readonly id: string
  /** Exact first path segments assigned to this layer. */
  readonly roots: readonly string[]
  /** Value forms allowed in this layer. */
  readonly values: PolicyValueRule
  /** Layers that this layer may reference. */
  readonly references?: readonly string[]
}

/** Layer rules for one token source. @public */
export interface PrimitreeArchitectureConfig {
  /** One to four ordered layers. */
  readonly layers: readonly PrimitreeLayerConfig[]
}

/** One local DTCG token source. @public */
export interface PrimitreeDTCGSourceConfig {
  /** Identifies a DTCG token document. */
  readonly type: 'dtcg'
  /** Token file path, relative to the config file. */
  readonly file: string
  /** Layer rules checked for this source. */
  readonly architecture: PrimitreeArchitectureConfig
  /** Default owners and owners for exact root paths. */
  readonly ownership?: PolicyOwnershipInput
}

/** Primitree project settings. @public */
export interface PrimitreeConfig {
  /** Config format version. Primitree 1.0 accepts version 1. */
  readonly schemaVersion: 1
  /** Each object key is a source name. */
  readonly sources: Readonly<Record<string, PrimitreeDTCGSourceConfig>>
}

/**
 * Add TypeScript checks to a Primitree project config.
 *
 * @param config - Project settings.
 * @returns The same object.
 *
 * @public
 */
export function defineConfig(config: PrimitreeConfig): PrimitreeConfig {
  return config
}
