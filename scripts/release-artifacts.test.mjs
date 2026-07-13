import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const VERSION = '5.0.0'
const EXPECTED_NAMES = [
  '@figmavars/core',
  '@figmavars/dtcg',
  '@figmavars/cli',
  '@figmavars/hooks',
  '@figmavars/mcp',
]
const EXPECTED_FILES = [
  'figmavars-core-5.0.0.tgz',
  'figmavars-dtcg-5.0.0.tgz',
  'figmavars-cli-5.0.0.tgz',
  'figmavars-hooks-5.0.0.tgz',
  'figmavars-mcp-5.0.0.tgz',
]
const SCRIPT_PATH = fileURLToPath(
  new URL('./release-artifacts.mjs', import.meta.url)
)

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function checksumText(artifacts) {
  return `${artifacts.map(item => `${item.sha256}  ${item.file}`).join('\n')}\n`
}

function writeManifest(directory, manifest) {
  writeFileSync(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
}

function writeChecksums(directory, value) {
  writeFileSync(path.join(directory, 'SHA256SUMS'), value)
}

function makeFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'figmavars-artifacts-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))

  const artifacts = EXPECTED_NAMES.map((name, index) => {
    const file = EXPECTED_FILES[index]
    const bytes = Buffer.from(`fixture:${name}\n`)
    writeFileSync(path.join(directory, file), bytes)
    return { name, file, sha256: digest(bytes) }
  })
  const manifest = { version: VERSION, artifacts }
  writeManifest(directory, manifest)
  writeChecksums(directory, checksumText(artifacts))

  return {
    artifacts,
    directory,
    manifest,
    rewriteChecksums(value = checksumText(manifest.artifacts)) {
      writeChecksums(directory, value)
    },
    rewriteManifest() {
      writeManifest(directory, manifest)
    },
  }
}

function createSymlinkOrSkip(t, target, linkPath, type) {
  try {
    symlinkSync(target, linkPath, type)
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip(`symlinks unavailable: ${error.code}`)
      return false
    }
    throw error
  }
  return true
}

async function releaseArtifactsModule() {
  return import('./release-artifacts.mjs')
}

async function expectInvalid(t, mutate, pattern) {
  const fixture = makeFixture(t)
  await mutate(fixture)
  const { verifyReleaseArtifacts } = await releaseArtifactsModule()
  assert.throws(
    () => verifyReleaseArtifacts({ artifactDirectory: fixture.directory }),
    pattern
  )
}

test('derives canonical artifacts in dependency order', async () => {
  const { expectedArtifacts } = await releaseArtifactsModule()
  assert.deepEqual(
    expectedArtifacts(VERSION),
    EXPECTED_NAMES.map((name, index) => ({
      name,
      file: EXPECTED_FILES[index],
    }))
  )
  assert.throws(() => expectedArtifacts('v5.0.0'), /MAJOR\.MINOR\.PATCH/)
  assert.throws(() => expectedArtifacts('5.0.0-beta.1'), /MAJOR\.MINOR\.PATCH/)
})

test('constructs stable public npm publish dry-run arguments', async () => {
  const { npmPublishDryRunArgs } = await releaseArtifactsModule()
  const artifactPath = path.join(
    tmpdir(),
    'figmavars-artifacts',
    EXPECTED_FILES[0]
  )

  assert.deepEqual(npmPublishDryRunArgs(artifactPath), [
    'publish',
    artifactPath,
    '--dry-run',
    '--offline',
    '--provenance=false',
    '--access=public',
    '--tag=latest',
    '--ignore-scripts',
    '--registry=https://registry.npmjs.org/',
  ])
  assert.throws(
    () => npmPublishDryRunArgs(EXPECTED_FILES[0]),
    /absolute tarball path/i
  )
})

