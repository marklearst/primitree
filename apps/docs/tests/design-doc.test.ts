import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import postcss from 'postcss'

async function read(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8')
}

/** The sections in the order the homepage renders them: each labelled section
 * in the page, with the theme section where its component mounts. */
async function renderedSections() {
  const page = await read('../components/landing/home-page.tsx')
  return [
    ...page.matchAll(/aria-labelledby='([a-z]+)-title'|<(Theme)Section \/>/gu),
  ].map(([, id, theme]) => (id ?? theme).toLowerCase())
}

test('DESIGN.md lists the sections in the order the homepage renders them', async () => {
  const design = await read('../DESIGN.md')
  const sentence = design.match(/Sections read in order: ([^\n]+)/u)?.[1]
  assert.ok(sentence, 'DESIGN.md names the section order')
  const sections = await renderedSections()
  const [list = ''] = sentence.replace(/\([^)]*\)/gu, '').split('.')
  const listed = list.split(',').map(entry => {
    const name = entry.trim()
    return name.split(' ').find(word => sections.includes(word)) ?? name
  })
  assert.deepEqual(listed, sections)
})

test('DESIGN.md states the lede measure home.css sets', async () => {
  const design = await read('../DESIGN.md')
  const home = await read('../components/landing/home.css')
  let measure: string | undefined
  postcss.parse(home).walkRules(rule => {
    if (rule.selectors.includes('.hero-lede')) {
      rule.walkDecls('max-width', declaration => {
        measure = declaration.value
      })
    }
  })
  assert.ok(measure, 'home.css caps the lede')
  const lede = design.match(/- \*\*Lede\*\* [^\n]+/u)?.[0]
  assert.ok(lede, 'DESIGN.md describes the lede')
  assert.match(lede, new RegExp(`\\b${measure} max\\b`, 'u'))
})
