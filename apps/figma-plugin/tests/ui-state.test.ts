// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard'
)
const originalCreateObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
  URL,
  'createObjectURL'
)
const originalRevokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
  URL,
  'revokeObjectURL'
)

let createObjectUrl: ReturnType<typeof vi.fn>
let revokeObjectUrl: ReturnType<typeof vi.fn>
let writeText: ReturnType<typeof vi.fn>
let postMessage: ReturnType<typeof vi.fn>
let anchorClick: ReturnType<typeof vi.spyOn>

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor)
  } else {
    Reflect.deleteProperty(target, key)
  }
}

function deliverPluginMessage(pluginMessage: object) {
  expect(window.onmessage).toEqual(expect.any(Function))
  window.onmessage?.call(
    window,
    new window.MessageEvent('message', { data: { pluginMessage } })
  )
}

function dispatchReady(fileName = 'Design System') {
  deliverPluginMessage({ type: 'ready', fileName })
}

function dispatchExported(
  json = '{"meta":{}}',
  fileName = 'tokens.json',
  variables = 1
) {
  deliverPluginMessage({
    type: 'exported',
    json,
    summary: { collections: 1, variables, modes: 1, fileName },
  })
}

function dispatchError(message = 'Export failed') {
  deliverPluginMessage({ type: 'error', message })
}

function getFixture() {
  return {
    fileName: document.getElementById('file-name') as HTMLParagraphElement,
    excludeHidden: document.getElementById(
      'exclude-hidden'
    ) as HTMLInputElement,
    exportButton: document.getElementById('export-btn') as HTMLButtonElement,
    stats: document.getElementById('stats') as HTMLDivElement,
    actions: document.getElementById('actions') as HTMLDivElement,
    downloadButton: document.getElementById(
      'download-btn'
    ) as HTMLButtonElement,
    copyButton: document.getElementById('copy-btn') as HTMLButtonElement,
    error: document.getElementById('error') as HTMLParagraphElement,
  }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()

  document.body.innerHTML = `
    <main class="shell">
      <p class="file" id="file-name"></p>
      <label class="check">
        <input id="exclude-hidden" type="checkbox">
        Exclude hidden
      </label>
      <button class="primary" id="export-btn" type="button">Export JSON</button>
      <div
        class="stats announcer"
        id="stats"
        role="status"
        aria-atomic="true"
      ></div>
      <div class="actions hidden" id="actions">
        <button class="ghost" id="download-btn" type="button">Download</button>
        <button class="ghost" id="copy-btn" type="button">Copy</button>
      </div>
      <p
        class="error announcer"
        id="error"
        role="alert"
        aria-atomic="true"
      ></p>
    </main>
  `

  postMessage = vi.fn()
  vi.spyOn(window.parent, 'postMessage').mockImplementation(postMessage)

  createObjectUrl = vi.fn().mockReturnValue('blob:figmavars-test')
  revokeObjectUrl = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectUrl,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectUrl,
  })

  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })

  anchorClick = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})

  await import('../src/ui')
  expect(window.onmessage).toEqual(expect.any(Function))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  window.onmessage = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  restoreProperty(navigator, 'clipboard', originalClipboardDescriptor)
  restoreProperty(URL, 'createObjectURL', originalCreateObjectUrlDescriptor)
  restoreProperty(URL, 'revokeObjectURL', originalRevokeObjectUrlDescriptor)
  document.body.innerHTML = ''
})

