import path from 'node:path'

export const MAX_PORTABLE_PATH_SEGMENT_BYTES = 255
export const MAX_BUILD_OUTPUT_DIRECTORY_PATH_COMPONENTS = 64
export const MAX_BUILD_OUTPUT_FILE_DIRECTORY_DEPTH = 64
export const MAX_BUILD_OUTPUT_FILE_PATH_COMPONENTS =
  MAX_BUILD_OUTPUT_FILE_DIRECTORY_DEPTH + 1
export const MAX_BUILD_OUTPUT_FILE_PATH_BYTES =
  MAX_BUILD_OUTPUT_FILE_PATH_COMPONENTS * MAX_PORTABLE_PATH_SEGMENT_BYTES +
  MAX_BUILD_OUTPUT_FILE_DIRECTORY_DEPTH
const MKTEMP_RANDOM_SUFFIX_SAMPLE = 'XXXXXX'
const UUID_SAMPLE = '00000000-0000-0000-0000-000000000000'
export const LONGEST_REQUIRED_CONFIGURED_BUILD_FILE_PATH =
  'tokens/tokens.resolver.json'

export function buildOutputLockName(outputName: string): string {
  return `.${outputName}.primitree-lock`
}

export function buildOutputStagePrefix(outputName: string): string {
  return `.${outputName}.primitree-stage-`
}

export function buildOutputBackupPrefix(outputName: string): string {
  return `.${outputName}.primitree-backup-`
}

export function buildOutputBackupName(
  outputName: string,
  uuid: string
): string {
  return `${buildOutputBackupPrefix(outputName)}${uuid}`
}

export function buildOutputCleanupPrefix(outputName: string): string {
  return `.${outputName}.primitree-clean-`
}

export function buildOutputCleanupName(
  outputName: string,
  uuid: string
): string {
  return `${buildOutputCleanupPrefix(outputName)}${uuid}`
}

export function buildOutputLongestSidecarName(outputName: string): string {
  const candidates = [
    buildOutputLockName(outputName),
    `${buildOutputStagePrefix(outputName)}${MKTEMP_RANDOM_SUFFIX_SAMPLE}`,
    buildOutputBackupName(outputName, UUID_SAMPLE),
    buildOutputCleanupName(outputName, UUID_SAMPLE),
  ]
  return candidates.reduce((longest, candidate) =>
    Buffer.byteLength(candidate, 'utf8') > Buffer.byteLength(longest, 'utf8')
      ? candidate
      : longest
  )
}

export function buildOutputLongestDerivedFilePath(
  directory: string,
  relativeFilePath: string
): string {
  return path.join(
    path.dirname(directory),
    buildOutputLongestSidecarName(path.basename(directory)),
    ...relativeFilePath.split('/')
  )
}

const MAX_BUILD_SIDECAR_OVERHEAD_BYTES = Buffer.byteLength(
  buildOutputLongestSidecarName(''),
  'utf8'
)

export const MAX_BUILD_OUTPUT_NAME_BYTES =
  MAX_PORTABLE_PATH_SEGMENT_BYTES - MAX_BUILD_SIDECAR_OVERHEAD_BYTES

export const MAX_BUILD_RESOLVED_PATH_BYTES = 1023
