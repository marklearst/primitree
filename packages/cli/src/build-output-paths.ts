export const MAX_PORTABLE_PATH_SEGMENT_BYTES = 255
export const MAX_BUILD_OUTPUT_FILE_DIRECTORY_DEPTH = 64
export const MAX_BUILD_OUTPUT_FILE_PATH_COMPONENTS =
  MAX_BUILD_OUTPUT_FILE_DIRECTORY_DEPTH + 1
export const MAX_BUILD_OUTPUT_FILE_PATH_BYTES =
  MAX_BUILD_OUTPUT_FILE_PATH_COMPONENTS * MAX_PORTABLE_PATH_SEGMENT_BYTES +
  MAX_BUILD_OUTPUT_FILE_DIRECTORY_DEPTH
const MKTEMP_RANDOM_SUFFIX_SAMPLE = 'XXXXXX'
const UUID_SAMPLE = '00000000-0000-0000-0000-000000000000'

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

export function buildOutputCleanupName(
  outputName: string,
  uuid: string
): string {
  return `.${outputName}.primitree-clean-${uuid}`
}

const MAX_BUILD_SIDECAR_OVERHEAD_BYTES = Math.max(
  Buffer.byteLength(buildOutputLockName(''), 'utf8'),
  Buffer.byteLength(
    `${buildOutputStagePrefix('')}${MKTEMP_RANDOM_SUFFIX_SAMPLE}`,
    'utf8'
  ),
  Buffer.byteLength(buildOutputBackupName('', UUID_SAMPLE), 'utf8'),
  Buffer.byteLength(buildOutputCleanupName('', UUID_SAMPLE), 'utf8')
)

export const MAX_BUILD_OUTPUT_NAME_BYTES =
  MAX_PORTABLE_PATH_SEGMENT_BYTES - MAX_BUILD_SIDECAR_OVERHEAD_BYTES
