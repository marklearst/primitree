'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  analyze,
  downloadBlob,
  resolvePreview,
  zipPipeline,
  type Preview,
} from '@/lib/playground/pipeline'
import sampleVariables from '@/lib/playground/sample-variables.json'
import '@/components/playground/playground.css'

const tabs = ['tokens', 'files'] as const

type Tab = (typeof tabs)[number]

function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatPlaygroundStats(counts: {
  collections: number
  variables: number
  contexts: number
  files: number
}): string {
  return [
    formatCount(counts.collections, 'collection'),
    formatCount(counts.variables, 'token'),
    formatCount(counts.contexts, 'context axis', 'context axes'),
    formatCount(counts.files, 'file generated', 'files generated'),
  ].join(' · ')
}

function formatWarningCount(count: number): string {
  return formatCount(count, 'warning')
}

export function PlaygroundApp() {
  const [hydrated, setHydrated] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Tab>('tokens')
  const [openFile, setOpenFile] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tokensTabRef = useRef<HTMLButtonElement>(null)
  const filesTabRef = useRef<HTMLButtonElement>(null)

  const tabRefs = {
    tokens: tokensTabRef,
    files: filesTabRef,
  } as const

  useEffect(() => {
    setHydrated(true)
  }, [])

  const onTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: Tab
  ) => {
    const currentIndex = tabs.indexOf(currentTab)
    let nextTab: Tab | undefined

    switch (event.key) {
      case 'ArrowRight':
        nextTab = tabs[(currentIndex + 1) % tabs.length]
        break
      case 'ArrowLeft':
        nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length]
        break
      case 'Home':
        nextTab = tabs[0]
        break
      case 'End':
        nextTab = tabs[tabs.length - 1]
        break
      default:
        return
    }

    event.preventDefault()
    setTab(nextTab)
    tabRefs[nextTab].current?.focus()
  }

  const load = useCallback((text: string, name: string) => {
    try {
      const next = analyze(text, name)
      const defaults: Record<string, string> = {}
      for (const [axis, contexts] of Object.entries(next.contexts)) {
        const fallback =
          next.dtcg.resolver.modifiers?.[axis]?.default ?? contexts[0]
        if (fallback) {
          defaults[axis] = fallback
        }
      }
      setPreview(next)
      setSelection(defaults)
      setError(null)
      setTab('tokens')
      setOpenFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPreview(null)
    }
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer.files[0]
      if (!file) {
        return
      }
      file.text().then(text => load(text, file.name))
    },
    [load]
  )

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      file.text().then(text => load(text, file.name))
    },
    [load]
  )

  const tokens = useMemo(
    () => (preview ? resolvePreview(preview, selection) : []),
    [preview, selection]
  )

  const colorTokens = tokens.filter(t => t.type === 'color')
  const otherTokens = tokens.filter(t => t.type !== 'color')

  return (
    <div
      className='pg-shell'
      data-hydrated={hydrated}>
      {!preview ? <p className='pg-kicker'>Playground</p> : null}
      <h1 className={`pg-title${preview ? ' pg-visually-hidden' : ''}`}>
        Preview a variables export
        <br /> <em>before you install the CLI.</em>
      </h1>

      {!preview && (
        <section className='pg-landing'>
          <p className='pg-lede'>
            This page calls the same build function as{' '}
            <Link
              href='/docs/cli/build'
              className='pg-link'>
              figma-vars build
            </Link>
            . It processes the file in this browser tab. Read the{' '}
            <Link
              href='/docs/getting-started'
              className='pg-link'>
              docs
            </Link>{' '}
            for CI, hooks, and MCP.
          </p>

          <fieldset
            aria-labelledby='pg-dropzone-title'
            className={`pg-dropzone${dragging ? ' dragging' : ''}`}
            style={{ margin: 0, minInlineSize: 0 }}
            onDragOver={event => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}>
            <p
              id='pg-dropzone-title'
              className='pg-dz-title'>
              Drag variables.json here
            </p>
            <p className='pg-dz-sub'>
              from <code>figma-vars export</code> or another supported exporter
            </p>
            <div className='pg-dz-actions'>
              <button
                type='button'
                className='pg-button primary'
                onClick={() => fileInputRef.current?.click()}>
                Choose file
              </button>
              <input
                ref={fileInputRef}
                type='file'
                accept='.json,application/json'
                onChange={onPick}
                hidden
              />
              <button
                type='button'
                className='pg-button ghost'
                onClick={() =>
                  load(JSON.stringify(sampleVariables), 'sample-variables.json')
                }>
                Try the sample
              </button>
            </div>
          </fieldset>

          {error ? (
            <div
              className='pg-error'
              role='alert'>
              {error}
            </div>
          ) : null}
        </section>
      )}

      {preview ? (
        <section className='pg-report'>
          <div className='pg-report-head'>
            <div>
              <h2>{preview.fileName}</h2>
              <p className='pg-stats'>
                {formatPlaygroundStats({
                  collections: preview.pipeline.summary.collections,
                  variables: preview.pipeline.summary.variables,
                  contexts: Object.keys(preview.contexts).length,
                  files: preview.pipeline.files.length,
                })}
              </p>
            </div>
            <div className='pg-report-actions'>
              <button
                type='button'
                className='pg-button ghost'
                onClick={() => setPreview(null)}>
                Start over
              </button>
              <button
                type='button'
                className='pg-button primary'
                onClick={() =>
                  downloadBlob(
                    zipPipeline(preview.pipeline),
                    'design-tokens.zip'
                  )
                }>
                Download pipeline (.zip)
              </button>
            </div>
          </div>

          {preview.dtcg.warnings.length > 0 ? (
            <details className='pg-warnings'>
              <summary>
                {formatWarningCount(preview.dtcg.warnings.length)}
              </summary>
              <ul>
                {preview.dtcg.warnings.map(warning => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}

          {Object.keys(preview.contexts).length > 0 ? (
            <section className='pg-contexts'>
              {Object.entries(preview.contexts).map(([axis, contexts]) => (
                <fieldset
                  className='pg-axis'
                  key={axis}>
                  <legend className='pg-axis-name'>{axis}</legend>
                  <div className='pg-axis-options'>
                    {contexts.map(context => (
                      <label
                        key={context}
                        className='pg-chip'>
                        <input
                          type='radio'
                          name={`context-${axis}`}
                          value={context}
                          checked={selection[axis] === context}
                          onChange={() =>
                            setSelection(previous => ({
                              ...previous,
                              [axis]: context,
                            }))
                          }
                        />
                        <span>{context}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </section>
          ) : null}

          <div
            className='pg-tabs'
            role='tablist'
            aria-label='Preview output'>
            <button
              ref={tokensTabRef}
              type='button'
              id='pg-tab-tokens'
              role='tab'
              aria-selected={tab === 'tokens'}
              aria-controls='pg-panel-tokens'
              tabIndex={tab === 'tokens' ? 0 : -1}
              className={`pg-tab${tab === 'tokens' ? ' active' : ''}`}
              onClick={() => setTab('tokens')}
              onKeyDown={event => onTabKeyDown(event, 'tokens')}>
              Tokens
            </button>
            <button
              ref={filesTabRef}
              type='button'
              id='pg-tab-files'
              role='tab'
              aria-selected={tab === 'files'}
              aria-controls='pg-panel-files'
              tabIndex={tab === 'files' ? 0 : -1}
              className={`pg-tab${tab === 'files' ? ' active' : ''}`}
              onClick={() => setTab('files')}
              onKeyDown={event => onTabKeyDown(event, 'files')}>
              Generated files
            </button>
          </div>

          <section
            className='pg-tab-panel'
            id='pg-panel-tokens'
            role='tabpanel'
            aria-labelledby='pg-tab-tokens'
            hidden={tab !== 'tokens'}>
            {colorTokens.length > 0 ? (
              <section>
                <h3>Colors</h3>
                <div className='pg-swatches'>
                  {colorTokens.map(token => (
                    <div
                      className='pg-swatch'
                      key={token.path}
                      title={token.path}>
                      <span
                        className='pg-swatch-chip'
                        style={{ background: token.css ?? 'transparent' }}
                      />
                      <span className='pg-swatch-path'>{token.path}</span>
                      <code className='pg-swatch-value'>{token.css}</code>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {otherTokens.length > 0 ? (
              <section>
                <h3>Other token types</h3>
                <section
                  className='pg-table-region'
                  aria-label='Generated tokens'
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: This labeled overflow region must be focusable so keyboard users can scroll its wide table.
                  tabIndex={0}>
                  <table className='pg-token-table'>
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Type</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherTokens.map(token => (
                        <tr key={token.path}>
                          <td>
                            <code>{token.path}</code>
                          </td>
                          <td>
                            <span className='pg-type-chip'>{token.type}</span>
                          </td>
                          <td>
                            <code>
                              {token.css ?? JSON.stringify(token.value)}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </section>
            ) : null}
          </section>

          <section
            className='pg-tab-panel pg-files'
            id='pg-panel-files'
            role='tabpanel'
            aria-labelledby='pg-tab-files'
            hidden={tab !== 'files'}>
            <ul className='pg-file-list'>
              {preview.pipeline.files.map(file => (
                <li key={file.path}>
                  <button
                    type='button'
                    className={`pg-file${openFile === file.path ? ' active' : ''}`}
                    onClick={() =>
                      setOpenFile(openFile === file.path ? null : file.path)
                    }>
                    {file.path}
                  </button>
                </li>
              ))}
            </ul>
            <pre className='pg-file-view'>
              <code>
                {openFile
                  ? preview.pipeline.files.find(f => f.path === openFile)
                      ?.contents
                  : 'Select a file to preview its contents.'}
              </code>
            </pre>
          </section>
        </section>
      ) : null}

      <p className='pg-footnote'>
        The playground runs in this browser tab with the CLI build packages.{' '}
        <Link href='/docs/cli/build'>See build docs</Link>.
      </p>
    </div>
  )
}
