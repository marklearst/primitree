'use client'

import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  analyze,
  downloadBlob,
  resolvePreview,
  zipPipeline,
  type Preview,
} from '@/lib/playground/pipeline'
import sampleVariables from '@/lib/playground/sample-variables.json'
import '@/components/playground/playground.css'

type Tab = 'tokens' | 'files'

export function PlaygroundApp() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Tab>('tokens')
  const [openFile, setOpenFile] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <div className='pg-shell'>
      {!preview && (
        <section className='pg-landing'>
          <p className='pg-kicker'>Playground</p>
          <h1>
            Drop your variables.
            <br />
            <em>Preview the pipeline.</em>
          </h1>
          <p className='pg-lede'>
            Same engine as{' '}
            <Link
              href='/docs/cli/build'
              className='pg-link'>
              figma-vars build
            </Link>
            , running in your browser. Nothing uploads. Read the{' '}
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
              from <code>figma-vars export</code>, TokensBrücke, or any
              variables plugin
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

          {error ? <div className='pg-error'>{error}</div> : null}
        </section>
      )}

      {preview ? (
        <section className='pg-report'>
          <div className='pg-report-head'>
            <div>
              <h2>{preview.fileName}</h2>
              <p className='pg-stats'>
                {preview.pipeline.summary.collections} collections ·{' '}
                {preview.pipeline.summary.variables} tokens ·{' '}
                {Object.keys(preview.contexts).length} theme axes ·{' '}
                {preview.pipeline.files.length} files generated
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
              <summary>{preview.dtcg.warnings.length} warning(s)</summary>
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
                <div
                  className='pg-axis'
                  key={axis}>
                  <span className='pg-axis-name'>{axis}</span>
                  <div className='pg-axis-options'>
                    {contexts.map(context => (
                      <button
                        type='button'
                        key={context}
                        className={`pg-chip${selection[axis] === context ? ' active' : ''}`}
                        onClick={() =>
                          setSelection(prev => ({ ...prev, [axis]: context }))
                        }>
                        {context}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          <nav className='pg-tabs'>
            <button
              type='button'
              className={`pg-tab${tab === 'tokens' ? ' active' : ''}`}
              onClick={() => setTab('tokens')}>
              Tokens
            </button>
            <button
              type='button'
              className={`pg-tab${tab === 'files' ? ' active' : ''}`}
              onClick={() => setTab('files')}>
              Generated files
            </button>
          </nav>

          {tab === 'tokens' ? (
            <>
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
                  <h3>Everything else</h3>
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
              ) : null}
            </>
          ) : null}

          {tab === 'files' ? (
            <section className='pg-files'>
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
          ) : null}
        </section>
      ) : null}

      <p className='pg-footnote'>
        Runs client-side in this tab. Same packages as the CLI.{' '}
        <Link href='/docs/cli/build'>See build docs</Link>.
      </p>
    </div>
  )
}
