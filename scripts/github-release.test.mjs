import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createOrResumeGithubRelease } from './github-release.mjs'
import { PUBLIC_RELEASE_PACKAGES } from './release-config.mjs'

const VERSION = '5.0.0'
const TAG = `v${VERSION}`
const SHA = '0123456789abcdef0123456789abcdef01234567'
const NOTES = '# FigmaVars 5.0.0\n\nRelease notes.\n'
const REPOSITORY_PATH = '/repos/marklearst/figmavars'

function fixtureAssets() {
  const directory = mkdtempSync(path.join(tmpdir(), 'figmavars-release-'))
  const artifacts = PUBLIC_RELEASE_PACKAGES.map(config => {
    const stem = config.name.slice('@figmavars/'.length)
    const file = `figmavars-${stem}-${VERSION}.tgz`
    const bytes = Buffer.from(`${config.name}\n`)
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
  return { directory }
}

function localAssets(directory) {
  return [
    ...PUBLIC_RELEASE_PACKAGES.map(config => {
      const stem = config.name.slice('@figmavars/'.length)
      return `figmavars-${stem}-${VERSION}.tgz`
    }),
    'manifest.json',
    'SHA256SUMS',
  ].map((name, index) => {
    const bytes = readFileSync(path.join(directory, name))
    return {
      id: index + 1,
      name,
      state: 'uploaded',
      size: bytes.length,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    }
  })
}

function draftRelease(fixture, overrides = {}) {
  return {
    id: 1,
    tag_name: TAG,
    name: 'Old title',
    body: 'Old notes',
    draft: true,
    immutable: false,
    prerelease: false,
    assets: [],
    upload_url: 'placeholder',
    ...overrides,
  }
}

function publishedRelease(fixture, overrides = {}) {
  return draftRelease(fixture, {
    name: 'FigmaVars v5.0.0',
    body: NOTES,
    draft: false,
    immutable: true,
    target_commitish: 'main',
    assets: localAssets(fixture.directory),
    ...overrides,
  })
}

async function startGithubApi({
  fixture,
  initialReleases = [],
  listLink,
  listPages,
  reportedTargetCommitish,
  tagSha = SHA,
  mutateMetadataResponse,
  mutateDraftSnapshot,
  mutateFinalPublishedResponse,
  mutatePublishResponse,
  mutateUploadResponse,
  redirectUploadTo,
  uploadUrl,
}) {
  const requests = []
  let releases = structuredClone(initialReleases)
  const applyReportedTargetCommitish = release => {
    if (reportedTargetCommitish !== undefined) {
      release.target_commitish = reportedTargetCommitish
    }
    return release
  }
  releases.forEach(applyReportedTargetCommitish)
  let nextReleaseId =
    Math.max(0, ...releases.map(release => release.id ?? 0)) + 1
  let nextAssetId = 100
  let draftSnapshots = 0
  let tagReads = 0
  let metadataPatches = 0
  let publishPatches = 0

  const releaseUploadUrl = releaseId =>
    typeof uploadUrl === 'function'
      ? uploadUrl({ baseUrl: server.baseUrl, releaseId })
      : (uploadUrl ??
        `${server.baseUrl}${REPOSITORY_PATH}/releases/${releaseId}/assets{?name,label}`)
  const normalizeUploadUrls = () => {
    for (const release of releases) {
      release.upload_url = releaseUploadUrl(release.id)
    }
  }
  const findRelease = id => releases.find(release => release.id === id)
  const mutationCount = () =>
    requests.filter(request =>
      ['POST', 'PATCH', 'DELETE'].includes(request.method)
    ).length

  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    const url = new URL(request.url, 'http://localhost')
    requests.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      headers: request.headers,
      body,
    })
    assert.equal(request.headers['x-github-api-version'], '2022-11-28')

    const json = (status, value, headers = {}) => {
      response.writeHead(status, {
        'content-type': 'application/json',
        ...headers,
      })
      response.end(JSON.stringify(value))
    }

    if (
      request.method === 'GET' &&
      url.pathname === `${REPOSITORY_PATH}/git/ref/tags/${TAG}`
    ) {
      tagReads += 1
      const resolvedTagSha =
        typeof tagSha === 'function' ? tagSha(tagReads) : tagSha
      return json(200, { object: { type: 'commit', sha: resolvedTagSha } })
    }
    if (
      request.method === 'GET' &&
      url.pathname === `${REPOSITORY_PATH}/releases/tags/${TAG}`
    ) {
      const published = releases.find(
        release => release.tag_name === TAG && release.draft === false
      )
      if (published === undefined) return json(404, { message: 'Not Found' })
      const finalValue =
        publishPatches > 0 && mutateFinalPublishedResponse !== undefined
          ? mutateFinalPublishedResponse(structuredClone(published))
          : published
      return json(200, finalValue)
    }
    if (
      request.method === 'GET' &&
      url.pathname === `${REPOSITORY_PATH}/releases`
    ) {
      const page = Number(url.searchParams.get('page') ?? '1')
      const pages = listPages ?? [releases]
      const value = structuredClone(pages[page - 1] ?? []).map(entry => {
        const live = findRelease(entry.id)
        return live === undefined ? entry : structuredClone(live)
      })
      const exactIndex = value.findIndex(release => release.tag_name === TAG)
      if (exactIndex !== -1) {
        draftSnapshots += 1
        const exact = value[exactIndex]
        const mutated =
          mutateDraftSnapshot === undefined
            ? exact
            : mutateDraftSnapshot({
                read: draftSnapshots,
                release: structuredClone(exact),
              })
        applyReportedTargetCommitish(mutated)
        value[exactIndex] = mutated
        releases = releases.map(entry =>
          entry.id === mutated.id ? structuredClone(mutated) : entry
        )
      }
      const headers = {}
      if (page < pages.length) {
        headers.link =
          typeof listLink === 'function'
            ? listLink({ baseUrl: server.baseUrl, page })
            : `<${server.baseUrl}${REPOSITORY_PATH}/releases?per_page=100&page=${
                page + 1
              }>; rel="next"`
      }
      return json(200, value, headers)
    }
    const releaseIdMatch = new RegExp(
      `^${REPOSITORY_PATH}/releases/(\\d+)$`
    ).exec(url.pathname)
    if (request.method === 'GET' && releaseIdMatch !== null) {
      const release = findRelease(Number(releaseIdMatch[1]))
      if (release === undefined) return json(404, { message: 'Not Found' })
      return json(200, release)
    }
    if (
      request.method === 'POST' &&
      url.pathname === `${REPOSITORY_PATH}/releases`
    ) {
      const input = JSON.parse(body)
      const release = {
        id: nextReleaseId++,
        tag_name: input.tag_name,
        name: input.name,
        body: input.body,
        draft: true,
        prerelease: false,
        assets: [],
        upload_url: releaseUploadUrl(nextReleaseId - 1),
      }
      applyReportedTargetCommitish(release)
      releases.push(release)
      return json(201, release)
    }
    if (request.method === 'PATCH' && releaseIdMatch !== null) {
      const id = Number(releaseIdMatch[1])
      const release = findRelease(id)
      if (release === undefined) return json(404, { message: 'Not Found' })
      const input = JSON.parse(body)
      if (input.draft === false) {
        publishPatches += 1
      } else {
        metadataPatches += 1
      }
      Object.assign(release, input)
      if (input.draft === false) release.immutable = true
      if (input.draft !== false && mutateMetadataResponse !== undefined) {
        Object.assign(release, mutateMetadataResponse(structuredClone(release)))
      }
      applyReportedTargetCommitish(release)
      const value =
        input.draft === false && mutatePublishResponse !== undefined
          ? mutatePublishResponse(structuredClone(release))
          : release
      applyReportedTargetCommitish(value)
      return json(200, value)
    }
    const assetDeleteMatch = new RegExp(
      `^${REPOSITORY_PATH}/releases/assets/(\\d+)$`
    ).exec(url.pathname)
    if (request.method === 'DELETE' && assetDeleteMatch !== null) {
      const id = Number(assetDeleteMatch[1])
      for (const release of releases) {
        release.assets = release.assets.filter(asset => asset.id !== id)
      }
      response.writeHead(204)
      return response.end()
    }
    const uploadMatch = new RegExp(
      `^${REPOSITORY_PATH}/releases/(\\d+)/assets$`
    ).exec(url.pathname)
    if (request.method === 'POST' && uploadMatch !== null) {
      if (redirectUploadTo !== undefined) {
        response.writeHead(302, { location: redirectUploadTo })
        return response.end()
      }
      const release = findRelease(Number(uploadMatch[1]))
      if (release === undefined) return json(404, { message: 'Not Found' })
      const name = url.searchParams.get('name')
      const asset = {
        id: nextAssetId++,
        name,
        state: 'uploaded',
        size: body.length,
        digest: `sha256:${createHash('sha256').update(body).digest('hex')}`,
      }
      release.assets.push(asset)
      return json(
        201,
        mutateUploadResponse === undefined
          ? asset
          : mutateUploadResponse(structuredClone(asset))
      )
    }
    return json(500, {
      message: `unexpected ${request.method} ${url.pathname}`,
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  server.baseUrl = `http://127.0.0.1:${address.port}`
  normalizeUploadUrls()
  return {
    requests,
    get releases() {
      return releases
    },
    get metadataPatches() {
      return metadataPatches
    },
    get publishPatches() {
      return publishPatches
    },
    get tagReads() {
      return tagReads
    },
    mutationCount,
    baseUrl: server.baseUrl,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

function releaseInput(fixture, api) {
  return {
    apiBaseUrl: api.baseUrl,
    artifactDirectory: fixture.directory,
    githubRepository: 'marklearst/figmavars',
    githubSha: SHA,
    notes: NOTES,
    tag: TAG,
    title: 'FigmaVars v5.0.0',
    token: 'local-test-token',
  }
}

async function withGithubApi(options, run) {
  const fixture = fixtureAssets()
  const resolvedOptions =
    typeof options === 'function' ? options(fixture) : options
  const api = await startGithubApi({ fixture, ...resolvedOptions })
  try {
    return await run({ api, fixture })
  } finally {
    await api.close()
    rmSync(fixture.directory, { recursive: true, force: true })
  }
}

function assertMutationsAreBracketedByReleaseReads(requests) {
  const supportedRead = request =>
    request?.method === 'GET' &&
    (request?.path === `${REPOSITORY_PATH}/releases` ||
      new RegExp(`^${REPOSITORY_PATH}/releases/\\d+$`).test(request?.path))
  const createDraft = request =>
    request?.method === 'POST' &&
    request?.path === `${REPOSITORY_PATH}/releases`
  const releaseMutation = request =>
    createDraft(request) ||
    request.method === 'PATCH' ||
    request.method === 'DELETE' ||
    (request.method === 'POST' &&
      new RegExp(`^${REPOSITORY_PATH}/releases/\\d+/assets$`).test(
        request.path
      ))
  const sequence = requests.filter(
    request => supportedRead(request) || releaseMutation(request)
  )

  for (const [index, request] of sequence.entries()) {
    if (!releaseMutation(request)) continue
    if (!createDraft(request)) {
      assert.ok(
        supportedRead(sequence[index - 1]),
        `${request.method} ${request.path} must have an immediate pre-mutation release read`
      )
    }
    assert.ok(
      supportedRead(sequence[index + 1]),
      `${request.method} ${request.path} must have an immediate post-mutation release read`
    )
  }
}

test('creates and publishes a first release after list confirms no draft', async () => {
  await withGithubApi({}, async ({ api, fixture }) => {
    const redirectModes = []
    const result = await createOrResumeGithubRelease({
      ...releaseInput(fixture, api),
      fetchImpl: (url, options) => {
        redirectModes.push(options.redirect)
        return fetch(url, options)
      },
    })
    assert.equal(result.status, 'published')
    assert.equal(api.releases.length, 1)
    assert.equal(api.releases[0].draft, false)
    assert.equal(api.releases[0].immutable, true)
    assert.deepEqual(
      api.releases[0].assets.map(asset => asset.name).sort(),
      localAssets(fixture.directory)
        .map(asset => asset.name)
        .sort()
    )
    assert.ok(
      api.requests.some(
        request =>
          request.method === 'GET' &&
          request.path === `${REPOSITORY_PATH}/releases` &&
          request.search === '?per_page=100&page=1'
      )
    )
    assert.equal(api.publishPatches, 1)
    assertMutationsAreBracketedByReleaseReads(api.requests)
    assert.ok(
      api.requests.every(request => request.headers['if-match'] === undefined),
      'release mutations must not send unsupported If-Match headers'
    )
    assert.ok(redirectModes.every(mode => mode === 'error'))
    assert.equal(api.tagReads, 3)
  })
})

test('resumes a partial draft when the API reports the existing tag target as main', async () => {
  await withGithubApi(
    fixture => ({
      initialReleases: [
        draftRelease(fixture, {
          target_commitish: 'main',
          assets: localAssets(fixture.directory)
            .slice(0, 2)
            .map((asset, index) => ({ ...asset, id: 41 + index })),
        }),
      ],
      reportedTargetCommitish: 'main',
    }),
    async ({ api, fixture }) => {
      await createOrResumeGithubRelease(releaseInput(fixture, api))
      assert.equal(
        api.requests.filter(request => request.method === 'DELETE').length,
        0
      )
      assert.equal(api.releases[0].draft, false)
      assert.equal(api.releases[0].target_commitish, 'main')
      assert.equal(api.releases[0].assets.length, 7)
      assert.deepEqual(
        api.releases[0].assets.slice(0, 2).map(asset => asset.id),
        [41, 42]
      )
      assert.equal(
        api.requests.filter(
          request =>
            request.method === 'POST' &&
            /\/releases\/\d+\/assets$/.test(request.path)
        ).length,
        5
      )
      const patches = api.requests.filter(request => request.method === 'PATCH')
      assert.equal(patches.length, 2)
      assert.ok(
        patches.every(
          request => JSON.parse(request.body).target_commitish === SHA
        )
      )
      assert.ok(
        patches.every(request => request.headers['if-match'] === undefined)
      )
      assertMutationsAreBracketedByReleaseReads(api.requests)
      assert.equal(api.tagReads, 3)
    }
  )
})

test('fails closed on mismatched or incomplete draft assets without deletion', async t => {
  for (const testCase of [
    {
      name: 'digest mismatch',
      mutate: asset => ({ ...asset, digest: `sha256:${'0'.repeat(64)}` }),
      pattern: /asset mismatch/,
    },
    {
      name: 'starter state',
      mutate: asset => ({ ...asset, state: 'starter' }),
      pattern: /state is not uploaded/,
    },
  ]) {
    await t.test(testCase.name, async () => {
      await withGithubApi(
        fixture => ({
          initialReleases: [
            draftRelease(fixture, {
              assets: [testCase.mutate(localAssets(fixture.directory)[0])],
            }),
          ],
        }),
        async ({ api, fixture }) => {
          await assert.rejects(
            () => createOrResumeGithubRelease(releaseInput(fixture, api)),
            testCase.pattern
          )
          assert.equal(
            api.requests.filter(request => request.method === 'DELETE').length,
            0
          )
          assert.equal(
            api.requests.filter(
              request =>
                request.method === 'POST' &&
                /\/releases\/\d+\/assets$/.test(request.path)
            ).length,
            0
          )
        }
      )
    })
  }
})

test('finds an exact draft on a later authenticated release-list page', async () => {
  const unrelated = {
    id: 7,
    tag_name: 'v4.9.0',
    draft: true,
    assets: [],
  }
  const exact = draftRelease({ directory: '' }, { id: 9 })
  await withGithubApi(
    {
      initialReleases: [exact],
      listPages: [[unrelated], [exact]],
    },
    async ({ api, fixture }) => {
      const result = await createOrResumeGithubRelease(
        releaseInput(fixture, api)
      )
      assert.equal(result.releaseId, 9)
      assert.ok(
        api.requests.some(
          request =>
            request.path === `${REPOSITORY_PATH}/releases` &&
            request.search === '?per_page=100&page=2'
        )
      )
      for (const request of api.requests.filter(
        request => request.path === `${REPOSITORY_PATH}/releases`
      )) {
        assert.equal(request.headers.authorization, 'Bearer local-test-token')
      }
    }
  )
})

test('rejects release-list pagination credentials, hash, and query drift', async t => {
  const pages = [
    [{ id: 7, tag_name: 'v4.9.0', draft: true, assets: [] }],
    [draftRelease({ directory: '' })],
  ]
  const cases = [
    {
      name: 'credentials',
      listLink: ({ baseUrl }) => {
        const url = new URL(baseUrl)
        return `<${url.protocol}//user:secret@${url.host}${REPOSITORY_PATH}/releases?per_page=100&page=2>; rel="next"`
      },
    },
    {
      name: 'hash',
      listLink: ({ baseUrl }) =>
        `<${baseUrl}${REPOSITORY_PATH}/releases?per_page=100&page=2#fragment>; rel="next"`,
    },
    {
      name: 'extra query',
      listLink: ({ baseUrl }) =>
        `<${baseUrl}${REPOSITORY_PATH}/releases?per_page=100&page=2&extra=1>; rel="next"`,
    },
    {
      name: 'backward page',
      listLink: ({ baseUrl }) =>
        `<${baseUrl}${REPOSITORY_PATH}/releases?per_page=100&page=1>; rel="next"`,
    },
  ]

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      await withGithubApi(
        {
          initialReleases: [draftRelease({ directory: '' })],
          listLink: testCase.listLink,
          listPages: pages,
        },
        async ({ api, fixture }) => {
          await assert.rejects(
            () => createOrResumeGithubRelease(releaseInput(fixture, api)),
            /next-page URL left the API boundary/
          )
          assert.equal(api.mutationCount(), 0)
        }
      )
    })
  }
})

test('rejects duplicate exact-tag releases across pages without mutation', async () => {
  const first = draftRelease({ directory: '' }, { id: 1 })
  const second = draftRelease({ directory: '' }, { id: 2 })
  await withGithubApi(
    {
      initialReleases: [first, second],
      listPages: [[first], [second]],
    },
    async ({ api, fixture }) => {
      await assert.rejects(
        () => createOrResumeGithubRelease(releaseInput(fixture, api)),
        /more than one release.*v5\.0\.0/
      )
      assert.equal(api.mutationCount(), 0)
    }
  )
})

test('bounds release-list pagination before creating a draft', async () => {
  const pages = Array.from({ length: 11 }, (_, index) => [
    {
      id: index + 1,
      tag_name: `v4.${index}.0`,
      draft: true,
      assets: [],
    },
  ])
  await withGithubApi({ listPages: pages }, async ({ api, fixture }) => {
    await assert.rejects(
      () => createOrResumeGithubRelease(releaseInput(fixture, api)),
      /release list exceeded 10 pages/
    )
    assert.equal(api.mutationCount(), 0)
  })
})

test('aborts before upload when metadata mutation reports concurrent publication', async () => {
  await withGithubApi(
    {
      initialReleases: [draftRelease({ directory: '' })],
      mutateMetadataResponse: release => ({ ...release, draft: false }),
    },
    async ({ api, fixture }) => {
      await assert.rejects(
        () => createOrResumeGithubRelease(releaseInput(fixture, api)),
        /stopped being a draft/
      )
      assert.equal(
        api.requests.filter(request => request.method === 'DELETE').length,
        0
      )
      assert.equal(
        api.requests.filter(
          request =>
            request.method === 'POST' &&
            /\/releases\/\d+\/assets$/.test(request.path)
        ).length,
        0
      )
      assert.equal(api.publishPatches, 0)
    }
  )
})

test('aborts before upload when an unexpected asset appears after metadata', async () => {
  await withGithubApi(
    {
      initialReleases: [draftRelease({ directory: '' })],
      mutateDraftSnapshot({ read, release }) {
        if (read === 3) {
          release.assets.push({ id: 999, name: 'unexpected.zip' })
        }
        return release
      },
    },
    async ({ api, fixture }) => {
      await assert.rejects(
        () => createOrResumeGithubRelease(releaseInput(fixture, api)),
        /unexpected asset/
      )
      assert.equal(
        api.requests.filter(request => request.method === 'DELETE').length,
        0
      )
      assert.equal(
        api.requests.filter(
          request =>
            request.method === 'POST' &&
            /\/releases\/\d+\/assets$/.test(request.path)
        ).length,
        0
      )
      assert.equal(api.publishPatches, 0)
    }
  )
})

test('aborts before publish when another actor publishes after uploads', async () => {
  await withGithubApi(
    {
      initialReleases: [draftRelease({ directory: '' })],
      mutateDraftSnapshot({ read, release }) {
        if (read === 10) release.draft = false
        return release
      },
    },
    async ({ api, fixture }) => {
      await assert.rejects(
        () => createOrResumeGithubRelease(releaseInput(fixture, api)),
        /stopped being a draft/
      )
      assert.equal(
        api.requests.filter(
          request =>
            request.method === 'POST' &&
            /\/releases\/\d+\/assets$/.test(request.path)
        ).length,
        7
      )
      assert.equal(api.publishPatches, 0)
    }
  )
})

test('matching published release with a main target is a by-tag no-op', async () => {
  await withGithubApi(
    fixture => ({
      initialReleases: [publishedRelease(fixture)],
    }),
    async ({ api, fixture }) => {
      const result = await createOrResumeGithubRelease(
        releaseInput(fixture, api)
      )
      assert.equal(result.status, 'unchanged')
      assert.equal(api.mutationCount(), 0)
      assert.equal(api.releases[0].target_commitish, 'main')
      assert.equal(api.tagReads, 2)
      assert.equal(
        api.requests.some(
          request => request.path === `${REPOSITORY_PATH}/releases`
        ),
        false
      )
    }
  )
})

test('mismatched published release and moved tags fail without mutation', async t => {
  for (const testCase of [
    {
      name: 'published notes mismatch',
      initialReleases: fixture => [
        publishedRelease(fixture, { body: 'Different notes' }),
      ],
      tagSha: SHA,
      pattern: /published release does not match/,
    },
    {
      name: 'tag mismatch',
      initialReleases: [],
      tagSha: 'f'.repeat(40),
      pattern: /tag.*GITHUB_SHA/,
    },
    {
      name: 'published release is not immutable',
      initialReleases: fixture => [
        publishedRelease(fixture, { immutable: false }),
      ],
      tagSha: SHA,
      pattern: /published release is not immutable/,
    },
  ]) {
    await t.test(testCase.name, async () => {
      await withGithubApi(
        fixture => ({
          ...testCase,
          initialReleases:
            typeof testCase.initialReleases === 'function'
              ? testCase.initialReleases(fixture)
              : testCase.initialReleases,
        }),
        async ({ api, fixture }) => {
          await assert.rejects(
            () => createOrResumeGithubRelease(releaseInput(fixture, api)),
            testCase.pattern
          )
          assert.equal(api.mutationCount(), 0)
        }
      )
    })
  }
})

test('rechecks tag identity immediately before and after publication', async t => {
  for (const testCase of [
    {
      name: 'moves before publish',
      tagSha: read => (read === 1 ? SHA : 'f'.repeat(40)),
      expectedPublishes: 0,
      expectedTagReads: 2,
    },
    {
      name: 'moves after publish',
      tagSha: read => (read < 3 ? SHA : 'f'.repeat(40)),
      expectedPublishes: 1,
      expectedTagReads: 3,
    },
  ]) {
    await t.test(testCase.name, async () => {
      await withGithubApi(
        {
          initialReleases: [draftRelease({ directory: '' })],
          tagSha: testCase.tagSha,
        },
        async ({ api, fixture }) => {
          await assert.rejects(
            () => createOrResumeGithubRelease(releaseInput(fixture, api)),
            /remote release tag does not equal GITHUB_SHA/
          )
          assert.equal(api.publishPatches, testCase.expectedPublishes)
          assert.equal(api.tagReads, testCase.expectedTagReads)
        }
      )
    })
  }
})

test('checks the final published by-tag response after publish', async () => {
  await withGithubApi(
    {
      initialReleases: [draftRelease({ directory: '' })],
      mutateFinalPublishedResponse: release => ({
        ...release,
        body: 'Changed after publish',
      }),
    },
    async ({ api, fixture }) => {
      await assert.rejects(
        () => createOrResumeGithubRelease(releaseInput(fixture, api)),
        /published release does not match/
      )
      assert.equal(api.publishPatches, 1)
    }
  )
})

test('requires final by-tag immutability and the same release ID', async t => {
  for (const testCase of [
    {
      name: 'immutability',
      mutate: release => ({ ...release, immutable: false }),
      pattern: /published release is not immutable/,
    },
    {
      name: 'release ID',
      mutate: release => ({ ...release, id: release.id + 1 }),
      pattern: /release ID changed during final lookup/,
    },
  ]) {
    await t.test(testCase.name, async () => {
      await withGithubApi(
        {
          initialReleases: [draftRelease({ directory: '' })],
          mutateFinalPublishedResponse: testCase.mutate,
        },
        async ({ api, fixture }) => {
          await assert.rejects(
            () => createOrResumeGithubRelease(releaseInput(fixture, api)),
            testCase.pattern
          )
          assert.equal(api.publishPatches, 1)
        }
      )
    })
  }
})

test('rejects duplicate asset IDs in the publish mutation response', async () => {
  await withGithubApi(
    {
      initialReleases: [draftRelease({ directory: '' })],
      mutatePublishResponse: release => ({
        ...release,
        assets: release.assets.map(asset => ({
          ...asset,
          id: release.assets[0].id,
        })),
      }),
    },
    async ({ api, fixture }) => {
      await assert.rejects(
        () => createOrResumeGithubRelease(releaseInput(fixture, api)),
        /duplicate asset IDs/
      )
      assert.equal(api.publishPatches, 1)
      assert.equal(
        api.requests.filter(
          request =>
            request.method === 'GET' &&
            request.path === `${REPOSITORY_PATH}/releases/tags/${TAG}`
        ).length,
        1,
        'must stop before the final published lookup'
      )
    }
  )
})

test('requires the publish response to confirm release immutability', async () => {
  await withGithubApi(
    {
      initialReleases: [draftRelease({ directory: '' })],
      mutatePublishResponse: release => ({ ...release, immutable: false }),
    },
    async ({ api, fixture }) => {
      await assert.rejects(
        () => createOrResumeGithubRelease(releaseInput(fixture, api)),
        /published release is not immutable/
      )
      assert.equal(api.publishPatches, 1)
      assert.equal(
        api.requests.filter(
          request =>
            request.method === 'GET' &&
            new RegExp(`^${REPOSITORY_PATH}/releases/\\d+$`).test(request.path)
        ).length,
        0,
        'must stop before post-publish reads'
      )
    }
  )
})

test('requires each upload response to report uploaded state', async () => {
  await withGithubApi(
    {
      initialReleases: [draftRelease({ directory: '' })],
      mutateUploadResponse: asset => ({ ...asset, state: 'starter' }),
    },
    async ({ api, fixture }) => {
      await assert.rejects(
        () => createOrResumeGithubRelease(releaseInput(fixture, api)),
        /GitHub upload response mismatch/
      )
      assert.equal(
        api.requests.filter(
          request =>
            request.method === 'GET' &&
            request.path === `${REPOSITORY_PATH}/releases`
        ).length,
        3,
        'must stop before accepting a post-upload snapshot'
      )
      assert.equal(api.publishPatches, 0)
    }
  )
})

test('rejects a hostile upload template before sending the GitHub token', async () => {
  const fixture = fixtureAssets()
  let hostileRequests = 0
  let receivedAuthorization
  const hostileServer = createServer((request, response) => {
    hostileRequests += 1
    receivedAuthorization = request.headers.authorization
    response.writeHead(201, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ id: 1 }))
  })
  await new Promise(resolve => hostileServer.listen(0, '127.0.0.1', resolve))
  const hostileAddress = hostileServer.address()
  const hostileBase = `http://127.0.0.1:${hostileAddress.port}`
  const api = await startGithubApi({
    fixture,
    initialReleases: [draftRelease(fixture)],
    uploadUrl: `${hostileBase}${REPOSITORY_PATH}/releases/1/assets{?name,label}`,
  })
  try {
    await assert.rejects(
      () => createOrResumeGithubRelease(releaseInput(fixture, api)),
      /upload URL left the allowed GitHub boundary/
    )
    assert.equal(hostileRequests, 0)
    assert.equal(receivedAuthorization, undefined)
  } finally {
    await api.close()
    await new Promise(resolve => hostileServer.close(resolve))
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('rejects upload redirects before contacting the redirect target', async () => {
  const fixture = fixtureAssets()
  let hostileRequests = 0
  const hostileServer = createServer((request, response) => {
    hostileRequests += 1
    response.writeHead(201, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ id: 1 }))
  })
  await new Promise(resolve => hostileServer.listen(0, '127.0.0.1', resolve))
  const hostileAddress = hostileServer.address()
  const hostileUrl = `http://127.0.0.1:${hostileAddress.port}/asset`
  const api = await startGithubApi({
    fixture,
    initialReleases: [draftRelease(fixture)],
    redirectUploadTo: hostileUrl,
  })
  try {
    await assert.rejects(
      () => createOrResumeGithubRelease(releaseInput(fixture, api)),
      /GitHub request failed/
    )
    assert.equal(hostileRequests, 0)
  } finally {
    await api.close()
    await new Promise(resolve => hostileServer.close(resolve))
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('rejects credentials, search, hash, and template drift in upload URLs', async t => {
  const cases = [
    {
      name: 'credentials',
      uploadUrl: ({ baseUrl, releaseId }) => {
        const apiUrl = new URL(baseUrl)
        return `${apiUrl.protocol}//user:secret@${apiUrl.host}${REPOSITORY_PATH}/releases/${releaseId}/assets{?name,label}`
      },
    },
    {
      name: 'search',
      uploadUrl: ({ baseUrl, releaseId }) =>
        `${baseUrl}${REPOSITORY_PATH}/releases/${releaseId}/assets?unexpected=1{?name,label}`,
    },
    {
      name: 'hash',
      uploadUrl: ({ baseUrl, releaseId }) =>
        `${baseUrl}${REPOSITORY_PATH}/releases/${releaseId}/assets#unexpected{?name,label}`,
    },
    {
      name: 'template',
      uploadUrl: ({ baseUrl, releaseId }) =>
        `${baseUrl}${REPOSITORY_PATH}/releases/${releaseId}/assets{?label,name}`,
    },
  ]

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      await withGithubApi(
        {
          initialReleases: [draftRelease({ directory: '' })],
          uploadUrl: testCase.uploadUrl,
        },
        async ({ api, fixture }) => {
          await assert.rejects(
            () => createOrResumeGithubRelease(releaseInput(fixture, api)),
            /upload URL (?:is invalid|left the allowed GitHub boundary)/
          )
          assert.equal(
            api.requests.filter(
              request =>
                request.method === 'POST' &&
                /\/releases\/\d+\/assets$/.test(request.path)
            ).length,
            0
          )
        }
      )
    })
  }
})

test('reports a timed-out GitHub request without retrying forever', async () => {
  const fixture = fixtureAssets()
  let requests = 0
  try {
    await assert.rejects(
      () =>
        createOrResumeGithubRelease({
          apiBaseUrl: 'https://api.github.test',
          artifactDirectory: fixture.directory,
          fetchImpl: async () => {
            requests += 1
            throw new DOMException('request timed out', 'TimeoutError')
          },
          githubRepository: 'marklearst/figmavars',
          githubSha: SHA,
          notes: NOTES,
          tag: TAG,
          title: 'FigmaVars v5.0.0',
          token: 'local-test-token',
        }),
      /GitHub request timed out/
    )
    assert.equal(requests, 1)
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})
