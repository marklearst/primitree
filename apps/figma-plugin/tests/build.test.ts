import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'

const distUrl = new URL('../dist/', import.meta.url)
const execFileAsync = promisify(execFile)

beforeAll(async () => {
  await mkdir(distUrl, { recursive: true })
  await writeFile(new URL('ui.css', distUrl), 'obsolete artifact')
  await execFileAsync(process.execPath, [
    new URL('../scripts/build.mjs', import.meta.url).pathname,
  ])
})

async function readDist(path: string): Promise<string> {
  return readFile(new URL(path, distUrl), 'utf8')
}

describe('Figma plugin build artifacts', () => {
  it('emits manifest paths relative to the built manifest', async () => {
    const manifest = JSON.parse(await readDist('manifest.json'))

    expect(manifest.main).toBe('code.js')
    expect(manifest.ui).toBe('ui.html')
  })

  it('cleans obsolete build artifacts', async () => {
    await expect(readdir(distUrl)).resolves.toEqual(
      expect.arrayContaining(['code.js', 'manifest.json', 'ui.html', 'ui.js'])
    )
    await expect(readdir(distUrl)).resolves.not.toContain('ui.css')
  })

  it('injects a self-contained UI into the Figma iframe', async () => {
    const code = await readDist('code.js')
    const ui = await readDist('ui.html')

    expect(code).toContain('figma.showUI(__html__')
    expect(ui).toMatch(/<style>\s*[^<]/)
    expect(ui).toMatch(/<script>\s*[^<]/)
    expect(ui).not.toMatch(/<script\b[^>]*\bsrc\s*=/i)
    expect(ui).not.toMatch(/<link\b[^>]*\bhref\s*=/i)
    expect(ui).not.toContain('<!-- UI_STYLES -->')
    expect(ui).not.toContain('<!-- UI_SCRIPT -->')
  })

  it('announces export results and errors to assistive technology', async () => {
    const ui = await readDist('ui.html')

    expect(ui).toMatch(/id="stats"[^>]*role="status"/)
    expect(ui).toMatch(/id="stats"[^>]*aria-atomic="true"/)
    expect(ui).toMatch(/id="error"[^>]*role="alert"/)
    expect(ui).toMatch(/id="error"[^>]*aria-atomic="true"/)
    expect(ui).toMatch(/class="stats announcer"[^>]*id="stats"/)
    expect(ui).toMatch(/class="error announcer"[^>]*id="error"/)
    expect(ui).not.toContain('statsEl.classList.remove("hidden")')
    expect(ui).not.toContain('errorEl.classList.add("hidden")')
    expect(ui).toContain('statsEl.textContent = "";')
    expect(ui.match(/clearError\(\);/g)).toHaveLength(2)
  })
})
