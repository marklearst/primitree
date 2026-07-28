import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { expect, test } from 'vitest'

type ElementNode = {
  props?: {
    children?: unknown
    src?: string
    alt?: string
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

test('playground wordmark pairs the compact Primitree tree with live text', async () => {
  const source = await readFile(new URL('./App.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} as { default?: () => ElementNode } }
  const evaluate = new Function('require', 'module', 'exports', compiled)

  evaluate(
    (specifier: string) => {
      if (specifier === 'react') {
        return {
          useCallback: (callback: unknown) => callback,
          useMemo: (factory: () => unknown) => factory(),
          useRef: () => ({ current: null }),
          useState: (value: unknown) => [value, () => undefined],
        }
      }
      if (specifier === 'react/jsx-runtime') {
        const jsx = (_type: unknown, props: ElementNode['props']) => ({ props })
        return { Fragment: Symbol('Fragment'), jsx, jsxs: jsx }
      }
      if (specifier === './assets/primitree-icon.svg') {
        return { __esModule: true, default: '/primitree-icon.svg' }
      }
      if (specifier === './lib/pipeline') {
        return {
          analyze: () => undefined,
          downloadBlob: () => undefined,
          resolvePreview: () => [],
          zipPipeline: () => undefined,
        }
      }
      if (specifier === './sample-variables.json') {
        return { default: {} }
      }
      throw new Error(`Unexpected playground dependency: ${specifier}`)
    },
    module,
    module.exports
  )

  const app = module.exports.default?.()
  expect(textContent(app)).toMatch(/PrimitreePlayground/)
  expect(JSON.stringify(app)).toMatch(/"src":"\/primitree-icon\.svg"/)
  expect(JSON.stringify(app)).not.toMatch(/"alt":"Primitree"/)
})

test('playground document has the Primitree title', async () => {
  const document = await readFile(
    new URL('../index.html', import.meta.url),
    'utf8'
  )

  expect(document).toContain(
    '<title>Primitree Playground: variables.json to design token pipeline</title>'
  )
})
