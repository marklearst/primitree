#!/usr/bin/env node

// Runs the real Primitree CLI against a scratch copy of this site's tokens and
// records what each command prints, so the homepage shows real output. The
// break-* commands need the extra sources this script adds to that copy.
// `node scripts/capture-site.mjs` rewrites the recording;
// `--check` compares it with the committed file and exits 1 when they differ.

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ruleBreaks } from '../lib/tokens/breaks.ts'

const docsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const tokensRoot = path.join(docsRoot, 'tokens')
const recordingPath = path.join(docsRoot, 'lib/landing/site-cli.json')
const light = 'generated/resolved/light-full.tokens.json'
const dark = 'generated/resolved/dark-full.tokens.json'

const commands = [
  { id: 'check', argv: ['check', '--source', 'light-full'] },
  { id: 'check-dark', argv: ['check', '--source', 'dark-full'] },
  {
    id: 'inspect',
    argv: ['inspect', 'semantic.accent.solid', '--source', 'light-full'],
  },
  { id: 'diff-theme', argv: ['diff', light, dark, '--source', 'light-full'] },
  { id: 'build', argv: ['build', '--source', 'light-full'] },
  { id: 'build-check', argv: ['build', '--source', 'light-full', '--check'] },
  { id: 'break-literal', argv: ['check', '--source', 'break-literal'] },
  { id: 'break-skip', argv: ['check', '--source', 'break-skip'] },
  {
    id: 'break-skip-json',
    argv: ['check', '--source', 'break-skip', '--format', 'json'],
  },
  { id: 'break-stray', argv: ['check', '--source', 'break-stray'] },
  { id: 'break-owner', argv: ['check', '--source', 'break-owner'] },
]

/** The entry point `primitree` runs: the CLI package's `./bin` export. */
function cliEntry() {
  try {
    return createRequire(import.meta.url).resolve('@primitree/cli/bin')
  } catch {
    throw new Error(
      'The Primitree CLI is not built. Run pnpm --filter @primitree/cli build first.'
    )
  }
}

function run(entry, cwd, argv) {
  const result = spawnSync(process.execPath, [entry, ...argv], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  if (result.error !== undefined) {
    throw result.error
  }
  return {
    stdout: result.stdout.trimEnd(),
    stderr: result.stderr.trimEnd(),
    exitCode: result.status ?? 1,
  }
}

/** Adds the broken sources to the scratch config, one file per rule that edits
 * the token document. The published config stays free of them. */
function writeBrokenSources(scratch) {
  const document = JSON.parse(readFileSync(path.join(scratch, light), 'utf8'))
  for (const [name, rule] of Object.entries(ruleBreaks)) {
    if (rule.edit === undefined) {
      continue
    }
    const copy = structuredClone(document)
    rule.edit(copy)
    writeFileSync(
      path.join(scratch, `generated/resolved/break-${name}.tokens.json`),
      `${JSON.stringify(copy, null, 2)}\n`
    )
  }
  const configPath = path.join(scratch, 'primitree.config.ts')
  const config = readFileSync(configPath, 'utf8')
  writeFileSync(
    configPath,
    config.replace(
      "    'light-full': source('light-full'),",
      `    'light-full': source('light-full'),
    'break-literal': source('break-literal'),
    'break-skip': source('break-skip'),
    'break-stray': source('break-stray'),
    'break-owner': {
      ...source('light-full'),
      ownership: { paths: ownership.paths },
      outputs: { directory: './generated/cli/break-owner', formats: ['css'] },
    },`
    )
  )
}

export function captureSite() {
  const entry = cliEntry()
  const scratch = mkdtempSync(path.join(tmpdir(), 'primitree-site-'))
  try {
    cpSync(tokensRoot, scratch, { recursive: true })
    writeBrokenSources(scratch)
    const recorded = {}
    for (const { id, argv } of commands) {
      recorded[id] = {
        command: `primitree ${argv.join(' ')}`,
        ...run(entry, scratch, argv),
      }
    }
    // The server reads the Resolver's sets, so it gets them without the
    // generated folder beside them.
    cpSync(tokensRoot, path.join(scratch, 'mcp-tokens'), {
      recursive: true,
      filter: source => !/(^|[\\/])generated$/u.test(source),
    })
    recorded.mcp = captureMcp(scratch)
    return recorded
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** Asks the real MCP server for one token over stdio, the way an agent would. */
function captureMcp(scratch) {
  const entry = path.resolve(docsRoot, '../../packages/mcp/dist/cli.js')
  const tokenPath = 'component.button.primary.background'
  const input = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'capture-site', version: '1' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_token', arguments: { path: tokenPath } },
    },
  ]
    .map(message => JSON.stringify(message))
    .join('\n')
  const result = spawnSync(
    process.execPath,
    [entry, '--tokens', path.join(scratch, 'mcp-tokens')],
    { encoding: 'utf8', input: `${input}\n`, timeout: 15000 }
  )
  const reply = result.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .find(message => message.id === 2)
  const text = reply?.result?.content?.[0]?.text
  if (text === undefined) {
    throw new Error(`The MCP server returned no token: ${result.stderr}`)
  }
  return {
    command: `get_token { "path": "${tokenPath}" }`,
    stdout: JSON.stringify(JSON.parse(text), null, 2),
    stderr: '',
    exitCode: 0,
  }
}

const serialize = recording => `${JSON.stringify(recording, null, 2)}\n`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = serialize(captureSite())
  if (process.argv.includes('--check')) {
    const current = existsSync(recordingPath)
      ? readFileSync(recordingPath, 'utf8')
      : ''
    if (current !== next) {
      console.error(
        `${path.relative(process.cwd(), recordingPath)} is out of date. Run node scripts/capture-site.mjs.`
      )
      process.exit(1)
    }
    console.log('The homepage CLI recording matches the site tokens.')
  } else {
    writeFileSync(recordingPath, next)
    console.log(`Wrote ${path.relative(process.cwd(), recordingPath)}.`)
  }
}
