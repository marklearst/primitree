import { describe, expect, it } from 'vitest'
import {
  classifyFallbackData,
  isLocalVariablesResponse,
  isPublishedVariablesResponse,
  validateFallbackData,
} from '../../src/utils/typeGuards'
import type { FallbackDataKind } from '../../src/utils/typeGuards'

const localData = {
  meta: {
    variableCollections: {
      'collection-1': {
        modes: [{ modeId: 'mode-1', name: 'Default' }],
      },
    },
    variables: {
      'variable-1': {
        valuesByMode: { 'mode-1': '#ffffff' },
      },
    },
  },
}

const publishedData = {
  meta: {
    variableCollections: {
      'collection-1': {
        subscribed_id: 'subscribed-collection-1',
        key: 'collection-key-1',
        updatedAt: '2026-07-13T00:00:00Z',
      },
    },
    variables: {
      'variable-1': {
        subscribed_id: 'subscribed-variable-1',
        key: 'variable-key-1',
        updatedAt: '2026-07-13T00:00:00Z',
      },
    },
  },
}

const emptyData = {
  meta: {
    variableCollections: {},
    variables: {},
  },
}

const mixedData = {
  meta: {
    variableCollections: {
      local: { modes: [] },
      published: {
        subscribed_id: 'subscribed-collection-1',
        key: 'collection-key-1',
        updatedAt: '2026-07-13T00:00:00Z',
      },
    },
    variables: {},
  },
}

class LocalCollectionMap {
  collection = { modes: [] }
}

class LocalCollectionEntry {
  modes: unknown[] = []
}

describe('typeGuards', () => {
  describe('isLocalVariablesResponse', () => {
    it('accepts local entries and rejects published entries', () => {
      expect(isLocalVariablesResponse(localData)).toBe(true)
      expect(isLocalVariablesResponse(publishedData)).toBe(false)
    })

    it('accepts empty plain-record maps as structurally local', () => {
      expect(isLocalVariablesResponse(emptyData)).toBe(true)
    })

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not an object'],
      ['an array response', []],
      ['a date response', new Date()],
      ['an object without meta', { other: true }],
      ['a null meta value', { meta: null }],
      ['a missing collection map', { meta: { variables: {} } }],
      ['a missing variable map', { meta: { variableCollections: {} } }],
      [
        'an array collection map',
        { meta: { variableCollections: [], variables: {} } },
      ],
      [
        'a date collection map',
        { meta: { variableCollections: new Date(), variables: {} } },
      ],
      [
        'a class-instance collection map',
        {
          meta: {
            variableCollections: new LocalCollectionMap(),
            variables: {},
          },
        },
      ],
      [
        'a class-instance collection entry',
        {
          meta: {
            variableCollections: {
              collection: new LocalCollectionEntry(),
            },
            variables: {},
          },
        },
      ],
      [
        'a primitive collection entry',
        { meta: { variableCollections: { collection: 42 }, variables: {} } },
      ],
      [
        'a primitive variable entry',
        { meta: { variableCollections: {}, variables: { variable: 'nope' } } },
      ],
      ['mixed local and published entries', mixedData],
    ])('rejects %s', (_description, candidate) => {
      expect(isLocalVariablesResponse(candidate)).toBe(false)
    })
  })

  describe('isPublishedVariablesResponse', () => {
    it('accepts published entries and rejects local entries', () => {
      expect(isPublishedVariablesResponse(publishedData)).toBe(true)
      expect(isPublishedVariablesResponse(localData)).toBe(false)
    })

    it('accepts empty plain-record maps as structurally published', () => {
      expect(isPublishedVariablesResponse(emptyData)).toBe(true)
    })

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not an object'],
      ['an array response', []],
      ['a date response', new Date()],
      ['an object without meta', { other: true }],
      ['a null meta value', { meta: null }],
      ['a missing collection map', { meta: { variables: {} } }],
      ['a missing variable map', { meta: { variableCollections: {} } }],
      [
        'an array collection map',
        { meta: { variableCollections: [], variables: {} } },
      ],
      [
        'a date collection map',
        { meta: { variableCollections: new Date(), variables: {} } },
      ],
      [
        'a class-instance collection map',
        {
          meta: {
            variableCollections: new LocalCollectionMap(),
            variables: {},
          },
        },
      ],
      [
        'a class-instance collection entry',
        {
          meta: {
            variableCollections: {
              collection: new LocalCollectionEntry(),
            },
            variables: {},
          },
        },
      ],
      [
        'a primitive collection entry',
        { meta: { variableCollections: { collection: 42 }, variables: {} } },
      ],
      [
        'a primitive variable entry',
        { meta: { variableCollections: {}, variables: { variable: 'nope' } } },
      ],
      ['mixed local and published entries', mixedData],
    ])('rejects %s', (_description, candidate) => {
      expect(isPublishedVariablesResponse(candidate)).toBe(false)
    })
  })

  describe('classifyFallbackData', () => {
    it('classifies local and published entry shapes', () => {
      expect(classifyFallbackData(localData)).toEqual({
        kind: 'local',
        data: localData,
      })
      expect(classifyFallbackData(publishedData)).toEqual({
        kind: 'published',
        data: publishedData,
      })
    })

    it('requires an explicit kind for empty response maps', () => {
      expect(classifyFallbackData(emptyData)).toBeUndefined()
      expect(classifyFallbackData(emptyData, 'local')).toEqual({
        kind: 'local',
        data: emptyData,
      })
      expect(classifyFallbackData(emptyData, 'published')).toEqual({
        kind: 'published',
        data: emptyData,
      })
    })

    it('rejects an explicit kind that does not match the entries', () => {
      expect(classifyFallbackData(localData, 'published')).toBeUndefined()
      expect(classifyFallbackData(publishedData, 'local')).toBeUndefined()
    })

    it('rejects hostile runtime kinds before classifying valid data', () => {
      expect(
        classifyFallbackData(localData, 'unexpected' as FallbackDataKind)
      ).toBeUndefined()
    })

    it.each([
      ['an array', []],
      ['a date', new Date()],
      ['a class instance', new LocalCollectionMap()],
      [
        'a primitive entry',
        {
          meta: { variableCollections: { collection: 42 }, variables: {} },
        },
      ],
      ['mixed local and published entries', mixedData],
    ])('does not classify %s', (_description, candidate) => {
      expect(classifyFallbackData(candidate)).toBeUndefined()
    })
  })

  describe('validateFallbackData', () => {
    it('returns discriminated local and published response data', () => {
      expect(validateFallbackData(localData)).toBe(localData)
      expect(validateFallbackData(publishedData)).toBe(publishedData)
    })

    it('does not guess the kind of empty response maps', () => {
      expect(validateFallbackData(emptyData)).toBeUndefined()
    })

    it('returns undefined for invalid or mixed data', () => {
      expect(validateFallbackData(null)).toBeUndefined()
      expect(validateFallbackData({ invalid: true })).toBeUndefined()
      expect(validateFallbackData('string')).toBeUndefined()
      expect(validateFallbackData(mixedData)).toBeUndefined()
    })
  })
})
