#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyReleaseArtifacts } from './release-artifacts.mjs'

const API_VERSION = '2022-11-28'
const REQUEST_TIMEOUT_MS = 10_000
const MAX_TAG_DEREFERENCES = 5

function joinApiPath(baseUrl, pathname) {
  return new URL(pathname.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`)
    .href
}

function encodePathSegment(value) {
  return encodeURIComponent(value)
}

async function apiRequest(
  url,
  {
    body,
    expectedStatuses,
    fetchImpl,
    method = 'GET',
    token,
    contentType = 'application/json',
  }
) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': API_VERSION,
  }
  let requestBody
  if (body !== undefined) {
    headers['content-type'] = contentType
    requestBody =
      contentType === 'application/json' ? JSON.stringify(body) : body
  }
  let response
  try {
    response = await fetchImpl(url, {
      body: requestBody,
      headers,
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error(`GitHub request timed out: ${method} ${url}`)
    }
    throw new Error(
      `GitHub request failed: ${method} ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  let value
  if (response.status !== 204) {
    try {
      value = await response.json()
    } catch {
      throw new Error(`${method} ${url}: GitHub returned invalid JSON`)
    }
  }
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${method} ${url}: GitHub returned ${response.status}${
        value?.message ? `: ${value.message}` : ''
      }`
    )
  }
  return { status: response.status, value }
}

async function resolveRemoteTagCommit({
  apiBaseUrl,
  fetchImpl,
  repository,
  tag,
  token,
}) {
  const tagRefUrl = joinApiPath(
    apiBaseUrl,
    `/repos/${repository}/git/ref/tags/${encodePathSegment(tag)}`
  )
  let object = (
    await apiRequest(tagRefUrl, {
      expectedStatuses: [200],
      fetchImpl,
      token,
    })
  ).value?.object
  const visited = new Set()
  for (let depth = 0; depth < MAX_TAG_DEREFERENCES; depth += 1) {
    if (object?.type === 'commit' && /^[a-f0-9]{40}$/.test(object.sha ?? '')) {
      return object.sha
    }
    if (
      object?.type !== 'tag' ||
      !/^[a-f0-9]{40}$/.test(object.sha ?? '') ||
      visited.has(object.sha)
    ) {
      throw new Error('remote release tag did not resolve to a commit')
    }
    visited.add(object.sha)
    object = (
      await apiRequest(
        joinApiPath(apiBaseUrl, `/repos/${repository}/git/tags/${object.sha}`),
        {
          expectedStatuses: [200],
          fetchImpl,
          token,
        }
      )
    ).value?.object
  }
  throw new Error('remote release tag exceeded the dereference limit')
}

function localReleaseAssets(artifactDirectory, verified) {
  const filenames = [
    ...verified.artifacts.map(artifact => artifact.file),
    'manifest.json',
    'SHA256SUMS',
  ]
  return filenames.map(name => {
    const filePath = path.join(artifactDirectory, name)
    const bytes = readFileSync(filePath)
    return {
      bytes,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      name,
      path: filePath,
      size: bytes.length,
    }
  })
}

function assertExactAssetSet(release, expectedAssets) {
  if (!Array.isArray(release.assets)) {
    throw new Error('GitHub Release assets must be an array')
  }
  const expectedByName = new Map(
    expectedAssets.map(asset => [asset.name, asset])
  )
  if (
    release.assets.length !== expectedAssets.length ||
    new Set(release.assets.map(asset => asset?.name)).size !==
      release.assets.length
  ) {
    throw new Error('GitHub Release must contain exactly seven unique assets')
  }
  for (const asset of release.assets) {
    const expected = expectedByName.get(asset?.name)
    if (
      expected === undefined ||
      asset.size !== expected.size ||
      asset.digest !== expected.digest
    ) {
      throw new Error(
        `GitHub Release asset mismatch: ${asset?.name ?? 'unknown'}`
      )
    }
  }
}

function assertExactRelease(release, expected, expectedAssets, draft) {
  if (
    release?.tag_name !== expected.tag ||
    release?.name !== expected.title ||
    release?.body !== expected.notes ||
    release?.draft !== draft ||
    release?.prerelease !== false
  ) {
    throw new Error(
      draft
        ? 'draft release does not match reviewed metadata'
        : 'published release does not match reviewed metadata'
    )
  }
  try {
    assertExactAssetSet(release, expectedAssets)
  } catch (error) {
    if (!draft) {
      throw new Error(
        `published release does not match reviewed assets: ${error.message}`
      )
    }
    throw error
  }
}

function assertDraftAssetsReplaceable(release, expectedAssets) {
  if (!Array.isArray(release.assets)) {
    throw new Error('draft release assets must be an array')
  }
  const expectedNames = new Set(expectedAssets.map(asset => asset.name))
  if (
    release.assets.some(
      asset =>
        typeof asset?.id !== 'number' ||
        typeof asset?.name !== 'string' ||
        !expectedNames.has(asset.name)
    )
  ) {
    throw new Error('draft release contains an unexpected asset')
  }
  if (
    new Set(release.assets.map(asset => asset.name)).size !==
    release.assets.length
  ) {
    throw new Error('draft release contains duplicate assets')
  }
}

export async function createOrResumeGithubRelease({
  apiBaseUrl = 'https://api.github.com',
  artifactDirectory,
  fetchImpl = fetch,
  githubRepository,
  githubSha,
  notes,
  tag,
  title,
  token,
}) {
  if (!/^[^/]+\/[^/]+$/.test(githubRepository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must contain owner/repository')
  }
  if (!/^[a-f0-9]{40}$/.test(githubSha ?? '')) {
    throw new Error('GITHUB_SHA must be a full lowercase commit SHA')
  }
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) {
    throw new Error('GitHub Release tag must be stable vMAJOR.MINOR.PATCH')
  }
  if (typeof token !== 'string' || token === '') {
    throw new Error('GITHUB_TOKEN is required')
  }
  if (typeof notes !== 'string' || notes === '') {
    throw new Error('GitHub Release notes are required')
  }
  if (typeof title !== 'string' || title === '') {
    throw new Error('GitHub Release title is required')
  }

  const verified = verifyReleaseArtifacts({ artifactDirectory })
  if (tag !== `v${verified.version}`) {
    throw new Error('GitHub Release tag does not match artifact version')
  }
  const expectedAssets = localReleaseAssets(artifactDirectory, verified)
  if (expectedAssets.length !== 7) {
    throw new Error('GitHub Release requires exactly seven local assets')
  }
  const remoteTagCommit = await resolveRemoteTagCommit({
    apiBaseUrl,
    fetchImpl,
    repository: githubRepository,
    tag,
    token,
  })
  if (remoteTagCommit !== githubSha) {
    throw new Error('remote release tag does not equal GITHUB_SHA')
  }

  const releaseByTagUrl = joinApiPath(
    apiBaseUrl,
    `/repos/${githubRepository}/releases/tags/${encodePathSegment(tag)}`
  )
  let releaseResponse = await apiRequest(releaseByTagUrl, {
    expectedStatuses: [200, 404],
    fetchImpl,
    token,
  })
  if (
    releaseResponse.status === 200 &&
    releaseResponse.value?.draft === false
  ) {
    assertExactRelease(
      releaseResponse.value,
      { notes, tag, title },
      expectedAssets,
      false
    )
    return { releaseId: releaseResponse.value.id, status: 'unchanged' }
  }

  let release = releaseResponse.value
  if (releaseResponse.status === 404) {
    release = (
      await apiRequest(
        joinApiPath(apiBaseUrl, `/repos/${githubRepository}/releases`),
        {
          body: {
            body: notes,
            draft: true,
            name: title,
            prerelease: false,
            tag_name: tag,
            target_commitish: githubSha,
          },
          expectedStatuses: [201],
          fetchImpl,
          method: 'POST',
          token,
        }
      )
    ).value
  } else if (release?.draft !== true) {
    throw new Error('GitHub Release state is neither draft nor published')
  }

  if (!Number.isInteger(release?.id)) {
    throw new Error('draft release id is invalid')
  }
  assertDraftAssetsReplaceable(release, expectedAssets)
  const releaseUrl = joinApiPath(
    apiBaseUrl,
    `/repos/${githubRepository}/releases/${release.id}`
  )
  release = (
    await apiRequest(releaseUrl, {
      body: {
        body: notes,
        draft: true,
        name: title,
        prerelease: false,
        tag_name: tag,
        target_commitish: githubSha,
      },
      expectedStatuses: [200],
      fetchImpl,
      method: 'PATCH',
      token,
    })
  ).value
  if (release?.draft !== true) {
    throw new Error('GitHub Release stopped being a draft before asset upload')
  }

  for (const asset of release.assets ?? []) {
    await apiRequest(
      joinApiPath(
        apiBaseUrl,
        `/repos/${githubRepository}/releases/assets/${asset.id}`
      ),
      {
        expectedStatuses: [204],
        fetchImpl,
        method: 'DELETE',
        token,
      }
    )
  }

  const uploadTemplate = release.upload_url
  if (typeof uploadTemplate !== 'string' || !uploadTemplate.includes('{')) {
    throw new Error('draft release upload URL is invalid')
  }
  const uploadBase = uploadTemplate.slice(0, uploadTemplate.indexOf('{'))
  for (const asset of expectedAssets) {
    const uploadUrl = new URL(uploadBase)
    uploadUrl.searchParams.set('name', asset.name)
    await apiRequest(uploadUrl.href, {
      body: asset.bytes,
      contentType: 'application/octet-stream',
      expectedStatuses: [201],
      fetchImpl,
      method: 'POST',
      token,
    })
  }

  releaseResponse = await apiRequest(releaseByTagUrl, {
    expectedStatuses: [200],
    fetchImpl,
    token,
  })
  assertExactRelease(
    releaseResponse.value,
    { notes, tag, title },
    expectedAssets,
    true
  )
  await apiRequest(releaseUrl, {
    body: { draft: false },
    expectedStatuses: [200],
    fetchImpl,
    method: 'PATCH',
    token,
  })
  const published = await apiRequest(releaseByTagUrl, {
    expectedStatuses: [200],
    fetchImpl,
    token,
  })
  assertExactRelease(
    published.value,
    { notes, tag, title },
    expectedAssets,
    false
  )
  return { releaseId: published.value.id, status: 'published' }
}

async function runCli() {
  const artifactDirectory = path.resolve('artifacts/npm')
  const verified = verifyReleaseArtifacts({ artifactDirectory })
  const notes = readFileSync(
    path.resolve(
      process.env.RELEASE_NOTES_PATH ?? `docs/launch/v${verified.version}.md`
    ),
    'utf8'
  )
  const result = await createOrResumeGithubRelease({
    artifactDirectory,
    githubRepository: process.env.GITHUB_REPOSITORY,
    githubSha: process.env.GITHUB_SHA,
    notes,
    tag: process.env.GITHUB_REF_NAME,
    title: `FigmaVars v${verified.version}`,
    token: process.env.GITHUB_TOKEN,
  })
  console.log(`GitHub Release ${result.status}`)
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  try {
    await runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
