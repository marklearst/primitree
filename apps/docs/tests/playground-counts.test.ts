import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

interface PlaygroundModule {
  PlaygroundApp?: () => unknown
}

interface ElementNode {
  props?: {
    children?: unknown
  }
}

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(textContent).join('')
  }
  if (typeof value === 'object' && value !== null) {
    return textContent((value as ElementNode).props?.children)
  }
  return ''
}

async function renderPlayground(count: number): Promise<string> {
  const source = await readFile(
    new URL('../components/playground/playground-app.tsx', import.meta.url),
    'utf8'
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} as PlaygroundModule }
  const evaluate = new Function('require', 'module', 'exports', compiled)
  const preview = {
    fileName: 'variables.json',
    pipeline: {
      summary: {
        collections: count,
        variables: count,
      },
      files: Array.from({ length: count }, (_, index) => ({
        path: `tokens/${index}.tokens.json`,
        contents: '{}',
      })),
    },
    contexts: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `axis-${index}`,
        ['default'],
      ])
    ),
    dtcg: {
      warnings: Array.from({ length: count }, (_, index) => `warning ${index}`),
    },
  }
  const stateValues = [false, preview, null, false, {}, 'tokens', null]
  let stateIndex = 0

  evaluate(
    (specifier: string) => {
      if (specifier === 'react') {
        return {
          useCallback: (callback: unknown) => callback,
          useEffect: () => undefined,
          useMemo: (factory: () => unknown) => factory(),
          useRef: () => ({ current: null }),
          useState: () => [stateValues[stateIndex++], () => undefined],
        }
      }
      if (specifier === 'react/jsx-runtime') {
        const jsx = (_type: unknown, props: ElementNode['props']) => ({ props })
        return { Fragment: Symbol('Fragment'), jsx, jsxs: jsx }
      }
      if (specifier === '@/lib/playground/pipeline') {
        return {
          analyze: () => undefined,
          downloadBlob: () => undefined,
          resolvePreview: () => [],
          zipPipeline: () => undefined,
        }
      }
      return {}
    },
    module,
    module.exports
  )
  assert.equal(typeof module.exports.PlaygroundApp, 'function')

  return textContent(module.exports.PlaygroundApp?.())
    .replace(/\s+/g, ' ')
    .trim()
}

test('playground count copy uses singular labels for one item', async () => {
  const copy = await renderPlayground(1)

  assert.match(
    copy,
    /1 collection · 1 token · 1 context axis · 1 file generated/
  )
  assert.match(copy, /1 warning/)
  assert.doesNotMatch(
    copy,
    /1 collections|1 tokens|1 context axes|1 files generated|warning\(s\)/
  )
})

test('playground count copy keeps plural labels for other counts', async () => {
  const copy = await renderPlayground(2)

  assert.match(
    copy,
    /2 collections · 2 tokens · 2 context axes · 2 files generated/
  )
  assert.match(copy, /2 warnings/)
})
