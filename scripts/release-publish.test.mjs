import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  PUBLIC_NPM_REGISTRY,
  REQUIRED_NPM_VERSION,
  assertNpmVersion,
  runPackedTarballConsumer,
  runPublicRegistryConsumer,
  runReleasePublish,
  validatePublishedPackage,
  verifyExactMain,
} from './release-publish.mjs'
import { PUBLIC_RELEASE_PACKAGES } from './release-config.mjs'

const VERSION = '5.0.0'
const SHA = '0123456789abcdef0123456789abcdef01234567'
const TAG_REF = `refs/tags/v${VERSION}`
const REPOSITORY = 'https://github.com/marklearst/figmavars'
const WORKFLOW_PATH = '.github/workflows/ci.yml'

function fixtureArtifacts() {
  const directory = mkdtempSync(path.join(tmpdir(), 'figmavars-publish-'))
  const artifacts = PUBLIC_RELEASE_PACKAGES.map(config => {
    const stem = config.name.slice('@figmavars/'.length)
    const file = `figmavars-${stem}-${VERSION}.tgz`
    const bytes = Buffer.from(`${config.name} ${VERSION}\n`)
    writeFileSync(path.join(directory, file), bytes)
    return {
      name: config.name,
      file,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  })
  writeFileSync(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify({ version: VERSION, artifacts }, null, 2)}\n`
  )
  writeFileSync(
    path.join(directory, 'SHA256SUMS'),
    `${artifacts.map(item => `${item.sha256}  ${item.file}`).join('\n')}\n`
  )
  return { artifacts, directory }
}

function statementFor(name, bytes, overrides = {}) {
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [
      {
        name: `pkg:npm/${name.replace('@', '%40')}@${VERSION}`,
        digest: {
          sha512: createHash('sha512').update(bytes).digest('hex'),
        },
      },
    ],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: REPOSITORY,
            path: WORKFLOW_PATH,
            ref: TAG_REF,
          },
        },
        resolvedDependencies: [
          {
            uri: `git+${REPOSITORY}@${TAG_REF}`,
            digest: { gitCommit: SHA },
          },
        ],
      },
    },
  }
  Object.assign(statement, overrides)
  return statement
}

function attestationFor(name, bytes, overrides = {}) {
  const statement = statementFor(name, bytes, overrides)
  return {
    attestations: [
      {
        predicateType: 'https://slsa.dev/provenance/v1',
        bundle: {
          mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3',
          dsseEnvelope: {
            payload: Buffer.from(JSON.stringify(statement)).toString('base64'),
          },
        },
      },
    ],
  }
}

function metadataFor(name, bytes, registry = PUBLIC_NPM_REGISTRY) {
  const encodedName = name.replace('/', '%2f')
  return {
    name,
    version: VERSION,
    'dist-tags': { latest: VERSION },
    dist: {
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      attestations: {
        url: `${registry}-/npm/v1/attestations/${encodedName}@${VERSION}`,
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
      },
    },
  }
}

function fakePublishedPackage(directory, name) {
  const stem = name.slice('@figmavars/'.length)
  const artifactPath = path.join(directory, `figmavars-${stem}-${VERSION}.tgz`)
  const bytes = readFileSync(artifactPath)
  return {
    artifactPath,
    attestation: attestationFor(name, bytes),
    metadata: metadataFor(name, bytes),
  }
}

test('requires the exact npm release version', () => {
  assert.equal(REQUIRED_NPM_VERSION, '11.18.0')
  assert.doesNotThrow(() => assertNpmVersion('11.18.0\n'))
  assert.throws(() => assertNpmVersion('11.18.1\n'), /npm 11\.18\.0/)
})

test('freshly fetches origin main and requires tag, main, and GITHUB_SHA equality', () => {
  const calls = []
  const runCommand = (command, args) => {
    calls.push([command, ...args])
    if (args[0] === 'fetch') return { status: 0, stdout: '', stderr: '' }
    if (args[1] === `${TAG_REF}^{commit}`) {
      return { status: 0, stdout: `${SHA}\n`, stderr: '' }
    }
    return { status: 0, stdout: `${SHA}\n`, stderr: '' }
  }

  assert.doesNotThrow(() =>
    verifyExactMain({
      githubRef: TAG_REF,
      githubSha: SHA,
      runCommand,
    })
  )
  assert.deepEqual(calls, [
    [
      'git',
      'fetch',
      '--force',
      '--no-tags',
      'origin',
      'refs/heads/main:refs/remotes/origin/main',
    ],
    ['git', 'rev-parse', `${TAG_REF}^{commit}`],
    ['git', 'rev-parse', 'refs/remotes/origin/main^{commit}'],
  ])

  assert.throws(
    () =>
      verifyExactMain({
        githubRef: TAG_REF,
        githubSha: SHA,
        runCommand(command, args) {
          const result = runCommand(command, args)
          if (args[1] === 'refs/remotes/origin/main^{commit}') {
            return { ...result, stdout: `${'f'.repeat(40)}\n` }
          }
          return result
        },
      }),
    /origin\/main.*GITHUB_SHA/
  )
})

test('validates one exact identity-aware SLSA provenance statement', () => {
  const fixture = fixtureArtifacts()
  try {
    const published = fakePublishedPackage(fixture.directory, '@figmavars/core')
    assert.doesNotThrow(() =>
      validatePublishedPackage({
        ...published,
        expected: {
          name: '@figmavars/core',
          version: VERSION,
          repository: REPOSITORY,
          workflowPath: WORKFLOW_PATH,
          tagRef: TAG_REF,
          commitSha: SHA,
          registry: PUBLIC_NPM_REGISTRY,
        },
      })
    )

    const cases = [
      [
        'two subjects',
        statement => statement.subject.push(statement.subject[0]),
      ],
      [
        'wrong PURL',
        statement => {
          statement.subject[0].name = 'pkg:npm/%40figmavars/core@5.0.1'
        },
      ],
      [
        'wrong SHA-512',
        statement => {
          statement.subject[0].digest.sha512 = '0'.repeat(128)
        },
      ],
      [
        'wrong repository',
        statement => {
          statement.predicate.buildDefinition.externalParameters.workflow.repository =
            'https://github.com/other/repository'
        },
      ],
      [
        'wrong workflow',
        statement => {
          statement.predicate.buildDefinition.externalParameters.workflow.path =
            '.github/workflows/release.yml'
        },
      ],
      [
        'wrong ref',
        statement => {
          statement.predicate.buildDefinition.externalParameters.workflow.ref =
            'refs/heads/main'
        },
      ],
      [
        'wrong commit',
        statement => {
          statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit =
            'f'.repeat(40)
        },
      ],
    ]

    for (const [label, mutate] of cases) {
      const bytes = readFileSync(published.artifactPath)
      const statement = statementFor('@figmavars/core', bytes)
      mutate(statement)
      const attestation = {
        attestations: [
          {
            predicateType: 'https://slsa.dev/provenance/v1',
            bundle: {
              dsseEnvelope: {
                payload: Buffer.from(JSON.stringify(statement)).toString(
                  'base64'
                ),
              },
            },
          },
        ],
      }
      assert.throws(
        () =>
          validatePublishedPackage({
            ...published,
            attestation,
            expected: {
              name: '@figmavars/core',
              version: VERSION,
              repository: REPOSITORY,
              workflowPath: WORKFLOW_PATH,
              tagRef: TAG_REF,
              commitSha: SHA,
              registry: PUBLIC_NPM_REGISTRY,
            },
          }),
        Error,
        label
      )
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('publishes in dependency order, resumes partial publication, and polls delayed entries', async () => {
  const fixture = fixtureArtifacts()
  const calls = []
  const states = new Map()
  const delays = new Map()
  const attestationByUrl = new Map()
  const attestationDelays = new Map()
  for (const config of PUBLIC_RELEASE_PACKAGES) {
    const published = fakePublishedPackage(fixture.directory, config.name)
    states.set(config.name, {
      metadata: published.metadata,
      present: config.name === '@figmavars/core',
    })
    delays.set(config.name, config.name === '@figmavars/mcp' ? 1 : 0)
    attestationByUrl.set(
      published.metadata.dist.attestations.url,
      published.attestation
    )
    attestationDelays.set(
      published.metadata.dist.attestations.url,
      config.name === '@figmavars/mcp' ? 1 : 0
    )
  }

  let npmrcPath
  const runCommand = (command, args, options = {}) => {
    calls.push([command, ...args])
    assert.equal(options.env.NPM_TOKEN, undefined)
    assert.equal(options.env.NODE_AUTH_TOKEN, undefined)
    npmrcPath = options.env.NPM_CONFIG_USERCONFIG
    assert.match(readFileSync(npmrcPath, 'utf8'), /bootstrap-token/)
    if (args[0] === '--version') {
      return { status: 0, stdout: '11.18.0\n', stderr: '' }
    }
    if (args[0] === 'view') {
      const name = args[1].slice(0, args[1].lastIndexOf('@'))
      const state = states.get(name)
      if (!state.present || delays.get(name) > 0) {
        delays.set(name, Math.max(0, delays.get(name) - 1))
        return { status: 1, stdout: '', stderr: 'npm error code E404\n' }
      }
      return {
        status: 0,
        stdout: JSON.stringify(state.metadata),
        stderr: '',
      }
    }
    if (args[0] === 'publish') {
      const artifact = fixture.artifacts.find(item =>
        args[1].endsWith(item.file)
      )
      states.get(artifact.name).present = true
      return { status: 0, stdout: '', stderr: '' }
    }
    throw new Error(`unexpected command ${command} ${args.join(' ')}`)
  }

  try {
    const result = await runReleasePublish({
      artifactDirectory: fixture.directory,
      environment: {
        ...process.env,
        NPM_TOKEN: 'bootstrap-token',
        NODE_AUTH_TOKEN: 'must-not-leak',
      },
      githubRef: TAG_REF,
      githubSha: SHA,
      maxPollAttempts: 3,
      retryDelayMs: 0,
      runCommand,
      sleep: async () => {},
      fetchJson: async url => {
        if (attestationDelays.get(url) > 0) {
          attestationDelays.set(url, attestationDelays.get(url) - 1)
          return { status: 404, value: { error: 'not found' } }
        }
        return { status: 200, value: attestationByUrl.get(url) }
      },
    })
    assert.equal(result.mode, 'bootstrap')
    assert.deepEqual(
      calls.filter(call => call[1] === 'publish').map(call => call[2]),
      fixture.artifacts
        .slice(1)
        .map(item => path.join(fixture.directory, item.file))
    )
    assert.equal(existsSync(npmrcPath), false)
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('OIDC mode supplies no token environment or token-bearing npm config', async () => {
  const fixture = fixtureArtifacts()
  const attestationByUrl = new Map()
  const metadataByName = new Map()
  for (const config of PUBLIC_RELEASE_PACKAGES) {
    const published = fakePublishedPackage(fixture.directory, config.name)
    metadataByName.set(config.name, published.metadata)
    attestationByUrl.set(
      published.metadata.dist.attestations.url,
      published.attestation
    )
  }
  let npmrcPath
  try {
    const result = await runReleasePublish({
      artifactDirectory: fixture.directory,
      environment: {
        ...process.env,
        NPM_TOKEN: '',
        NODE_AUTH_TOKEN: 'must-not-leak',
        NPM_CONFIG_TOKEN: 'must-not-leak',
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example/token',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-request-token',
      },
      githubRef: TAG_REF,
      githubSha: SHA,
      runCommand(command, args, options = {}) {
        npmrcPath = options.env.NPM_CONFIG_USERCONFIG
        assert.equal(readFileSync(npmrcPath, 'utf8'), '')
        assert.equal(options.env.NPM_TOKEN, undefined)
        assert.equal(options.env.NODE_AUTH_TOKEN, undefined)
        assert.equal(options.env.NPM_CONFIG_TOKEN, undefined)
        assert.equal(
          options.env.ACTIONS_ID_TOKEN_REQUEST_URL,
          'https://oidc.example/token'
        )
        if (args[0] === '--version') {
          return { status: 0, stdout: '11.18.0\n', stderr: '' }
        }
        if (args[0] === 'view') {
          const name = args[1].slice(0, args[1].lastIndexOf('@'))
          return {
            status: 0,
            stdout: JSON.stringify(metadataByName.get(name)),
            stderr: '',
          }
        }
        throw new Error(`unexpected command ${command} ${args.join(' ')}`)
      },
      fetchJson: async url => ({
        status: 200,
        value: attestationByUrl.get(url),
      }),
    })
    assert.equal(result.mode, 'oidc')
    assert.equal(existsSync(npmrcPath), false)
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('fails closed on malformed registry state and finite polling exhaustion', async () => {
  const fixture = fixtureArtifacts()
  try {
    await assert.rejects(
      () =>
        runReleasePublish({
          artifactDirectory: fixture.directory,
          environment: { ...process.env, NPM_TOKEN: '' },
          githubRef: TAG_REF,
          githubSha: SHA,
          maxPollAttempts: 2,
          retryDelayMs: 0,
          runCommand(command, args) {
            if (args[0] === '--version') {
              return { status: 0, stdout: '11.18.0\n', stderr: '' }
            }
            if (args[0] === 'view') {
              return {
                status: 1,
                stdout: '',
                stderr: 'npm error code E404\n',
              }
            }
            if (args[0] === 'publish') {
              return { status: 0, stdout: '', stderr: '' }
            }
            throw new Error(`unexpected command ${command}`)
          },
          sleep: async () => {},
          fetchJson: async () => {
            throw new Error('attestations must not be fetched for E404')
          },
        }),
      /registry polling exhausted/
    )

    await assert.rejects(
      () =>
        runReleasePublish({
          artifactDirectory: fixture.directory,
          environment: { ...process.env, NPM_TOKEN: '' },
          githubRef: TAG_REF,
          githubSha: SHA,
          runCommand(command, args) {
            if (args[0] === '--version') {
              return { status: 0, stdout: '11.18.0\n', stderr: '' }
            }
            if (args[0] === 'view') {
              return { status: 0, stdout: '{', stderr: '' }
            }
            throw new Error(`unexpected command ${command}`)
          },
        }),
      /valid JSON/
    )
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('reports a timed-out attestation request with package context', async () => {
  const fixture = fixtureArtifacts()
  const published = fakePublishedPackage(fixture.directory, '@figmavars/core')
  try {
    await assert.rejects(
      () =>
        runReleasePublish({
          artifactDirectory: fixture.directory,
          environment: { ...process.env, NPM_TOKEN: '' },
          githubRef: TAG_REF,
          githubSha: SHA,
          runCommand(command, args) {
            if (args[0] === '--version') {
              return { status: 0, stdout: '11.18.0\n', stderr: '' }
            }
            if (args[0] === 'view') {
              return {
                status: 0,
                stdout: JSON.stringify(published.metadata),
                stderr: '',
              }
            }
            throw new Error(`unexpected command ${command}`)
          },
          fetchJson: async () => {
            throw new DOMException('request timed out', 'TimeoutError')
          },
        }),
      /@figmavars\/core@5\.0\.0: attestation request timed out/
    )
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('smoke-tests downloaded tarballs without workspace dependencies', () => {
  const fixture = fixtureArtifacts()
  const calls = []
  const seenEnvironments = []
  try {
    const result = runPackedTarballConsumer({
      artifactDirectory: fixture.directory,
      environment: {
        ...process.env,
        NPM_TOKEN: 'must-not-leak',
        NODE_AUTH_TOKEN: 'must-not-leak',
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'must-not-leak',
        GITHUB_TOKEN: 'must-not-leak',
      },
      runCommand(command, args, options = {}) {
        calls.push([command, ...args])
        seenEnvironments.push(options.env)
        if (command === 'npm' && args[0] === 'install') {
          for (const config of PUBLIC_RELEASE_PACKAGES) {
            const packageDirectory = path.join(
              options.cwd,
              'node_modules',
              ...config.name.split('/')
            )
            mkdirSync(packageDirectory, { recursive: true })
            writeFileSync(
              path.join(packageDirectory, 'package.json'),
              `${JSON.stringify({ name: config.name, version: VERSION })}\n`
            )
          }
        }
        return { status: 0, stdout: '', stderr: '' }
      },
    })

    assert.equal(result.version, VERSION)
    assert.deepEqual(
      result.packages,
      PUBLIC_RELEASE_PACKAGES.map(config => config.name)
    )
    assert.equal(
      calls.some(call => call[0] === 'pnpm'),
      false
    )
    const install = calls.find(
      call => call[0] === 'npm' && call[1] === 'install'
    )
    assert.ok(install)
    for (const artifact of fixture.artifacts) {
      assert.ok(install.includes(path.join(fixture.directory, artifact.file)))
    }
    assert.ok(install.includes('--package-lock=false'))
    assert.ok(install.includes('--no-save'))
    for (const environment of seenEnvironments) {
      for (const key of [
        'NPM_TOKEN',
        'NODE_AUTH_TOKEN',
        'ACTIONS_ID_TOKEN_REQUEST_URL',
        'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
        'GITHUB_TOKEN',
      ]) {
        assert.equal(environment[key], undefined, `${key} must be cleared`)
      }
      assert.notEqual(environment.HOME, process.env.HOME)
      assert.match(environment.NPM_CONFIG_USERCONFIG, /npmrc$/)
      assert.match(environment.NPM_CONFIG_CACHE, /npm-cache$/)
    }
    for (const bin of ['figma-vars', 'figma-vars-export', 'figma-vars-mcp']) {
      assert.ok(
        calls.some(call => call[0].endsWith(`/node_modules/.bin/${bin}`))
      )
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('creates a hermetic public-registry consumer with exact installs and signature audit', async () => {
  const calls = []
  const seenEnvironments = []
  await runPublicRegistryConsumer({
    version: VERSION,
    environment: {
      ...process.env,
      NPM_TOKEN: 'must-not-leak',
      NODE_AUTH_TOKEN: 'must-not-leak',
      NPM_CONFIG_PROVENANCE: 'true',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'must-not-leak',
      SIGSTORE_ID_TOKEN: 'must-not-leak',
      GH_TOKEN: 'must-not-leak',
      GITHUB_TOKEN: 'must-not-leak',
    },
    runCommand(command, args, options = {}) {
      calls.push([command, ...args])
      seenEnvironments.push(options.env)
      if (command === 'npm' && args[0] === '--version') {
        return { status: 0, stdout: '11.18.0\n', stderr: '' }
      }
      if (command === 'npm' && args[0] === 'install') {
        for (const config of PUBLIC_RELEASE_PACKAGES) {
          const packageDirectory = path.join(
            options.cwd,
            'node_modules',
            ...config.name.split('/')
          )
          mkdirSync(packageDirectory, { recursive: true })
          writeFileSync(
            path.join(packageDirectory, 'package.json'),
            `${JSON.stringify({ name: config.name, version: VERSION })}\n`
          )
        }
      }
      return { status: 0, stdout: '', stderr: '' }
    },
  })

  const install = calls.find(call => call[0] === 'npm' && call[1] === 'install')
  assert.ok(install)
  for (const config of PUBLIC_RELEASE_PACKAGES) {
    assert.ok(install.includes(`${config.name}@${VERSION}`))
  }
  assert.deepEqual(
    calls.filter(call => call[0] === 'npm' && call[1] === 'audit'),
    [['npm', 'audit', 'signatures', `--registry=${PUBLIC_NPM_REGISTRY}`]]
  )
  for (const environment of seenEnvironments) {
    for (const key of [
      'NPM_TOKEN',
      'NODE_AUTH_TOKEN',
      'NPM_CONFIG_PROVENANCE',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      'SIGSTORE_ID_TOKEN',
      'GH_TOKEN',
      'GITHUB_TOKEN',
    ]) {
      assert.equal(environment[key], undefined, `${key} must be cleared`)
    }
    assert.notEqual(environment.HOME, process.env.HOME)
    assert.match(environment.NPM_CONFIG_USERCONFIG, /npmrc$/)
    assert.match(environment.NPM_CONFIG_CACHE, /npm-cache$/)
  }
  for (const specifier of [
    '@figmavars/core',
    '@figmavars/core/types',
    '@figmavars/dtcg',
    '@figmavars/hooks',
    '@figmavars/hooks/core',
    '@figmavars/mcp',
  ]) {
    assert.ok(
      calls.some(
        call =>
          call[0] === 'node' &&
          call.join(' ').includes(`import('${specifier}')`)
      ),
      `missing ESM smoke for ${specifier}`
    )
  }
  for (const specifier of [
    '@figmavars/core',
    '@figmavars/core/types',
    '@figmavars/dtcg',
    '@figmavars/hooks',
    '@figmavars/hooks/core',
  ]) {
    assert.ok(
      calls.some(
        call =>
          call[0] === 'node' &&
          call.join(' ').includes(`require('${specifier}')`)
      ),
      `missing CommonJS smoke for ${specifier}`
    )
  }
  for (const bin of ['figma-vars', 'figma-vars-export', 'figma-vars-mcp']) {
    assert.ok(calls.some(call => call[0].endsWith(`/node_modules/.bin/${bin}`)))
  }
})
