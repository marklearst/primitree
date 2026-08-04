import {
  createGraphFragment,
  createSourceId,
  qualifyId,
  type GraphFragment,
  type GroupId,
  type Provenance,
  type Result,
  type TokenId,
  type TokenType,
} from '@primitree/core'

const MAX_GRAPH_ITEMS = 100_000

export interface DTCGGraphOptions {
  /** Name used to create the Core source ID. */
  readonly source: string
  /** File name or URI copied into provenance records. */
  readonly uri?: string
}

interface TokenInput {
  readonly id: TokenId
  readonly groupId?: GroupId
  readonly name: string
  readonly path: readonly string[]
  readonly type: unknown
  readonly value: unknown
  readonly provenance: readonly Provenance[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isToken(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && hasOwn(value, '$value')
}

function pointer(path: readonly string[]): string {
  return `/${path
    .map(segment => segment.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('/')}`
}

function failure(message: string): Result<GraphFragment> {
  const diagnostic = Object.freeze({
    code: 'dtcg.invalid-document',
    phase: 'source' as const,
    message,
  })
  return Object.freeze({
    ok: false as const,
    diagnostics: Object.freeze([diagnostic]) as readonly [typeof diagnostic],
  })
}

/**
 * Convert one DTCG token document into a Core graph fragment.
 *
 * @param document - DTCG token document to read.
 * @param options - Source name and optional provenance URI.
 * @returns A graph fragment result. Invalid documents return a source diagnostic.
 *
 * @public
 */
export function toGraphFragment(
  document: unknown,
  options: DTCGGraphOptions
): Result<GraphFragment> {
  try {
    if (!isRecord(document) || !isRecord(options)) {
      return failure('A DTCG graph needs a token document and source options.')
    }
    const sourceResult = createSourceId(options.source)
    if (!sourceResult.ok) return sourceResult
    const sourceId = sourceResult.value
    if (options.uri !== undefined && typeof options.uri !== 'string') {
      return failure('A DTCG source URI must be text.')
    }

    const groups: Array<{
      readonly id: GroupId
      readonly sourceId: typeof sourceId
      readonly name: string
      readonly path: readonly string[]
      readonly provenance: readonly Provenance[]
    }> = []
    const tokens: TokenInput[] = []
    const queue: Array<{
      readonly value: Record<string, unknown>
      readonly path: readonly string[]
      readonly groupId?: GroupId
      readonly inheritedType?: unknown
    }> = [{ value: document, path: [] }]
    let itemCount = 0

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const group = queue[queueIndex]!
      const groupType = hasOwn(group.value, '$type')
        ? group.value.$type
        : group.inheritedType
      for (const [name, child] of Object.entries(group.value)) {
        if (name.startsWith('$') && name !== '$root') continue
        itemCount += 1
        if (itemCount > MAX_GRAPH_ITEMS) {
          return failure('A DTCG graph can contain at most 100,000 items.')
        }

        if (isToken(child)) {
          const tokenPath =
            name === '$root' ? group.path : [...group.path, name]
          if (tokenPath.length === 0) {
            return failure('A root token needs a group path.')
          }
          const idResult = qualifyId({
            sourceId,
            kind: 'token',
            localId: tokenPath.join('.'),
          })
          if (!idResult.ok) return idResult
          const tokenProvenance = Object.freeze([
            Object.freeze({
              ...(options.uri === undefined ? {} : { uri: options.uri }),
              pointer: pointer(
                name === '$root' ? [...group.path, name] : tokenPath
              ),
            }),
          ])
          tokens.push({
            id: idResult.value,
            ...(group.groupId === undefined ? {} : { groupId: group.groupId }),
            name: tokenPath.at(-1)!,
            path: tokenPath,
            type: hasOwn(child, '$type') ? child.$type : groupType,
            value: child.$value,
            provenance: tokenProvenance,
          })
          continue
        }

        if (!isRecord(child)) {
          return failure('Each DTCG group entry must be a group or token.')
        }
        const groupPath = [...group.path, name]
        const idResult = qualifyId({
          sourceId,
          kind: 'group',
          localId: groupPath.join('.'),
        })
        if (!idResult.ok) return idResult
        const groupProvenance = Object.freeze([
          Object.freeze({
            ...(options.uri === undefined ? {} : { uri: options.uri }),
            pointer: pointer(groupPath),
          }),
        ])
        groups.push({
          id: idResult.value,
          sourceId,
          name,
          path: groupPath,
          provenance: groupProvenance,
        })
        queue.push({
          value: child,
          path: groupPath,
          groupId: idResult.value,
          inheritedType: groupType,
        })
      }
    }

    return createGraphFragment({
      source: {
        id: sourceId,
        type: 'dtcg',
        ...(options.uri === undefined
          ? {}
          : { provenance: [{ uri: options.uri }] }),
      },
      groups,
      tokens: tokens.map(token => {
        let value:
          | { readonly kind: 'literal'; readonly value: unknown }
          | { readonly kind: 'reference'; readonly target: TokenId }
        if (
          typeof token.value === 'string' &&
          token.value.startsWith('{') &&
          token.value.endsWith('}')
        ) {
          const target = qualifyId({
            sourceId,
            kind: 'token',
            localId: token.value.slice(1, -1),
          })
          if (!target.ok) throw new Error('A DTCG reference path is invalid.')
          value = { kind: 'reference', target: target.value }
        } else {
          value = { kind: 'literal', value: token.value }
        }
        return {
          id: token.id,
          sourceId,
          ...(token.groupId === undefined ? {} : { groupId: token.groupId }),
          name: token.name,
          path: token.path,
          type: token.type as TokenType,
          values: [
            {
              value,
              provenance: token.provenance,
            },
          ],
          provenance: token.provenance,
        }
      }),
    })
  } catch {
    return failure('The DTCG adapter could not read the token document.')
  }
}