test('accepts exactly five ordered artifacts and performs no writes', async t => {
  const fixture = makeFixture(t)
  const before = new Map(
    ['manifest.json', 'SHA256SUMS', ...EXPECTED_FILES].map(file => [
      file,
      readFileSync(path.join(fixture.directory, file)),
    ])
  )
  const { verifyReleaseArtifacts } = await releaseArtifactsModule()

  const result = verifyReleaseArtifacts({
    artifactDirectory: pathToFileURL(`${fixture.directory}${path.sep}`),
  })

  assert.equal(result.version, VERSION)
  assert.deepEqual(
    result.artifacts.map(({ name, file }) => ({ name, file })),
    EXPECTED_NAMES.map((name, index) => ({
      name,
      file: EXPECTED_FILES[index],
    }))
  )
  for (const artifact of result.artifacts) {
    assert.equal(artifact.path, path.join(fixture.directory, artifact.file))
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/)
  }
  for (const [file, bytes] of before) {
    assert.deepEqual(readFileSync(path.join(fixture.directory, file)), bytes)
  }
})

test('rejects an invalid artifact directory', async t => {
  await t.test('missing', async t => {
    const parent = mkdtempSync(path.join(tmpdir(), 'figmavars-missing-'))
    t.after(() => rmSync(parent, { recursive: true, force: true }))
    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () =>
        verifyReleaseArtifacts({
          artifactDirectory: path.join(parent, 'missing'),
        }),
      /artifact directory.*exist|unable to inspect artifact directory/i
    )
  })

  await t.test('regular file', async t => {
    const parent = mkdtempSync(path.join(tmpdir(), 'figmavars-file-'))
    t.after(() => rmSync(parent, { recursive: true, force: true }))
    const file = path.join(parent, 'artifacts')
    writeFileSync(file, 'not a directory')
    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () => verifyReleaseArtifacts({ artifactDirectory: file }),
      /artifact directory.*real directory/i
    )
  })

  await t.test('symlink', async t => {
    const target = mkdtempSync(path.join(tmpdir(), 'figmavars-target-'))
    const parent = mkdtempSync(path.join(tmpdir(), 'figmavars-link-'))
    t.after(() => rmSync(target, { recursive: true, force: true }))
    t.after(() => rmSync(parent, { recursive: true, force: true }))
    const link = path.join(parent, 'artifacts')
    if (!createSymlinkOrSkip(t, target, link, 'dir')) return
    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () => verifyReleaseArtifacts({ artifactDirectory: link }),
      /artifact directory.*real directory/i
    )
  })

  await t.test('relative path', async () => {
    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () => verifyReleaseArtifacts({ artifactDirectory: 'artifacts/npm' }),
      /absolute path or file URL/i
    )
  })
})

