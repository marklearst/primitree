#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyReleaseArtifacts } from './release-artifacts.mjs'

const API_VERSION = '2022-11-28'
const REQUEST_TIMEOUT_MS = 10_000
const MAX_TAG_DEREFERENCES = 5
const MAX_RELEASE_LIST_PAGES = 10

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
      redirect: 'error',
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
  return {
    status: response.status,
    value,
    headers: {
      link: response.headers?.get?.('link') ?? undefined,
    },
  }
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

async function requireRemoteTagCommit({
  apiBaseUrl,
  expectedCommit,
  fetchImpl,
  repository,
  tag,
  token,
}) {
  const remoteTagCommit = await resolveRemoteTagCommit({
    apiBaseUrl,
    fetchImpl,
    repository,
    tag,
    token,
  })
  if (remoteTagCommit !== expectedCommit) {
    throw new Error('remote release tag does not equal GITHUB_SHA')
  }
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
  if (
    release.assets.some(asset => !Number.isInteger(asset?.id)) ||
    new Set(release.assets.map(asset => asset.id)).size !==
      release.assets.length
  ) {
    throw new Error('GitHub Release contains duplicate asset IDs')
  }
  for (const asset of release.assets) {
    const expected = expectedByName.get(asset?.name)
    if (
      expected === undefined ||
      asset.state !== 'uploaded' ||
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
  if (!draft && release?.immutable !== true) {
    throw new Error('published release is not immutable')
  }
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

function assertExactDraftAssetSubset(release, expectedAssets) {
  if (release?.draft !== true) {
    throw new Error('GitHub Release stopped being a draft')
  }
  if (!Array.isArray(release.assets)) {
    throw new Error('draft release assets must be an array')
  }
  const expectedNames = new Set(expectedAssets.map(asset => asset.name))
  if (
    release.assets.some(
      asset =>
        !Number.isInteger(asset?.id) ||
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
  if (
    new Set(release.assets.map(asset => asset.id)).size !==
    release.assets.length
  ) {
    throw new Error('draft release contains duplicate asset IDs')
  }
  const expectedByName = new Map(
    expectedAssets.map(asset => [asset.name, asset])
  )
  for (const asset of release.assets) {
    if (asset.state !== 'uploaded') {
      throw new Error(
        `draft release asset state is not uploaded: ${asset.name}`
      )
    }
    const expected = expectedByName.get(asset.name)
    if (
      expected === undefined ||
      asset.size !== expected.size ||
      asset.digest !== expected.digest
    ) {
      throw new Error(`draft release asset mismatch: ${asset.name}`)
    }
  }
}

function draftAssetSnapshot(release) {
  return release.assets
    .map(asset => ({ id: asset.id, name: asset.name }))
    .sort((left, right) => left.id - right.id)
}

function assertDraftAssetSnapshot(release, expectedAssets, expectedSnapshot) {
  assertExactDraftAssetSubset(release, expectedAssets)
  const actualSnapshot = draftAssetSnapshot(release)
  if (
    actualSnapshot.length !== expectedSnapshot.length ||
    actualSnapshot.some(
      (asset, index) =>
        asset.id !== expectedSnapshot[index]?.id ||
        asset.name !== expectedSnapshot[index]?.name
    )
  ) {
    throw new Error('draft release asset IDs changed during mutation')
  }
}

function assertDraftMetadata(release, expected) {
  if (release?.draft !== true) {
    throw new Error('GitHub Release stopped being a draft')
  }
  if (
    release?.tag_name !== expected.tag ||
    release?.name !== expected.title ||
    release?.body !== expected.notes ||
    release?.prerelease !== false
  ) {
    throw new Error('draft release does not match reviewed metadata')
  }
}

function assertUploadedAssetSnapshot(
  release,
  expectedAssets,
  expectedSnapshot
) {
  assertDraftAssetSnapshot(release, expectedAssets, expectedSnapshot)
  const expectedByName = new Map(
    expectedAssets.map(asset => [asset.name, asset])
  )
  for (const asset of release.assets) {
    const expected = expectedByName.get(asset.name)
    if (
      expected === undefined ||
      asset.size !== expected.size ||
      asset.digest !== expected.digest
    ) {
      throw new Error(`GitHub Release asset mismatch: ${asset.name}`)
    }
  }
}

function uploadedAssetSnapshotEntry(uploaded, expected, previousSnapshot) {
  if (
    !Number.isInteger(uploaded?.id) ||
    uploaded?.name !== expected.name ||
    uploaded?.state !== 'uploaded' ||
    uploaded?.size !== expected.size ||
    uploaded?.digest !== expected.digest ||
    previousSnapshot.some(asset => asset.id === uploaded.id)
  ) {
    throw new Error(`GitHub upload response mismatch: ${expected.name}`)
  }
  return { id: uploaded.id, name: uploaded.name }
}

function validatedUploadBase({
  apiBaseUrl,
  releaseId,
  repository,
  uploadTemplate,
}) {
  const templateSuffix = '{?name,label}'
  if (
    typeof uploadTemplate !== 'string' ||
    !uploadTemplate.endsWith(templateSuffix)
  ) {
    throw new Error('draft release upload URL is invalid')
  }

  let apiUrl
  let uploadUrl
  try {
    apiUrl = new URL(apiBaseUrl)
    uploadUrl = new URL(uploadTemplate.slice(0, -templateSuffix.length))
  } catch {
    throw new Error('draft release upload URL is invalid')
  }

  const productionApi = apiUrl.hostname === 'api.github.com'
  const expectedOrigin = productionApi
    ? 'https://uploads.github.com'
    : apiUrl.origin
  const expectedPath = `/repos/${repository}/releases/${releaseId}/assets`
  if (
    uploadUrl.origin !== expectedOrigin ||
    uploadUrl.pathname !== expectedPath ||
    uploadUrl.username !== '' ||
    uploadUrl.password !== '' ||
    uploadUrl.search !== '' ||
    uploadUrl.hash !== '' ||
    (productionApi &&
      (apiUrl.protocol !== 'https:' ||
        uploadUrl.protocol !== 'https:' ||
        uploadUrl.port !== ''))
  ) {
    throw new Error('draft release upload URL left the allowed GitHub boundary')
  }

  return uploadUrl.href
}

function parseNextReleasePage(
  linkHeader,
  expectedOrigin,
  expectedPath,
  expectedPage
) {
  if (linkHeader === undefined) return undefined
  if (typeof linkHeader !== 'string') {
    throw new Error('GitHub release list Link header is invalid')
  }
  const nextLinks = linkHeader
    .split(',')
    .map(part => /^\s*<([^>]+)>;\s*rel="next"\s*$/.exec(part))
    .filter(match => match !== null)
  if (nextLinks.length === 0) return undefined
  if (nextLinks.length !== 1) {
    throw new Error('GitHub release list has multiple next-page links')
  }
  let next
  try {
    next = new URL(nextLinks[0][1])
  } catch {
    throw new Error('GitHub release list next-page URL is invalid')
  }
  if (
    next.origin !== expectedOrigin ||
    next.pathname !== expectedPath ||
    next.username !== '' ||
    next.password !== '' ||
    next.hash !== '' ||
    next.searchParams.size !== 2 ||
    next.searchParams.get('per_page') !== '100' ||
    next.searchParams.get('page') !== String(expectedPage)
  ) {
    throw new Error('GitHub release list next-page URL left the API boundary')
  }
  return next.href
}

async function findDraftRelease({
  apiBaseUrl,
  fetchImpl,
  repository,
  tag,
  token,
}) {
  const expectedPath = `/repos/${repository}/releases`
  const firstPage = new URL(joinApiPath(apiBaseUrl, expectedPath))
  firstPage.searchParams.set('per_page', '100')
  firstPage.searchParams.set('page', '1')
  const expectedOrigin = new URL(apiBaseUrl).origin
  const matches = []
  let pageUrl = firstPage.href

  for (let page = 1; page <= MAX_RELEASE_LIST_PAGES; page += 1) {
    const response = await apiRequest(pageUrl, {
      expectedStatuses: [200],
      fetchImpl,
      token,
    })
    if (!Array.isArray(response.value)) {
      throw new Error('GitHub release list must be an array')
    }
    for (const release of response.value) {
      if (release?.tag_name === tag) matches.push(release)
    }
    if (matches.length > 1) {
      throw new Error(`GitHub has more than one release for ${tag}`)
    }
    const nextPage = parseNextReleasePage(
      response.headers.link,
      expectedOrigin,
      expectedPath,
      page + 1
    )
    if (nextPage === undefined) break
    if (page === MAX_RELEASE_LIST_PAGES) {
      throw new Error(
        `GitHub release list exceeded ${MAX_RELEASE_LIST_PAGES} pages`
      )
    }
    pageUrl = nextPage
  }

  const [match] = matches
  if (match !== undefined && match.draft !== true) {
    throw new Error('GitHub Release stopped being a draft')
  }
  return match
}

async function readReleaseById({
  apiBaseUrl,
  fetchImpl,
  releaseId,
  repository,
  token,
}) {
  const releaseUrl = joinApiPath(
    apiBaseUrl,
    `/repos/${repository}/releases/${releaseId}`
  )
  const response = await apiRequest(releaseUrl, {
    expectedStatuses: [200],
    fetchImpl,
    token,
  })
  if (response.value?.id !== releaseId) {
    throw new Error('GitHub Release ID changed during lookup')
  }
  return {
    release: response.value,
    releaseUrl,
  }
}

async function readDraftRelease(options) {
  const release = await findDraftRelease({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    repository: options.repository,
    tag: options.tag,
    token: options.token,
  })
  if (release === undefined || release.id !== options.releaseId) {
    throw new Error('GitHub Release stopped being a draft')
  }
  assertExactDraftAssetSubset(release, options.expectedAssets)
  return {
    release,
    releaseUrl: joinApiPath(
      options.apiBaseUrl,
      `/repos/${options.repository}/releases/${options.releaseId}`
    ),
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
  await requireRemoteTagCommit({
    apiBaseUrl,
    expectedCommit: githubSha,
    fetchImpl,
    repository: githubRepository,
    tag,
    token,
  })

  const releaseByTagUrl = joinApiPath(
    apiBaseUrl,
    `/repos/${githubRepository}/releases/tags/${encodePathSegment(tag)}`
  )
  const releaseResponse = await apiRequest(releaseByTagUrl, {
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
    await requireRemoteTagCommit({
      apiBaseUrl,
      expectedCommit: githubSha,
      fetchImpl,
      repository: githubRepository,
      tag,
      token,
    })
    return { releaseId: releaseResponse.value.id, status: 'unchanged' }
  }

  let releaseId
  if (releaseResponse.status === 404) {
    const draft = await findDraftRelease({
      apiBaseUrl,
      fetchImpl,
      repository: githubRepository,
      tag,
      token,
    })
    if (draft === undefined) {
      const created = (
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
      if (created?.draft !== true || !Number.isInteger(created?.id)) {
        throw new Error('created GitHub Release draft is invalid')
      }
      releaseId = created.id
    } else {
      if (!Number.isInteger(draft.id)) {
        throw new Error('listed draft release id is invalid')
      }
      releaseId = draft.id
    }
  } else {
    throw new Error('GitHub Release state is neither absent nor published')
  }

  let draftState = await readDraftRelease({
    apiBaseUrl,
    expectedAssets,
    fetchImpl,
    releaseId,
    repository: githubRepository,
    tag,
    token,
  })
  const expectedMetadata = { notes, tag, title }
  let assetSnapshot = draftAssetSnapshot(draftState.release)
  const release = (
    await apiRequest(draftState.releaseUrl, {
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
  assertDraftMetadata(release, expectedMetadata)
  assertDraftAssetSnapshot(release, expectedAssets, assetSnapshot)
  draftState = await readDraftRelease({
    apiBaseUrl,
    expectedAssets,
    fetchImpl,
    releaseId,
    repository: githubRepository,
    tag,
    token,
  })
  assertDraftMetadata(draftState.release, expectedMetadata)
  assertDraftAssetSnapshot(draftState.release, expectedAssets, assetSnapshot)

  let uploadedSnapshot = assetSnapshot
  const uploadedNames = new Set(uploadedSnapshot.map(asset => asset.name))
  const missingAssets = expectedAssets.filter(
    asset => !uploadedNames.has(asset.name)
  )
  for (const asset of missingAssets) {
    const uploadBase = validatedUploadBase({
      apiBaseUrl,
      releaseId,
      repository: githubRepository,
      uploadTemplate: draftState.release.upload_url,
    })
    const uploadUrl = new URL(uploadBase)
    uploadUrl.searchParams.set('name', asset.name)
    const uploaded = (
      await apiRequest(uploadUrl.href, {
        body: asset.bytes,
        contentType: 'application/octet-stream',
        expectedStatuses: [201],
        fetchImpl,
        method: 'POST',
        token,
      })
    ).value
    uploadedSnapshot = [
      ...uploadedSnapshot,
      uploadedAssetSnapshotEntry(uploaded, asset, uploadedSnapshot),
    ].sort((left, right) => left.id - right.id)
    draftState = await readDraftRelease({
      apiBaseUrl,
      expectedAssets,
      fetchImpl,
      releaseId,
      repository: githubRepository,
      tag,
      token,
    })
    assertDraftMetadata(draftState.release, expectedMetadata)
    assertUploadedAssetSnapshot(
      draftState.release,
      expectedAssets,
      uploadedSnapshot
    )
  }

  assertExactRelease(draftState.release, expectedMetadata, expectedAssets, true)
  await requireRemoteTagCommit({
    apiBaseUrl,
    expectedCommit: githubSha,
    fetchImpl,
    repository: githubRepository,
    tag,
    token,
  })
  const publishResponse = await apiRequest(draftState.releaseUrl, {
    body: {
      body: notes,
      draft: false,
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
  if (publishResponse.value?.id !== releaseId) {
    throw new Error('published release ID changed during mutation')
  }
  assertExactRelease(
    publishResponse.value,
    expectedMetadata,
    expectedAssets,
    false
  )
  const publishedById = await readReleaseById({
    apiBaseUrl,
    fetchImpl,
    releaseId,
    repository: githubRepository,
    token,
  })
  assertExactRelease(
    publishedById.release,
    expectedMetadata,
    expectedAssets,
    false
  )
  const published = await apiRequest(releaseByTagUrl, {
    expectedStatuses: [200],
    fetchImpl,
    token,
  })
  if (published.value?.id !== releaseId) {
    throw new Error('published release ID changed during final lookup')
  }
  assertExactRelease(published.value, expectedMetadata, expectedAssets, false)
  await requireRemoteTagCommit({
    apiBaseUrl,
    expectedCommit: githubSha,
    fetchImpl,
    repository: githubRepository,
    tag,
    token,
  })
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
    title: `Primitree v${verified.version}`,
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
