import fs from 'node:fs/promises'
import path from 'node:path'
import { buildPipeline } from '@primitree/dtcg'
import { getBooleanFlag, getStringFlag, type ParsedArgs } from '../args'
import { readJsonFile, writePipelineFiles } from '../io'
import { sampleVariables } from '../sample'

export const initHelp = `
primitree init: create a design tokens repository

Creates variables.json, generated token files, package scripts, and a
GitHub Actions workflow. Pass --from to use an existing variables export.

Usage:
  primitree init [dir] [options]

Options:
  --from <variables.json>   Seed from a real Figma variables export
  --name <name>             Project name (default: directory name)
  --force                   Replace scaffold-owned files; preserve unrelated files

Examples:
  primitree init my-tokens
  primitree init my-tokens --from ./variables.json
`

function tokensPackageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'primitree build variables.json --out . --no-github-action',
        check: 'primitree check variables.json && primitree check tokens',
        diff: 'primitree diff backup/variables.json variables.json',
        backup: 'mkdir -p backup && cp variables.json backup/variables.json',
      },
      devDependencies: {
        '@primitree/cli': 'latest',
      },
    },
    null,
    2
  )}\n`
}

function tokensGitignore(): string {
  return `node_modules/
build/
`
}

interface ScaffoldFinding {
  relativePath: string
  reason: string
}

const trustedMacOSRootAliases = new Set(['etc', 'tmp', 'var'])

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

async function lstatIfPresent(
  filePath: string
): Promise<Awaited<ReturnType<typeof fs.lstat>> | undefined> {
  try {
    return await fs.lstat(filePath)
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return undefined
    }
    throw error
  }
}

async function rootAliasResolvesToDirectory(
  filePath: string
): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isDirectory()
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return false
    }
    throw error
  }
}

async function inspectDestinationParents(
  dir: string
): Promise<ScaffoldFinding | undefined> {
  const root = path.parse(dir).root
  const segments = path.relative(root, dir).split(path.sep).filter(Boolean)
  let currentPath = root

  // macOS ships /etc, /tmp, and /var as root-owned aliases into /private.
  // Trust only those known aliases; every user-controlled component below
  // them must be a real directory.
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index] ?? ''
    currentPath = path.join(currentPath, segment)
    const stats = await lstatIfPresent(currentPath)
    if (!stats) {
      break
    }

    if (stats.isSymbolicLink()) {
      const isTrustedMacOSRootAlias =
        process.platform === 'darwin' &&
        root === path.sep &&
        index === 0 &&
        trustedMacOSRootAliases.has(segment) &&
        (await rootAliasResolvesToDirectory(currentPath))
      if (isTrustedMacOSRootAlias) {
        continue
      }
      return {
        relativePath: path.relative(root, currentPath),
        reason: 'destination parent is a symbolic link',
      }
    }
    if (!stats.isDirectory()) {
      return {
        relativePath: path.relative(root, currentPath),
        reason: 'destination parent is not a directory',
      }
    }
  }

  return undefined
}

function scaffoldError(findings: ScaffoldFinding[], canForce: boolean): Error {
  return new Error(
    `${canForce ? 'Refusing to overwrite' : 'Unsafe'} scaffold-owned paths:\n${findings
      .map(({ relativePath, reason }) => `- ${relativePath}: ${reason}`)
      .join('\n')}\n${
      canForce
        ? 'Re-run with --force to replace generated file paths and leave other paths unchanged.'
        : 'Resolve unsafe path types before retrying; --force cannot bypass them.'
    }`
  )
}

function repoReadme(name: string): string {
  return `# ${name}

This repository uses [\`@primitree/cli\`](https://github.com/marklearst/primitree).

The generated token files use DTCG 2025.10 plus a documented boolean extension.

## Workflow

1. Export variables from Figma into \`variables.json\`
   with \`primitree export\` or a supported variables plugin.
2. Run \`npm run diff\` to compare it with \`backup/variables.json\`.
3. Run \`npm run build\` to rebuild the token files.
4. Run \`npm run backup\` after you ship the change.

The GitHub Actions workflow rebuilds and commits the pipeline after a push
that changes \`variables.json\`. Its file is
\`.github/workflows/design-tokens.yml\`.
`
}