test('rejects malformed manifest metadata', async t => {
  const cases = [
    [
      'missing manifest',
      f => unlinkSync(path.join(f.directory, 'manifest.json')),
      /manifest\.json.*regular file/i,
    ],
    [
      'invalid JSON',
      f => writeFileSync(path.join(f.directory, 'manifest.json'), '{'),
      /manifest\.json.*JSON/i,
    ],
    [
      'null manifest',
      f => writeFileSync(path.join(f.directory, 'manifest.json'), 'null'),
      /manifest\.json.*plain object/i,
    ],
    [
      'array manifest',
      f => writeFileSync(path.join(f.directory, 'manifest.json'), '[]'),
      /manifest\.json.*plain object/i,
    ],
    [
      'missing version',
      f => {
        delete f.manifest.version
        f.rewriteManifest()
      },
      /manifest\.json.*keys/i,
    ],
    [
      'extra top-level key',
      f => {
        f.manifest.generated = true
        f.rewriteManifest()
      },
      /manifest\.json.*keys/i,
    ],
    [
      'non-string version',
      f => {
        f.manifest.version = 5
        f.rewriteManifest()
      },
      /version.*MAJOR\.MINOR\.PATCH/i,
    ],
    [
      'missing version value',
      f => {
        f.manifest.version = ''
        f.rewriteManifest()
      },
      /version.*MAJOR\.MINOR\.PATCH/i,
    ],
    [
      'invalid version',
      f => {
        f.manifest.version = '5.0'
        f.rewriteManifest()
      },
      /version.*MAJOR\.MINOR\.PATCH/i,
    ],
    [
      'prerelease version',
      f => {
        f.manifest.version = '5.0.0-next.1'
        f.rewriteManifest()
      },
      /version.*MAJOR\.MINOR\.PATCH/i,
    ],
    [
      'missing artifacts',
      f => {
        delete f.manifest.artifacts
        f.rewriteManifest()
      },
      /manifest\.json.*keys/i,
    ],
    [
      'non-array artifacts',
      f => {
        f.manifest.artifacts = {}
        f.rewriteManifest()
      },
      /artifacts.*array/i,
    ],
  ]

  for (const [name, mutate, pattern] of cases) {
    await t.test(name, t => expectInvalid(t, mutate, pattern))
  }

  await t.test('manifest path is a directory', async t => {
    await expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, 'manifest.json'))
        mkdirSync(path.join(f.directory, 'manifest.json'))
      },
      /manifest\.json.*regular file/i
    )
  })

  await t.test('manifest path is a symlink', async t => {
    const external = path.join(
      tmpdir(),
      `figmavars-manifest-${process.pid}.json`
    )
    writeFileSync(external, '{}')
    t.after(() => rmSync(external, { force: true }))
    await expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, 'manifest.json'))
        createSymlinkOrSkip(
          t,
          external,
          path.join(f.directory, 'manifest.json')
        )
      },
      /manifest\.json.*regular file/i
    )
  })
})

test('rejects wrong artifact entry count and shape', async t => {
  const cases = [
    [
      'missing entry',
      f => {
        f.manifest.artifacts.pop()
        f.rewriteManifest()
      },
      /exactly 5 artifact entries/i,
    ],
    [
      'extra entry',
      f => {
        f.manifest.artifacts.push({ ...f.manifest.artifacts[0] })
        f.rewriteManifest()
      },
      /exactly 5 artifact entries/i,
    ],
    [
      'null entry',
      f => {
        f.manifest.artifacts[0] = null
        f.rewriteManifest()
      },
      /artifact entry 1.*plain object/i,
    ],
    [
      'array entry',
      f => {
        f.manifest.artifacts[0] = []
        f.rewriteManifest()
      },
      /artifact entry 1.*plain object/i,
    ],
    [
      'missing key',
      f => {
        delete f.manifest.artifacts[0].sha256
        f.rewriteManifest()
      },
      /artifact entry 1.*keys/i,
    ],
    [
      'extra key',
      f => {
        f.manifest.artifacts[0].version = VERSION
        f.rewriteManifest()
      },
      /artifact entry 1.*keys/i,
    ],
  ]
  for (const [name, mutate, pattern] of cases) {
    await t.test(name, t => expectInvalid(t, mutate, pattern))
  }
})

test('rejects wrong package names and order', async t => {
  const cases = [
    [
      'unknown name',
      f => {
        f.manifest.artifacts[0].name = '@figmavars/unknown'
        f.rewriteManifest()
      },
    ],
    [
      'duplicate name',
      f => {
        f.manifest.artifacts[1].name = f.manifest.artifacts[0].name
        f.rewriteManifest()
      },
    ],
    [
      'reordered names',
      f => {
        ;[f.manifest.artifacts[0], f.manifest.artifacts[1]] = [
          f.manifest.artifacts[1],
          f.manifest.artifacts[0],
        ]
        f.rewriteManifest()
      },
    ],
    [
      'empty name',
      f => {
        f.manifest.artifacts[0].name = ''
        f.rewriteManifest()
      },
    ],
    [
      'non-string name',
      f => {
        f.manifest.artifacts[0].name = 1
        f.rewriteManifest()
      },
    ],
  ]
  for (const [name, mutate] of cases) {
    await t.test(name, t =>
      expectInvalid(t, mutate, /artifact entry .*name|duplicate artifact name/i)
    )
  }
})

