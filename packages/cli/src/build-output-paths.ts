const PORTABLE_FILENAME_COMPONENT_BYTES = 255
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

const MAX_BUILD_SIDECAR_OVERHEAD_BYTES = Math.max(
  Buffer.byteLength(buildOutputLockName(''), 'utf8'),
  Buffer.byteLength(
    `${buildOutputStagePrefix('')}${MKTEMP_RANDOM_SUFFIX_SAMPLE}`,
    'utf8'
  ),
  Buffer.byteLength(buildOutputBackupName('', UUID_SAMPLE), 'utf8')
)

export const MAX_BUILD_OUTPUT_NAME_BYTES =
  PORTABLE_FILENAME_COMPONENT_BYTES - MAX_BUILD_SIDECAR_OVERHEAD_BYTES
