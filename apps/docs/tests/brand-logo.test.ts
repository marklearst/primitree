import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

type ElementNode = {
  type: unknown
  props: {
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
    return textContent((value as ElementNode).props.children)
  }
  return ''
}

test('linked BrandLogo exposes one Primitree name with the compact tree mark', async () => {
  const source = await readFile(
    new URL('../components/brand-logo.tsx', import.meta.url),
    'utf8'
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = {
    exports: {} as { BrandLogo?: (props: object) => ElementNode },
  }
  const evaluate = new Function('require', 'module', 'exports', compiled)

  evaluate(
    (specifier: string) => {
      if (specifier === 'react/jsx-runtime') {
        const jsx = (type: unknown, props: ElementNode['props']) => ({
          type,
          props,
        })
        return { jsx, jsxs: jsx }
      }
      if (specifier === 'next/image' || specifier === 'next/link') {
        return { default: (props: ElementNode['props']) => props }
      }
      if (specifier === '@/lib/cn') {
        return {
          cn: (...classes: Array<string | undefined>) =>
            classes.filter(Boolean).join(' '),
        }
      }
      if (specifier === '@/public/primitree-icon.svg') {
        return { __esModule: true, default: '/primitree-icon.svg' }
      }
      throw new Error(`Unexpected BrandLogo dependency: ${specifier}`)
    },
    module,
    module.exports
  )

  assert.equal(typeof module.exports.BrandLogo, 'function')
  const logo = module.exports.BrandLogo?.({ linked: true })
  const inner = logo?.props.children as ElementNode
  const mark = (inner.props.children as ElementNode[])[0]

  assert.equal(textContent(logo), 'Primitree')
  assert.equal(mark.props.src, '/primitree-icon.svg')
  assert.equal(mark.props.alt, '')
})
