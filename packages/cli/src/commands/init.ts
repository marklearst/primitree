import fs from 'node:fs/promises'
import path from 'node:path'
import { buildPipeline } from '@figmavars/dtcg'
import { getStringFlag, type ParsedArgs } from '../args'
import { fileExists, readJsonFile, writePipelineFiles } from '../io'
import { sampleVariables } from '../sample'

export const initHelp = `
figma-vars init — scaffold a design tokens repo

Creates a working tokens repository: a variables.json (sample data unless
--from is given), the full generated pipeline, a package.json with rebuild
scripts, and a GitHub Actions workflow wired up at .github/workflows/.

Usage:
  figma-vars init [dir] [options]

Options:
  --from <variables.json>   Seed from a real Figma variables export
  --name <name>             Project name (default: directory name)

Examples:
  figma-vars init my-tokens
  figma-vars init my-tokens --from ./variables.json
`

function tokensPackageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'figma-vars build variables.json --out . --no-github-action',
        check: 'figma-vars check variables.json && figma-vars check tokens',
        diff: 'figma-vars diff backup/variables.json variables.json',
        backup: 'mkdir -p backup && cp variables.json backup/variables.json',
      },
      devDependencies: {
        '@figmavars/cli': 'latest',
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

function repoReadme(name: string): string {
  return `# ${name}

Design tokens pipeline generated with [\`@figmavars/cli\`](https://github.com/marklearst/figmavars).

## Workflow

1. Export variables from Figma into \`variables.json\`
   (\`figma-vars export\` on Enterprise, or a plugin like TokensBrücke on any plan).
2. \`npm run diff\` — review what changed against \`backup/variables.json\`.
3. \`npm run build\` — regenerate DTCG tokens, CSS, Tailwind theme, and types.
4. \`npm run backup\` — snapshot the export you just shipped.

Pushing a new \`variables.json\` to GitHub triggers the workflow in
\`.github/workflows/design-tokens.yml\`, which rebuilds and commits the
pipeline automatically.
`
}

export async function runInit(args: ParsedArgs): Promise<void> {
  const dir = path.resolve(args.positionals[0] ?? '.')
  const name =
    getStringFlag(args.flags, 'name') ?? path.basename(dir) ?? 'design-tokens'

  await fs.mkdir(dir, { recursive: true })

  const from = getStringFlag(args.flags, 'from')
  const variables = from ? await readJsonFile(from) : sampleVariables

  const variablesPath = path.join(dir, 'variables.json')
  if (await fileExists(variablesPath)) {
    throw new Error(
      `${variablesPath} already exists; refusing to overwrite. ` +
        'Run figma-vars build directly instead.'
    )
  }
  await fs.writeFile(
    variablesPath,
    `${JSON.stringify(variables, null, 2)}\n`,
    'utf8'
  )

  const result = buildPipeline(variables, {
    resolverName: name,
    githubAction: false,
    readme: false,
  })
  await writePipelineFiles(dir, result.files)

  // Repo-level files the pipeline itself does not own.
  await fs.writeFile(path.join(dir, 'package.json'), tokensPackageJson(name))
  await fs.writeFile(path.join(dir, '.gitignore'), tokensGitignore())
  await fs.writeFile(path.join(dir, 'README.md'), repoReadme(name))

  const workflowDir = path.join(dir, '.github', 'workflows')
  await fs.mkdir(workflowDir, { recursive: true })
  const workflow = buildPipeline(variables, {
    resolverName: name,
  }).files.find(f => f.path === 'design-tokens.workflow.yml')
  if (workflow) {
    await fs.writeFile(
      path.join(workflowDir, 'design-tokens.yml'),
      workflow.contents.replace(
        '# If this file is not at the repository root, move it to .github/workflows/.\n',
        ''
      ),
      'utf8'
    )
  }

  // Seed the backup so `npm run diff` works immediately.
  const backupDir = path.join(dir, 'backup')
  await fs.mkdir(backupDir, { recursive: true })
  await fs.copyFile(variablesPath, path.join(backupDir, 'variables.json'))

  console.log(`Scaffolded tokens repo in ${dir}`)
  console.log(
    from
      ? `Seeded from ${from}`
      : 'Seeded with sample variables — replace variables.json with your export'
  )
  console.log('Next steps:')
  console.log(`  cd ${path.relative(process.cwd(), dir) || '.'}`)
  console.log('  npm install')
  console.log('  npm run build')
}
