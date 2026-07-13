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

function showError(message: string) {
  errorEl.textContent = message
}

function clearError() {
  errorEl.textContent = ''
}

exportBtn.addEventListener('click', () => {
  clearError()
  statsEl.textContent = ''
  exportBtn.disabled = true
  exportBtn.textContent = 'Exporting…'
  parent.postMessage(
    { pluginMessage: { type: 'export', excludeHidden: excludeHidden.checked } },
    '*'
  )
})

downloadBtn.addEventListener('click', () => {
  if (!latestJson) {
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
  if (!latestJson) {
    return
  }
  clearError()
  try {
    await navigator.clipboard.writeText(latestJson)
    copyBtn.textContent = 'Copied'
    setTimeout(() => {
      copyBtn.textContent = 'Copy'
    }, 1200)
  } catch {
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

  exportBtn.disabled = false
  exportBtn.textContent = 'Export JSON'

  if (msg.type === 'error') {
    showError(msg.message)
    return
  }

  if (msg.type === 'exported') {
    latestJson = msg.json
    latestFileName = msg.summary.fileName
    statsEl.textContent =
      `${msg.summary.collections} collections · ` +
      `${msg.summary.variables} variables · ` +
      `${msg.summary.modes} modes`
    actionsEl.classList.remove('hidden')
  }
}
