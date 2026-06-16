type ExportSummary = {
  collections: number
  variables: number
  modes: number
  fileName: string
}

type UiMessage =
  | { type: 'ready'; fileName: string }
  | {
      type: 'exported'
      json: string
      summary: ExportSummary
    }
  | { type: 'error'; message: string }

const fileNameEl = document.getElementById('file-name') as HTMLParagraphElement
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement
const excludeHidden = document.getElementById(
  'exclude-hidden'
) as HTMLInputElement
const statsEl = document.getElementById('stats') as HTMLDivElement
const actionsEl = document.getElementById('actions') as HTMLDivElement
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement
const errorEl = document.getElementById('error') as HTMLParagraphElement

let latestJson = ''
let latestFileName = 'variables.json'
let resultGeneration = 0
let copyResetTimer: ReturnType<typeof setTimeout> | undefined

function showError(message: string) {
  errorEl.textContent = message
}

function clearError() {
  errorEl.textContent = ''
}

function clearExportResult() {
  resultGeneration += 1
  if (copyResetTimer !== undefined) {
    clearTimeout(copyResetTimer)
    copyResetTimer = undefined
  }
  latestJson = ''
  latestFileName = 'variables.json'
  statsEl.textContent = ''
  actionsEl.classList.add('hidden')
  copyBtn.textContent = 'Copy'
}

function setExporting(exporting: boolean) {
  exportBtn.disabled = exporting
  excludeHidden.disabled = exporting
  downloadBtn.disabled = exporting
  copyBtn.disabled = exporting
  exportBtn.textContent = exporting ? 'Exporting…' : 'Export JSON'
}

exportBtn.addEventListener('click', () => {
  clearError()
  clearExportResult()
  setExporting(true)
  parent.postMessage(
    { pluginMessage: { type: 'export', excludeHidden: excludeHidden.checked } },
    '*'
  )
})

excludeHidden.addEventListener('change', clearExportResult)

downloadBtn.addEventListener('click', () => {
  if (!latestJson || downloadBtn.disabled) {
    return
  }
  const blob = new Blob([latestJson], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = latestFileName
  anchor.click()
  URL.revokeObjectURL(url)
})

copyBtn.addEventListener('click', async () => {
  if (!latestJson || copyBtn.disabled) {
    return
  }
  clearError()
  const jsonToCopy = latestJson
  const copyGeneration = resultGeneration
  try {
    await navigator.clipboard.writeText(jsonToCopy)
    if (copyGeneration !== resultGeneration || jsonToCopy !== latestJson) {
      return
    }
    copyBtn.textContent = 'Copied'
    copyResetTimer = setTimeout(() => {
      if (copyGeneration !== resultGeneration || jsonToCopy !== latestJson) {
        return
      }
      copyBtn.textContent = 'Copy'
      copyResetTimer = undefined
    }, 1200)
  } catch {
    if (copyGeneration !== resultGeneration || jsonToCopy !== latestJson) {
      return
    }
    showError('Clipboard blocked. Use Download instead.')
  }
})

window.onmessage = event => {
  const msg = event.data.pluginMessage as UiMessage | undefined
  if (!msg) {
    return
  }

  if (msg.type === 'ready') {
    fileNameEl.textContent = msg.fileName
    return
  }

  if (msg.type === 'error') {
    clearExportResult()
    setExporting(false)
    showError(msg.message)
    return
  }

  if (msg.type === 'exported') {
    clearExportResult()
    latestJson = msg.json
    latestFileName = msg.summary.fileName
    statsEl.textContent =
      `${msg.summary.collections} collections · ` +
      `${msg.summary.variables} variables · ` +
      `${msg.summary.modes} modes`
    actionsEl.classList.remove('hidden')
    setExporting(false)
  }
}