export async function runInit(args: ParsedArgs): Promise<void> {
  const dir = path.resolve(args.positionals[0] ?? '.')
  const name =
    getStringFlag(args.flags, 'name') ?? path.basename(dir) ?? 'design-tokens'
  const force = getBooleanFlag(args.flags, 'force')
  const from = getStringFlag(args.flags, 'from')
  const variables = from ? await readJsonFile(from) : sampleVariables

  const pipeline = buildPipeline(variables, {
    resolverName: name,
    githubAction: false,
    readme: false,
  })
  const workflow = buildPipeline(variables, { resolverName: name }).files.find(
    file => file.path === 'design-tokens.workflow.yml'
  )
  if (!workflow) {
    throw new Error(
      'Generated pipeline did not include design-tokens.workflow.yml'
    )
  }

  const ownedRelativePaths = [
    'variables.json',
    ...pipeline.files.map(file => file.path),
    'package.json',
    '.gitignore',
    'README.md',
    '.github/workflows/design-tokens.yml',
    'backup/variables.json',
  ]
  const findings: ScaffoldFinding[] = []
  const unsafeFindings: ScaffoldFinding[] = []
  const collisions: ScaffoldFinding[] = []
  const symlinkLeaves: string[] = []
  const unsafeAncestors = new Set<string>()

  const destinationParentFinding = await inspectDestinationParents(dir)
  if (destinationParentFinding) {
    findings.push(destinationParentFinding)
    throw scaffoldError(findings, false)
  }

  const dirStats = await lstatIfPresent(dir)
  if (dirStats?.isSymbolicLink()) {
    findings.push({
      relativePath: path.basename(dir) || dir,
      reason: 'target directory is a symbolic link',
    })
    throw scaffoldError(findings, false)
  }
  if (dirStats && !dirStats.isDirectory()) {
    findings.push({
      relativePath: path.basename(dir) || dir,
      reason: 'target is not a directory',
    })
    throw scaffoldError(findings, false)
  }

  for (const relativePath of ownedRelativePaths) {
    const target = path.resolve(dir, relativePath)
    const relativeTarget = path.relative(dir, target)
    if (
      relativeTarget === '' ||
      relativeTarget === '..' ||
      relativeTarget.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeTarget)
    ) {
      const finding = {
        relativePath,
        reason: 'resolves outside the target directory',
      }
      findings.push(finding)
      unsafeFindings.push(finding)
      continue
    }

    const segments = relativeTarget.split(path.sep)
    let hasUnsafeAncestor = false
    for (let index = 1; index < segments.length; index += 1) {
      const ancestorRelativePath = segments.slice(0, index).join(path.sep)
      if (unsafeAncestors.has(ancestorRelativePath)) {
        hasUnsafeAncestor = true
        break
      }

      const ancestorStats = await lstatIfPresent(
        path.join(dir, ancestorRelativePath)
      )
      if (ancestorStats?.isSymbolicLink()) {
        const finding = {
          relativePath: ancestorRelativePath,
          reason: 'ancestor is a symbolic link',
        }
        findings.push(finding)
        unsafeFindings.push(finding)
        unsafeAncestors.add(ancestorRelativePath)
        hasUnsafeAncestor = true
        break
      }
      if (ancestorStats && !ancestorStats.isDirectory()) {
        const finding = {
          relativePath: ancestorRelativePath,
          reason: 'ancestor is not a directory',
        }
        findings.push(finding)
        unsafeFindings.push(finding)
        unsafeAncestors.add(ancestorRelativePath)
        hasUnsafeAncestor = true
        break
      }
    }
    if (hasUnsafeAncestor) {
      continue
    }

    const targetStats = await lstatIfPresent(target)
    if (!targetStats) {
      continue
    }

    if (targetStats.isDirectory()) {
      const finding = {
        relativePath,
        reason: 'is a directory and may contain unrelated data',
      }
      findings.push(finding)
      unsafeFindings.push(finding)
      continue
    }
    if (!targetStats.isFile() && !targetStats.isSymbolicLink()) {
      const finding = {
        relativePath,
        reason: 'is not a regular file or symbolic link',
      }
      findings.push(finding)
      unsafeFindings.push(finding)
      continue
    }

    const finding = {
      relativePath,
      reason: targetStats.isSymbolicLink()
        ? 'symbolic link already exists'
        : 'file already exists',
    }
    findings.push(finding)
    collisions.push(finding)
    if (targetStats.isSymbolicLink()) {
      symlinkLeaves.push(target)
    }
  }

  if (unsafeFindings.length > 0 || (!force && collisions.length > 0)) {
    throw scaffoldError(findings, unsafeFindings.length === 0)
  }

  for (const symlinkLeaf of symlinkLeaves) {
    await fs.unlink(symlinkLeaf)
  }

  await fs.mkdir(dir, { recursive: true })

  const variablesPath = path.join(dir, 'variables.json')
  await fs.writeFile(
    variablesPath,
    `${JSON.stringify(variables, null, 2)}\n`,
    'utf8'
  )

  await writePipelineFiles(dir, pipeline.files)

  // Repo-level files the pipeline itself does not own.
  await fs.writeFile(path.join(dir, 'package.json'), tokensPackageJson(name))
  await fs.writeFile(path.join(dir, '.gitignore'), tokensGitignore())
  await fs.writeFile(path.join(dir, 'README.md'), repoReadme(name))

  const workflowDir = path.join(dir, '.github', 'workflows')
  await fs.mkdir(workflowDir, { recursive: true })
  await fs.writeFile(
    path.join(workflowDir, 'design-tokens.yml'),
    workflow.contents.replace(
      '# Store this file at .github/workflows/design-tokens.yml.\n',
      ''
    ),
    'utf8'
  )

  // Seed the backup so `npm run diff` works immediately.
  const backupDir = path.join(dir, 'backup')
  await fs.mkdir(backupDir, { recursive: true })
  await fs.copyFile(variablesPath, path.join(backupDir, 'variables.json'))

  console.log(`Created a token repository in ${dir}`)
  console.log(
    from
      ? `Copied variables from ${from}`
      : 'Created variables.json from sample data. Replace it with your export.'
  )
  console.log('Next steps:')
  console.log(`  cd ${path.relative(process.cwd(), dir) || '.'}`)
  console.log('  npm install')
  console.log('  npm run build')
}
