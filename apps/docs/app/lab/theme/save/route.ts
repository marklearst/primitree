import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextResponse } from 'next/server'

const CONFIG_PATH = 'tokens/theme.config.json'
const SAVED_PATH = 'tokens/lab-saved.json'

/** Writes the lab's keeper to the file the build reads, and rebuilds the tokens,
 * so saving ships the decision. It answers in development alone. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }
  const body = await request.json()
  const config = {
    hue: Number(body.hue),
    brandChroma: Number(body.brandChroma),
    neutralTint: Number(body.neutralTint),
  }
  const root = process.cwd()
  await writeFile(
    resolve(root, CONFIG_PATH),
    `${JSON.stringify(config, null, 2)}\n`
  )
  const saved = await readFile(resolve(root, SAVED_PATH), 'utf8')
    .then(text => JSON.parse(text) as unknown[])
    .catch(() => [])
  await writeFile(
    resolve(root, SAVED_PATH),
    `${JSON.stringify([...saved, body], null, 2)}\n`
  )
  const build = spawnSync(process.execPath, ['scripts/build-site-tokens.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  return NextResponse.json({
    path: `apps/docs/${CONFIG_PATH}`,
    built: build.status === 0,
    output: `${build.stdout}${build.stderr}`.trim(),
  })
}
