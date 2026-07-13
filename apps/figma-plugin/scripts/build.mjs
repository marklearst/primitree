import {
  mkdirSync,
  readFileSync,
  rmSync,
  watch as watchFs,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const root = join(fileURLToPath(import.meta.url), '..')
const pluginRoot = join(root, '..')
const sourceRoot = join(pluginRoot, 'src')
const distRoot = join(pluginRoot, 'dist')
const watch = process.argv.includes('--watch')

rmSync(distRoot, { force: true, recursive: true })
mkdirSync(distRoot, { recursive: true })

function writeManifest() {
  const manifest = JSON.parse(
    readFileSync(join(pluginRoot, 'manifest.json'), 'utf8')
  )
  manifest.main = 'code.js'
  manifest.ui = 'ui.html'
  writeFileSync(
    join(distRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
}

function writeUiHtml() {
  const template = readFileSync(join(sourceRoot, 'ui.html'), 'utf8')
  const css = readFileSync(join(sourceRoot, 'ui.css'), 'utf8').replace(
    /<\/style/gi,
    '<\\/style'
  )
  const js = readFileSync(join(distRoot, 'ui.js'), 'utf8').replace(
    /<\/script/gi,
    '<\\/script'
  )

  for (const marker of ['<!-- UI_STYLES -->', '<!-- UI_SCRIPT -->']) {
    if (!template.includes(marker)) {
      throw new Error(`Missing ${marker} in src/ui.html`)
    }
  }

  const html = template
    .replace('<!-- UI_STYLES -->', `<style>\n${css}\n</style>`)
    .replace('<!-- UI_SCRIPT -->', `<script>\n${js}\n</script>`)

  writeFileSync(join(distRoot, 'ui.html'), html)
}

writeManifest()

const inlineUiPlugin = {
  name: 'inline-ui',
  setup(build) {
    build.onEnd(result => {
      if (result.errors.length === 0) {
        writeUiHtml()
      }
    })
  },
}

const shared = {
  bundle: true,
  target: 'es2017',
  logLevel: 'info',
}

async function build() {
  await esbuild.build({
    ...shared,
    entryPoints: [join(sourceRoot, 'code.ts')],
    outfile: join(distRoot, 'code.js'),
    platform: 'browser',
  })
  await esbuild.build({
    ...shared,
    entryPoints: [join(sourceRoot, 'ui.ts')],
    outfile: join(distRoot, 'ui.js'),
    platform: 'browser',
    plugins: [inlineUiPlugin],
  })
}

if (watch) {
  const ctxCode = await esbuild.context({
    ...shared,
    entryPoints: [join(sourceRoot, 'code.ts')],
    outfile: join(distRoot, 'code.js'),
    platform: 'browser',
  })
  const ctxUi = await esbuild.context({
    ...shared,
    entryPoints: [join(sourceRoot, 'ui.ts')],
    outfile: join(distRoot, 'ui.js'),
    platform: 'browser',
    plugins: [inlineUiPlugin],
  })
  await ctxCode.watch()
  await ctxUi.watch()

  let uiTimer
  watchFs(sourceRoot, (_event, filename) => {
    if (filename === 'ui.css' || filename === 'ui.html') {
      clearTimeout(uiTimer)
      uiTimer = setTimeout(writeUiHtml, 50)
    }
  })

  let manifestTimer
  watchFs(pluginRoot, (_event, filename) => {
    if (filename === 'manifest.json') {
      clearTimeout(manifestTimer)
      manifestTimer = setTimeout(writeManifest, 50)
    }
  })

  console.log('watching figma plugin...')
} else {
  await build()
}
