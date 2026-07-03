import { useCallback, useMemo, useRef, useState } from 'react'
import {
  analyze,
  downloadBlob,
  resolvePreview,
  zipPipeline,
  type Preview,
} from './lib/pipeline'
import sampleVariables from './sample-variables.json'
import mark from './assets/primitree-icon.svg'

const tabs = ['tokens', 'files'] as const

type Tab = (typeof tabs)[number]

export default function App() {
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
    if (!nextTab) {
      return
    }
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
    <div className='shell'>
      <header className='header'>
        <div className='brand'>
          <img
            src={mark}
            alt=''
            aria-hidden='true'
            className='brand-mark'
          />
          <span className='brand-wordmark'>Primitree</span>
          <span className='brand-sub'>Playground</span>
        </div>
        <nav className='header-links'>
          <a
            href='https://github.com/marklearst/primitree'
            target='_blank'
            rel='noreferrer'>
            GitHub
          </a>
          <a
            href='https://www.npmjs.com/package/@primitree/cli'
            target='_blank'
            rel='noreferrer'>
            npm
          </a>
        </nav>
      </header>

      <main className={preview ? 'report' : 'landing'}>
        <h1 className={`page-title${preview ? ' visually-hidden' : ''}`}>
          Preview your Figma variables export.
          <br /> <em>Download the generated token files.</em>
        </h1>

        {!preview && (
          <div className='landing-content'>
            <p className='lede'>
              Your browser writes DTCG 2025.10 tokens, Resolver contexts, CSS,
              Tailwind v4, TypeScript, and CI config.{' '}
              <strong>The playground sends no file data to a server.</strong>
            </p>

            <fieldset
              aria-labelledby='dropzone-title'
              className={`dropzone${dragging ? ' dragging' : ''}`}
              style={{ margin: 0, minInlineSize: 0 }}
              onDragOver={event => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}>
              <p
                id='dropzone-title'
                className='dz-title'>
                Drag a variables.json here
              </p>
              <p className='dz-sub'>
                from <code>primitree export</code>, TokensBrücke, or another
                supported variables plugin
              </p>
              <div className='dz-actions'>
                <button
                  type='button'
                  className='button primary'
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
                  className='button ghost'
                  onClick={() =>
                    load(
                      JSON.stringify(sampleVariables),
                      'sample-variables.json'
                    )
                  }>
                  Try the sample
                </button>
              </div>
            </fieldset>

            {error ? (
              <div
                className='error'
                role='alert'>
                {error}
              </div>
            ) : null}

            <div className='steps'>
              <div className='step'>
                <span className='step-n'>1</span>
                Use a Figma plugin to export variables without the REST API
              </div>
              <div className='step'>
                <span className='step-n'>2</span>
                Drop the JSON here to preview its collections and modes
              </div>
              <div className='step'>
                <span className='step-n'>3</span>
                Download the zip and commit the generated files
              </div>
            </div>
          </div>
        )}

        {preview && (
          <>
            <section className='report-head'>
              <div>
                <h2>{preview.fileName}</h2>
                <p className='stats'>
                  {preview.pipeline.summary.collections} collections ·{' '}
                  {preview.pipeline.summary.variables} tokens ·{' '}
                  {Object.keys(preview.contexts).length} theme axes ·{' '}
                  {preview.pipeline.files.length} files generated
                </p>
              </div>
              <div className='report-actions'>
                <button
                  type='button'
                  className='button ghost'
                  onClick={() => setPreview(null)}>
                  Start over
                </button>
                <button
                  type='button'
                  className='button primary'
                  onClick={() =>
                    downloadBlob(
                      zipPipeline(preview.pipeline),
                      'design-tokens.zip'
                    )
                  }>
                  Download pipeline (.zip)
                </button>
              </div>
            </section>

            {preview.dtcg.warnings.length > 0 && (
              <details className='warnings'>
                <summary>{preview.dtcg.warnings.length} warning(s)</summary>
                <ul>
                  {preview.dtcg.warnings.map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}

            {Object.keys(preview.contexts).length > 0 && (
              <section className='contexts'>
                {Object.entries(preview.contexts).map(([axis, contexts]) => (
                  <fieldset
                    className='axis'
                    key={axis}>
                    <legend className='axis-name'>{axis}</legend>
                    <div className='axis-options'>
                      {contexts.map(context => (
                        <label
                          key={context}
                          className='chip'>
                          <input
                            type='radio'
                            name={`standalone-context-${axis}`}
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
            )}

            <div
              className='tabs'
              role='tablist'
              aria-label='Preview output'>
              <button
                ref={tokensTabRef}
                type='button'
                id='standalone-tab-tokens'
                role='tab'
                aria-selected={tab === 'tokens'}
                aria-controls='standalone-panel-tokens'
                tabIndex={tab === 'tokens' ? 0 : -1}
                className={`tab${tab === 'tokens' ? ' active' : ''}`}
                onClick={() => setTab('tokens')}
                onKeyDown={event => onTabKeyDown(event, 'tokens')}>
                Tokens
              </button>
              <button
                ref={filesTabRef}
                type='button'
                id='standalone-tab-files'
                role='tab'
                aria-selected={tab === 'files'}
                aria-controls='standalone-panel-files'
                tabIndex={tab === 'files' ? 0 : -1}
                className={`tab${tab === 'files' ? ' active' : ''}`}
                onClick={() => setTab('files')}
                onKeyDown={event => onTabKeyDown(event, 'files')}>
                Generated files
              </button>
            </div>

            <section
              className='tab-panel'
              id='standalone-panel-tokens'
              role='tabpanel'
              aria-labelledby='standalone-tab-tokens'
              hidden={tab !== 'tokens'}>
              {colorTokens.length > 0 && (
                <section>
                  <h3>Colors</h3>
                  <div className='swatches'>
                    {colorTokens.map(token => (
                      <div
                        className='swatch'
                        key={token.path}
                        title={token.path}>
                        <span
                          className='swatch-chip'
                          style={{ background: token.css ?? 'transparent' }}
                        />
                        <span className='swatch-path'>{token.path}</span>
                        <code className='swatch-value'>{token.css}</code>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {otherTokens.length > 0 && (
                <section>
                  <h3>Other token types</h3>
                  <section
                    className='table-region'
                    aria-label='Generated tokens'
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: This labeled overflow region must be focusable so keyboard users can scroll its wide table.
                    tabIndex={0}>
                    <table className='token-table'>
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
                              <span className='type-chip'>{token.type}</span>
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
              )}
            </section>

            <section
              className='tab-panel files'
              id='standalone-panel-files'
              role='tabpanel'
              aria-labelledby='standalone-tab-files'
              hidden={tab !== 'files'}>
              <ul className='file-list'>
                {preview.pipeline.files.map(file => (
                  <li key={file.path}>
                    <button
                      type='button'
                      className={`file${openFile === file.path ? ' active' : ''}`}
                      onClick={() =>
                        setOpenFile(openFile === file.path ? null : file.path)
                      }>
                      {file.path}
                    </button>
                  </li>
                ))}
              </ul>
              <pre className='file-view'>
                <code>
                  {openFile
                    ? preview.pipeline.files.find(f => f.path === openFile)
                        ?.contents
                    : 'Select a file to preview its contents.'}
                </code>
              </pre>
            </section>
          </>
        )}
      </main>

      <footer className='footer'>
        The playground processes tokens in this browser tab and sends no token
        data to a server. It uses{' '}
        <a
          href='https://github.com/marklearst/primitree'
          target='_blank'
          rel='noreferrer'>
          @primitree
        </a>
        .
      </footer>
    </div>
  )
}