test('rejects wrong artifact filenames and order', async t => {
  const cases = [
    ['unknown filename', 'figmavars-unknown-5.0.0.tgz'],
    ['wrong version filename', 'figmavars-core-5.0.1.tgz'],
    ['absolute filename', '/tmp/figmavars-core-5.0.0.tgz'],
    ['traversal filename', '../figmavars-core-5.0.0.tgz'],
    ['nested filename', 'nested/figmavars-core-5.0.0.tgz'],
    ['backslash filename', '..\\figmavars-core-5.0.0.tgz'],
    ['empty filename', ''],
    ['non-string filename', 5],
  ]
  for (const [name, value] of cases) {
    await t.test(name, t =>
      expectInvalid(
        t,
        f => {
          f.manifest.artifacts[0].file = value
          f.rewriteManifest()
        },
        /artifact entry 1.*file/i
      )
    )
  }
  await t.test('duplicate filename', t =>
    expectInvalid(
      t,
      f => {
        f.manifest.artifacts[1].file = f.manifest.artifacts[0].file
        f.rewriteManifest()
      },
      /artifact entry 2.*file|duplicate artifact filename/i
    )
  )
  await t.test('reordered filenames', t =>
    expectInvalid(
      t,
      f => {
        const first = f.manifest.artifacts[0].file
        f.manifest.artifacts[0].file = f.manifest.artifacts[1].file
        f.manifest.artifacts[1].file = first
        f.rewriteManifest()
      },
      /artifact entry .*file/i
    )
  )
})

test('rejects malformed manifest digests', async t => {
  const cases = [
    ['non-string', 1],
    ['empty', ''],
    ['short', 'a'.repeat(63)],
    ['uppercase', 'A'.repeat(64)],
    ['nonhex', 'g'.repeat(64)],
  ]
  for (const [name, value] of cases) {
    await t.test(name, t =>
      expectInvalid(
        t,
        f => {
          f.manifest.artifacts[0].sha256 = value
          f.rewriteManifest()
        },
        /artifact entry 1.*sha256/i
      )
    )
  }
})

test('rejects missing, extra, and non-regular artifact files', async t => {
  await t.test('missing tarball', t =>
    expectInvalid(
      t,
      f => unlinkSync(path.join(f.directory, EXPECTED_FILES[0])),
      /figmavars-core-5\.0\.0\.tgz.*regular file/i
    )
  )
  await t.test('extra tarball', t =>
    expectInvalid(
      t,
      f =>
        writeFileSync(path.join(f.directory, 'figmavars-extra-5.0.0.tgz'), ''),
      /artifact directory.*exactly|unexpected artifact directory entry/i
    )
  )
  await t.test('tarball directory', t =>
    expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, EXPECTED_FILES[0]))
        mkdirSync(path.join(f.directory, EXPECTED_FILES[0]))
      },
      /figmavars-core-5\.0\.0\.tgz.*regular file/i
    )
  )
  await t.test('internal tarball symlink', t =>
    expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, EXPECTED_FILES[0]))
        createSymlinkOrSkip(
          t,
          EXPECTED_FILES[1],
          path.join(f.directory, EXPECTED_FILES[0])
        )
      },
      /figmavars-core-5\.0\.0\.tgz.*regular file/i
    )
  )
  await t.test('external tarball symlink', async t => {
    const external = path.join(tmpdir(), `figmavars-tarball-${process.pid}.tgz`)
    writeFileSync(external, 'external')
    t.after(() => rmSync(external, { force: true }))
    await expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, EXPECTED_FILES[0]))
        createSymlinkOrSkip(
          t,
          external,
          path.join(f.directory, EXPECTED_FILES[0])
        )
      },
      /figmavars-core-5\.0\.0\.tgz.*regular file/i
    )
  })
})

