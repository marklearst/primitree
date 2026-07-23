import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createOrResumeGithubRelease } from './github-release.mjs'
import { PUBLIC_RELEASE_PACKAGES } from './release-config.mjs'

const VERSION = '5.0.0'
const TAG = `v${VERSION}`
const SHA = '0123456789abcdef0123456789abcdef01234567'
const NOTES = '# FigmaVars 5.0.0\n\nRelease notes.\n'

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
      size: bytes.length,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    }
  })
}

async function startGithubApi({ fixture, initialRelease, tagSha = SHA }) {
  const requests = []
  let release = initialRelease
  let nextAssetId = 100

  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    const url = new URL(request.url, 'http://localhost')
    requests.push({
      method: request.method,
      path: url.pathname,
      headers: request.headers,
      body,
    })
    assert.equal(request.headers['x-github-api-version'], '2022-11-28')

    const json = (status, value) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(value))
    }

    if (
      request.method === 'GET' &&
      url.pathname === `/repos/marklearst/figmavars/git/ref/tags/${TAG}`
    ) {
      return json(200, { object: { type: 'commit', sha: tagSha } })
    }
    if (
      request.method === 'GET' &&
      url.pathname === `/repos/marklearst/figmavars/releases/tags/${TAG}`
    ) {
      return release === undefined
        ? json(404, { message: 'Not Found' })
        : json(200, release)
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/repos/marklearst/figmavars/releases'
    ) {
      const input = JSON.parse(body)
      release = {
        id: 1,
        tag_name: input.tag_name,
        name: input.name,
        body: input.body,
        draft: true,
        prerelease: false,
        assets: [],
        upload_url: `${server.baseUrl}/uploads/releases/1/assets{?name,label}`,
      }
      return json(201, release)
    }
    if (
      request.method === 'PATCH' &&
      url.pathname === '/repos/marklearst/figmavars/releases/1'
    ) {
      release = { ...release, ...JSON.parse(body) }
      return json(200, release)
    }
    if (
      request.method === 'DELETE' &&
      url.pathname.startsWith('/repos/marklearst/figmavars/releases/assets/')
    ) {
      const id = Number(url.pathname.split('/').at(-1))
      release.assets = release.assets.filter(asset => asset.id !== id)
      response.writeHead(204)
      return response.end()
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/uploads/releases/1/assets'
    ) {
      const name = url.searchParams.get('name')
      const asset = {
        id: nextAssetId++,
        name,
        size: body.length,
        digest: `sha256:${createHash('sha256').update(body).digest('hex')}`,
      }
      release.assets.push(asset)
      return json(201, asset)
    }
    return json(500, {
      message: `unexpected ${request.method} ${url.pathname}`,
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  server.baseUrl = `http://127.0.0.1:${address.port}`
  if (release?.upload_url) {
    release.upload_url = `${server.baseUrl}/uploads/releases/1/assets{?name,label}`
  }
  return {
    requests,
    get release() {
      return release
    },
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

test('creates a draft for the existing tag, verifies seven assets, then publishes', async () => {
  const fixture = fixtureAssets()
  const api = await startGithubApi({ fixture })
  try {
    const result = await createOrResumeGithubRelease(releaseInput(fixture, api))
    assert.equal(result.status, 'published')
    assert.equal(api.release.draft, false)
    assert.deepEqual(
      api.release.assets.map(asset => asset.name).sort(),
      localAssets(fixture.directory)
        .map(asset => asset.name)
        .sort()
    )
    assert.equal(
      api.requests.filter(request => request.method === 'POST').length,
      8
    )
  } finally {
    await api.close()
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('resumes a draft by replacing only the seven expected assets', async () => {
  const fixture = fixtureAssets()
  const initialRelease = {
    id: 1,
    tag_name: TAG,
    name: 'Old title',
    body: 'Old notes',
    draft: true,
    prerelease: false,
    assets: localAssets(fixture.directory).map(asset => ({
      ...asset,
      size: 1,
      digest: `sha256:${'0'.repeat(64)}`,
    })),
    upload_url: 'placeholder',
  }
  const api = await startGithubApi({ fixture, initialRelease })
  try {
    await createOrResumeGithubRelease(releaseInput(fixture, api))
    assert.equal(
      api.requests.filter(request => request.method === 'DELETE').length,
      7
    )
    assert.equal(
      api.requests.filter(
        request =>
          request.method === 'POST' &&
          request.path === '/uploads/releases/1/assets'
      ).length,
      7
    )
    assert.equal(api.release.name, 'FigmaVars v5.0.0')
    assert.equal(api.release.body, NOTES)
    assert.equal(api.release.draft, false)
  } finally {
    await api.close()
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('matching published release is a no-op', async () => {
  const fixture = fixtureAssets()
  const initialRelease = {
    id: 1,
    tag_name: TAG,
    name: 'FigmaVars v5.0.0',
    body: NOTES,
    draft: false,
    prerelease: false,
    assets: localAssets(fixture.directory),
    upload_url: 'placeholder',
  }
  const api = await startGithubApi({ fixture, initialRelease })
  try {
    const result = await createOrResumeGithubRelease(releaseInput(fixture, api))
    assert.equal(result.status, 'unchanged')
    assert.equal(
      api.requests.filter(request =>
        ['POST', 'PATCH', 'DELETE'].includes(request.method)
      ).length,
      0
    )
  } finally {
    await api.close()
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('mismatched published release and moved tags fail without mutation', async t => {
  for (const testCase of [
    {
      name: 'published notes mismatch',
      tagSha: SHA,
      release: {
        id: 1,
        tag_name: TAG,
        name: 'FigmaVars v5.0.0',
        body: 'Different notes',
        draft: false,
        prerelease: false,
        assets: [],
        upload_url: 'placeholder',
      },
    },
    {
      name: 'tag mismatch',
      tagSha: 'f'.repeat(40),
      release: undefined,
    },
  ]) {
    await t.test(testCase.name, async () => {
      const fixture = fixtureAssets()
      const api = await startGithubApi({
        fixture,
        initialRelease: testCase.release,
        tagSha: testCase.tagSha,
      })
      try {
        await assert.rejects(
          () => createOrResumeGithubRelease(releaseInput(fixture, api)),
          /published release does not match|tag.*GITHUB_SHA/
        )
        assert.equal(
          api.requests.filter(request =>
            ['POST', 'PATCH', 'DELETE'].includes(request.method)
          ).length,
          0
        )
      } finally {
        await api.close()
        rmSync(fixture.directory, { recursive: true, force: true })
      }
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
