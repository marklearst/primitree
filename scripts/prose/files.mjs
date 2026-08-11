import { execFile } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { PUBLIC_RELEASE_PACKAGES } from '../release-config.mjs'

const execFileAsync = promisify(execFile)

const SKIP_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  'artifacts',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

const PUBLIC_COPY_DIRECTORIES = [
  'apps/docs/app',
  'apps/docs/components',
  'apps/docs/lib',
  'apps/figma-plugin/src',
  'apps/playground/src',
  'packages/cli/src',
  'packages/core/src',
  'packages/dtcg/src',
  'packages/hooks/scripts',
  'packages/hooks/src',
  'packages/mcp/src',
  'packages/plugin-export/src',
]

async function walk(root, predicate, { skip = SKIP_DIRECTORIES } = {}) {
  const results = []

  async function visit(directory) {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return
      }
      throw error
    }

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) {
          await visit(absolute)
        }
      } else if (entry.isFile() && predicate(absolute)) {
        results.push(absolute)
      }
    }
  }

  await visit(root)
  return results
}

async function gitMarkdownFiles(root) {
  const { stdout } = await execFileAsync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      '*.md',
      '*.mdx',
    ],
    {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 10 * 1024 * 1024,
    }
  )

  const files = stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(file => path.resolve(root, file))

  const existing = await Promise.all(
    files.map(async file => {
      try {
        await access(file)
        return file
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return null
        }
        throw error
      }
    })
  )

  return existing.filter(file => file !== null)
}

async function hasGitWorktree(root) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      {
        cwd: root,
        encoding: 'utf8',
      }
    )

    return stdout.trim() === 'true'
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 128) {
      return false
    }
    throw error
  }
}

export async function collectMarkdownFiles(
  root,
  { useGit = true, includeGenerated = true } = {}
) {
  const files =
    useGit && (await hasGitWorktree(root))
      ? await gitMarkdownFiles(root)
      : await walk(root, file => /\.mdx?$/u.test(file))

  if (includeGenerated) {
    files.push(
      ...(await walk(path.join(root, 'apps/docs/content/docs/api'), file =>
        /\.mdx?$/u.test(file)
      ))
    )
  }

  return [...new Set(files)].sort()
}

export async function collectGeneratedApiFiles(root) {
  return walk(path.join(root, 'apps/docs/content/docs/api'), () => true, {
    skip: new Set(),
  })
}

export async function collectPackageManifests(root) {
  const candidates = [
    path.join(root, 'package.json'),
    ...(await walk(
      path.join(root, 'apps'),
      file => path.basename(file) === 'package.json'
    )),
    ...(await walk(
      path.join(root, 'packages'),
      file => path.basename(file) === 'package.json'
    )),
  ]

  return [...new Set(candidates)].sort()
}

export async function collectDocsNavigationFiles(root) {
  const files = await walk(
    path.join(root, 'apps/docs/content/docs'),
    file => path.basename(file) === 'meta.json'
  )

  return files.sort()
}

export async function collectFigmaPluginManifestFiles(root) {
  return walk(
    path.join(root, 'apps/figma-plugin'),
    file => path.basename(file) === 'manifest.json'
  )
}

export async function collectSourceFiles(root, directories) {
  const files = []

  for (const directory of directories) {
    files.push(
      ...(await walk(path.join(root, directory), file =>
        /\.[cm]?[jt]sx?$/u.test(file)
      ))
    )
  }

  return [...new Set(files)].sort()
}

export async function collectPublicCopyFiles(root) {
  return collectSourceFiles(root, PUBLIC_COPY_DIRECTORIES)
}

export async function collectPublicHtmlFiles(root) {
  const files = []

  for (const directory of ['apps/figma-plugin/src', 'apps/playground']) {
    files.push(
      ...(await walk(path.join(root, directory), file =>
        file.endsWith('.html')
      ))
    )
  }

  return [...new Set(files)].sort()
}

export async function collectDeclarationFiles(root) {
  const files = []

  for (const config of PUBLIC_RELEASE_PACKAGES) {
    files.push(
      ...(await walk(
        path.join(root, config.path, 'dist'),
        file => /\.d\.[cm]?ts$/u.test(file),
        { skip: new Set() }
      ))
    )
  }

  return [...new Set(files)].sort()
}

const EXPECTED_API_FILES = [
  'cli-config.mdx',
  'core-policy.mdx',
  'core-types.mdx',
  'core.mdx',
  'dtcg.mdx',
  'hooks.mdx',
  'index.mdx',
  'mcp.mdx',
  'meta.json',
]

function portableRelative(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

export function validateGeneratedApiFiles(root, generatedApiFiles) {
  const apiRoot = path.join(root, 'apps/docs/content/docs/api')
  const received = generatedApiFiles
    .map(file => portableRelative(apiRoot, file))
    .sort()

  if (JSON.stringify(received) !== JSON.stringify(EXPECTED_API_FILES)) {
    throw new Error(
      `Generated API files are incomplete. Expected ${EXPECTED_API_FILES.join(', ')}; received ${received.join(', ') || 'none'}.`
    )
  }
}

export function validateBuiltProseFiles(
  root,
  generatedApiFiles,
  declarationFiles
) {
  validateGeneratedApiFiles(root, generatedApiFiles)

  const receivedDeclarations = new Set(
    declarationFiles.map(file => portableRelative(root, file))
  )
  const missingDeclarations = PUBLIC_RELEASE_PACKAGES.flatMap(config => {
    const requiredDeclarationFiles =
      config.name === '@primitree/hooks'
        ? ['dist/index.d.ts', 'dist/index.d.cts']
        : config.requiredDeclarationFiles

    return requiredDeclarationFiles
      .map(file => path.posix.join(config.path, file))
      .filter(file => !receivedDeclarations.has(file))
  })

  if (missingDeclarations.length > 0) {
    throw new Error(
      `Built declarations are missing: ${missingDeclarations.join(', ')}.`
    )
  }
}