test('rejects artifact bytes that do not match both metadata files', async t => {
  await t.test('modified artifact', t =>
    expectInvalid(
      t,
      f => writeFileSync(path.join(f.directory, EXPECTED_FILES[0]), 'modified'),
      /computed SHA-256.*figmavars-core/i
    )
  )

  await t.test('manifest digest changed alone', t =>
    expectInvalid(
      t,
      f => {
        f.manifest.artifacts[0].sha256 = 'a'.repeat(64)
        f.rewriteManifest()
      },
      /SHA256SUMS.*canonical|computed SHA-256/i
    )
  )

  await t.test('checksum digest changed alone', t =>
    expectInvalid(
      t,
      f => {
        const changed = structuredClone(f.manifest.artifacts)
        changed[0].sha256 = 'a'.repeat(64)
        f.rewriteChecksums(checksumText(changed))
      },
      /SHA256SUMS.*canonical/i
    )
  )

  await t.test('both metadata digests changed', t =>
    expectInvalid(
      t,
      f => {
        f.manifest.artifacts[0].sha256 = 'a'.repeat(64)
        f.rewriteManifest()
        f.rewriteChecksums()
      },
      /computed SHA-256.*figmavars-core/i
    )
  )
})

test('requires byte-for-byte canonical SHA256SUMS', async t => {
  const canonicalLines = fixture =>
    checksumText(fixture.manifest.artifacts).trimEnd().split('\n')
  const cases = [
    ['missing line', f => `${canonicalLines(f).slice(0, -1).join('\n')}\n`],
    [
      'extra line',
      f =>
        `${checksumText(f.manifest.artifacts)}${'a'.repeat(64)}  extra.tgz\n`,
    ],
    [
      'duplicate line',
      f => `${canonicalLines(f)[0]}\n${checksumText(f.manifest.artifacts)}`,
    ],
    [
      'reordered lines',
      f => {
        const lines = canonicalLines(f)
        ;[lines[0], lines[1]] = [lines[1], lines[0]]
        return `${lines.join('\n')}\n`
      },
    ],
    [
      'wrong filename',
      f =>
        checksumText(f.manifest.artifacts).replace(
          EXPECTED_FILES[0],
          'wrong.tgz'
        ),
    ],
    [
      'absolute filename',
      f =>
        checksumText(f.manifest.artifacts).replace(
          EXPECTED_FILES[0],
          `/tmp/${EXPECTED_FILES[0]}`
        ),
    ],
    [
      'traversal filename',
      f =>
        checksumText(f.manifest.artifacts).replace(
          EXPECTED_FILES[0],
          `../${EXPECTED_FILES[0]}`
        ),
    ],
    [
      'uppercase digest',
      f =>
        checksumText(f.manifest.artifacts).replace(
          f.manifest.artifacts[0].sha256,
          f.manifest.artifacts[0].sha256.toUpperCase()
        ),
    ],
    [
      'short digest',
      f =>
        checksumText(f.manifest.artifacts).replace(
          f.manifest.artifacts[0].sha256,
          'a'.repeat(63)
        ),
    ],
    [
      'nonhex digest',
      f =>
        checksumText(f.manifest.artifacts).replace(
          f.manifest.artifacts[0].sha256,
          'g'.repeat(64)
        ),
    ],
    [
      'one-space separator',
      f => checksumText(f.manifest.artifacts).replace('  ', ' '),
    ],
    [
      'tab separator',
      f => checksumText(f.manifest.artifacts).replace('  ', '\t'),
    ],
    ['CRLF', f => checksumText(f.manifest.artifacts).replaceAll('\n', '\r\n')],
    [
      'unexpected blank line',
      f => checksumText(f.manifest.artifacts).replace('\n', '\n\n'),
    ],
    [
      'missing final newline',
      f => checksumText(f.manifest.artifacts).trimEnd(),
    ],
    ['extra final newline', f => `${checksumText(f.manifest.artifacts)}\n`],
  ]
  for (const [name, build] of cases) {
    await t.test(name, t =>
      expectInvalid(
        t,
        f => f.rewriteChecksums(build(f)),
        /SHA256SUMS.*canonical/i
      )
    )
  }

  await t.test('missing checksum file', t =>
    expectInvalid(
      t,
      f => unlinkSync(path.join(f.directory, 'SHA256SUMS')),
      /SHA256SUMS.*regular file/i
    )
  )
  await t.test('checksum path is a directory', t =>
    expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, 'SHA256SUMS'))
        mkdirSync(path.join(f.directory, 'SHA256SUMS'))
      },
      /SHA256SUMS.*regular file/i
    )
  )
  await t.test('checksum path is a symlink', async t => {
    const external = path.join(tmpdir(), `figmavars-checksums-${process.pid}`)
    writeFileSync(external, '')
    t.after(() => rmSync(external, { force: true }))
    await expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, 'SHA256SUMS'))
        createSymlinkOrSkip(t, external, path.join(f.directory, 'SHA256SUMS'))
      },
      /SHA256SUMS.*regular file/i
    )
  })
})

