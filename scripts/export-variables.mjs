#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'

const FIGMA_TOKEN = process.env.FIGMA_TOKEN || process.env.FIGMA_PAT

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    fileKey: process.env.FIGMA_FILE_KEY,
    out: 'data/figma-variables.json',
  }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--file-key' || arg === '--fileKey') {
      opts.fileKey = args[i + 1]
      i += 1
    } else if (arg === '--out') {
      opts.out = args[i + 1]
      i += 1
    }
  }
  return opts
}

async function main() {
  const { fileKey, out } = parseArgs()
  if (!FIGMA_TOKEN) {
    console.error('FIGMA_TOKEN (or FIGMA_PAT) is required')
    process.exit(1)
  }
  if (!fileKey) {
    console.error('--file-key or FIGMA_FILE_KEY is required')
    process.exit(1)
  }

  const url = `https://api.figma.com/v1/files/${fileKey}/variables/local`
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Figma-Token': FIGMA_TOKEN,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`Request failed: ${res.status} ${res.statusText}`)
    console.error(text)
    process.exit(1)
  }

  const json = await res.json()
  const outputPath = path.resolve(out)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, JSON.stringify(json, null, 2), 'utf8')
  console.log(`Saved variables to ${outputPath}`)
  if (json?.meta?.variables) {
    console.log(`Variables count: ${Object.keys(json.meta.variables).length}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