describe('Figma plugin UI export state', () => {
  it('invalidates a previous result through retry and error', () => {
    const {
      excludeHidden,
      exportButton,
      stats,
      actions,
      downloadButton,
      copyButton,
      error,
    } = getFixture()
    excludeHidden.checked = true

    dispatchExported()
    expect(actions.classList.contains('hidden')).toBe(false)
    expect(stats.textContent).toBe('1 collections · 1 variables · 1 modes')

    exportButton.click()

    expect(actions.classList.contains('hidden')).toBe(true)
    expect(stats.textContent).toBe('')
    expect(copyButton.textContent).toBe('Copy')
    expect(exportButton.disabled).toBe(true)
    expect(excludeHidden.disabled).toBe(true)
    expect(downloadButton.disabled).toBe(true)
    expect(copyButton.disabled).toBe(true)
    expect(postMessage).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenCalledWith(
      { pluginMessage: { type: 'export', excludeHidden: true } },
      '*'
    )

    dispatchError()

    expect(exportButton.disabled).toBe(false)
    expect(excludeHidden.disabled).toBe(false)
    expect(downloadButton.disabled).toBe(false)
    expect(copyButton.disabled).toBe(false)
    expect(actions.classList.contains('hidden')).toBe(true)
    expect(stats.textContent).toBe('')
    expect(error.textContent).toBe('Export failed')

    downloadButton.click()
    expect(createObjectUrl).not.toHaveBeenCalled()
    expect(anchorClick).not.toHaveBeenCalled()
    expect(revokeObjectUrl).not.toHaveBeenCalled()
  })

  it('invalidates a previous result when export options change', async () => {
    const { excludeHidden, actions, stats, copyButton } = getFixture()
    dispatchExported()

    excludeHidden.checked = true
    excludeHidden.dispatchEvent(new window.Event('change', { bubbles: true }))

    expect(actions.classList.contains('hidden')).toBe(true)
    expect(stats.textContent).toBe('')
    expect(copyButton.textContent).toBe('Copy')
    copyButton.click()
    await flushPromises()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('ignores a pending copy after invalidation and a replacement result', async () => {
    const { excludeHidden, copyButton } = getFixture()
    let resolveWrite: (() => void) | undefined
    writeText.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveWrite = resolve
        })
    )

    dispatchExported('{"result":"old"}', 'old.json')
    copyButton.click()
    expect(writeText).toHaveBeenCalledWith('{"result":"old"}')

    excludeHidden.checked = true
    excludeHidden.dispatchEvent(new window.Event('change', { bubbles: true }))
    dispatchExported('{"result":"new"}', 'new.json')
    resolveWrite?.()
    await flushPromises()

    expect(copyButton.textContent).toBe('Copy')
    vi.advanceTimersByTime(1200)
    expect(copyButton.textContent).toBe('Copy')
  })

  it('ignores a pending copy failure after a replacement result', async () => {
    const { excludeHidden, copyButton, error } = getFixture()
    let rejectWrite: ((reason: Error) => void) | undefined
    writeText.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject
        })
    )

    dispatchExported('{"result":"old"}', 'old.json')
    copyButton.click()
    expect(writeText).toHaveBeenCalledWith('{"result":"old"}')

    excludeHidden.checked = true
    excludeHidden.dispatchEvent(new window.Event('change', { bubbles: true }))
    dispatchExported('{"result":"new"}', 'new.json')
    rejectWrite?.(new Error('permission denied'))
    await flushPromises()

    expect(copyButton.textContent).toBe('Copy')
    expect(error.textContent).toBe('')
  })

  it('keeps a newer copy success authoritative when an older attempt rejects', async () => {
    const { copyButton, error } = getFixture()
    let rejectFirstWrite: ((reason: Error) => void) | undefined
    writeText
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirstWrite = reject
          })
      )
      .mockResolvedValueOnce(undefined)

    dispatchExported()
    copyButton.click()
    copyButton.click()
    await flushPromises()

    expect(writeText).toHaveBeenCalledTimes(2)
    expect(copyButton.textContent).toBe('Copied')
    expect(error.textContent).toBe('')

    rejectFirstWrite?.(new Error('older permission failure'))
    await flushPromises()

    expect(copyButton.textContent).toBe('Copied')
    expect(error.textContent).toBe('')
  })

  it('ignores an older copy success after newer feedback finishes', async () => {
    const { copyButton, error } = getFixture()
    let resolveFirstWrite: (() => void) | undefined
    writeText
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveFirstWrite = resolve
          })
      )
      .mockResolvedValueOnce(undefined)

    dispatchExported()
    copyButton.click()
    copyButton.click()
    await flushPromises()

    expect(copyButton.textContent).toBe('Copied')
    vi.advanceTimersByTime(1200)
    expect(copyButton.textContent).toBe('Copy')

    resolveFirstWrite?.()
    await flushPromises()

    expect(copyButton.textContent).toBe('Copy')
    expect(error.textContent).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives the newest copy attempt sole ownership of its feedback timer', async () => {
    const { excludeHidden, copyButton } = getFixture()
    dispatchExported()

    copyButton.click()
    await flushPromises()
    expect(copyButton.textContent).toBe('Copied')

    vi.advanceTimersByTime(600)
    copyButton.click()
    await flushPromises()

    expect.soft(copyButton.textContent).toBe('Copied')
    expect.soft(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(600)
    expect.soft(copyButton.textContent).toBe('Copied')

    excludeHidden.checked = true
    excludeHidden.dispatchEvent(new window.Event('change', { bubbles: true }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears an old copy reset timer before feedback for a new result', async () => {
    const { copyButton } = getFixture()

    dispatchExported('{"result":"old"}', 'old.json')
    copyButton.click()
    await flushPromises()
    expect(copyButton.textContent).toBe('Copied')

    vi.advanceTimersByTime(600)
    dispatchExported('{"result":"new"}', 'new.json')
    expect(copyButton.textContent).toBe('Copy')
    copyButton.click()
    await flushPromises()
    expect(copyButton.textContent).toBe('Copied')

    vi.advanceTimersByTime(600)
    expect(copyButton.textContent).toBe('Copied')
    vi.advanceTimersByTime(600)
    expect(copyButton.textContent).toBe('Copy')
  })

  it('downloads a valid result once with the exported filename', async () => {
    const { downloadButton } = getFixture()
    dispatchExported('{"meta":{"format":"dtcg"}}', 'tokens.json')

    downloadButton.click()

    expect(createObjectUrl).toHaveBeenCalledOnce()
    const blob = createObjectUrl.mock.calls[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')
    expect(blob.size).toBe(new Blob(['{"meta":{"format":"dtcg"}}']).size)
    expect(anchorClick).toHaveBeenCalledOnce()
    const anchor = anchorClick.mock.contexts[0] as HTMLAnchorElement
    expect(anchor.href).toBe('blob:figmavars-test')
    expect(anchor.download).toBe('tokens.json')
    expect(revokeObjectUrl).toHaveBeenCalledOnce()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:figmavars-test')
  })

  it('reports successful copy feedback and resets it after 1200ms', async () => {
    const { copyButton, error } = getFixture()
    dispatchExported('{"meta":{}}')

    copyButton.click()
    await flushPromises()

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('{"meta":{}}')
    expect(copyButton.textContent).toBe('Copied')
    expect(error.textContent).toBe('')
    vi.advanceTimersByTime(1199)
    expect(copyButton.textContent).toBe('Copied')
    vi.advanceTimersByTime(1)
    expect(copyButton.textContent).toBe('Copy')
  })

  it('announces clipboard failures without changing copy feedback', async () => {
    const { copyButton, error } = getFixture()
    writeText.mockRejectedValueOnce(new Error('permission denied'))
    dispatchExported()

    copyButton.click()
    await flushPromises()

    expect(copyButton.textContent).toBe('Copy')
    expect(error.textContent).toBe('Clipboard blocked. Use Download instead.')
  })

  it('restores every control after a successful export', () => {
    const {
      fileName,
      excludeHidden,
      exportButton,
      actions,
      downloadButton,
      copyButton,
      stats,
      error,
    } = getFixture()
    dispatchReady('Acme Design System')
    expect(fileName.textContent).toBe('Acme Design System')

    exportButton.click()
    dispatchExported('{"meta":{}}', 'acme.tokens.json', 3)

    expect(exportButton.disabled).toBe(false)
    expect(excludeHidden.disabled).toBe(false)
    expect(downloadButton.disabled).toBe(false)
    expect(copyButton.disabled).toBe(false)
    expect(exportButton.textContent).toBe('Export JSON')
    expect(actions.classList.contains('hidden')).toBe(false)
    expect(stats.textContent).toBe('1 collections · 3 variables · 1 modes')
    expect(error.textContent).toBe('')
  })
})