test('rejects every unexpected directory entry', async t => {
  await t.test('extra regular file', t =>
    expectInvalid(
      t,
      f => writeFileSync(path.join(f.directory, 'notes.txt'), 'unexpected'),
      /unexpected artifact directory entry.*notes\.txt/i
    )
  )
  await t.test('extra subdirectory', t =>
    expectInvalid(
      t,
      f => mkdirSync(path.join(f.directory, 'nested')),
      /unexpected artifact directory entry.*nested/i
    )
  )
  await t.test('extra symlink', t =>
    expectInvalid(
      t,
      f =>
        createSymlinkOrSkip(
          t,
          EXPECTED_FILES[0],
          path.join(f.directory, 'latest.tgz')
        ),
      /unexpected artifact directory entry.*latest\.tgz/i
    )
  )
})

test('verification is independent of the process working directory', t => {
  const fixture = makeFixture(t)
  const cwd = mkdtempSync(path.join(tmpdir(), 'figmavars-cwd-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const program = [
    `import { verifyReleaseArtifacts } from ${JSON.stringify(pathToFileURL(SCRIPT_PATH).href)}`,
    `const result = verifyReleaseArtifacts({ artifactDirectory: ${JSON.stringify(fixture.directory)} })`,
    `if (result.version !== ${JSON.stringify(VERSION)}) process.exit(2)`,
  ].join('\n')
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', program],
    {
      cwd,
      encoding: 'utf8',
    }
  )
  assert.equal(
    result.status,
    0,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  )
})

test('CLI rejects missing, unknown, and extra commands without writing artifacts', async t => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'figmavars-cli-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))

  for (const args of [[], ['unknown'], ['verify', 'extra']]) {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
      cwd,
      encoding: 'utf8',
    })
    assert.notEqual(
      result.status,
      0,
      `unexpected success for ${args.join(' ')}`
    )
    assert.match(result.stderr, /Usage:.*(pack|verify|check)/)
    assert.equal(result.stdout, '')
    assert.equal(
      result.error,
      undefined,
      `spawn failed for ${args.join(' ')}: ${result.error?.message}`
    )
  }
})

test('required path validation rejects a symlinked top-level packages parent', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'figmavars-path-root-'))
  const external = mkdtempSync(path.join(tmpdir(), 'figmavars-path-external-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  mkdirSync(path.join(external, 'core'))
  if (!createSymlinkOrSkip(t, external, path.join(root, 'packages'), 'dir')) {
    return
  }

  const { assertRealPathComponents } = await releaseArtifactsModule()
  assert.throws(
    () => assertRealPathComponents(root, 'packages/core'),
    /packages.*symlink/i
  )
})

test('rejects a non-regular checksum file even if readable', async t => {
  await expectInvalid(
    t,
    f => {
      const checksumPath = path.join(f.directory, 'SHA256SUMS')
      chmodSync(checksumPath, 0o644)
      renameSync(checksumPath, `${checksumPath}.real`)
      createSymlinkOrSkip(t, `${checksumPath}.real`, checksumPath)
    },
    /SHA256SUMS.*regular file/i
  )
})
