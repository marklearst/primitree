import { useCallback, useMemo, useState } from 'react'
import {
  analyze,
  downloadBlob,
  resolvePreview,
  zipPipeline,
  type Preview,
} from './lib/pipeline'
import sampleVariables from './sample-variables.json'
import wordmark from './assets/figmavars.svg'

type Tab = 'tokens' | 'files'

export default function App() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Tab>('tokens')
  const [openFile, setOpenFile] = useState<string | null>(null)

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
            src={wordmark}
            alt='FigmaVars'
            className='brand-logo'
          />
          <span className='brand-sub'>Playground</span>
        </div>
        <nav className='header-links'>
          <a
            href='https://github.com/marklearst/figma-vars-hooks'
            target='_blank'
            rel='noreferrer'>
            GitHub
          </a>
          <a
            href='https://www.npmjs.com/package/@figma-vars/cli'
            target='_blank'
            rel='noreferrer'>
            npm
          </a>
        </nav>
      </header>

      {!preview && (
        <main className='landing'>
          <h1>
            Drop your Figma variables.
            <br />
            <em>Leave with a token pipeline.</em>
          </h1>
          <p className='lede'>
            DTCG 2025.10 tokens, a Resolver for your modes, CSS custom
            properties, a Tailwind v4 theme, TypeScript types, and CI config —
            generated in your browser. <strong>Nothing is uploaded.</strong>
          </p>

          <div
            className={`dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={event => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}>
            <p className='dz-title'>Drag a variables.json here</p>
            <p className='dz-sub'>
              from <code>figma-vars export</code>, TokensBrücke, or any
              variables plugin
            </p>
            <div className='dz-actions'>
              <label className='button primary'>
                Choose file
                <input
                  type='file'
                  accept='.json,application/json'
                  onChange={onPick}
                  hidden
                />
              </label>
              <button
                type='button'
                className='button ghost'
                onClick={() =>
                  load(JSON.stringify(sampleVariables), 'sample-variables.json')
                }>
                Try the sample
              </button>
            </div>
          </div>

          {error && <div className='error'>{error}</div>}

          <div className='steps'>
            <div className='step'>
              <span className='step-n'>1</span>
              Export variables from Figma (any plan — plugins work)
            </div>
            <div className='step'>
              <span className='step-n'>2</span>
              Drop the JSON here, preview every collection and mode
            </div>
            <div className='step'>
              <span className='step-n'>3</span>
              Download the zip, commit it, ship tokens
            </div>
          </div>
        </main>
      )}

      {preview && (
        <main className='report'>
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
                <div
                  className='axis'
                  key={axis}>
                  <span className='axis-name'>{axis}</span>
                  <div className='axis-options'>
                    {contexts.map(context => (
                      <button
                        type='button'
                        key={context}
                        className={`chip${selection[axis] === context ? ' active' : ''}`}
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
          )}

          <nav className='tabs'>
            <button
              type='button'
              className={`tab${tab === 'tokens' ? ' active' : ''}`}
              onClick={() => setTab('tokens')}>
              Tokens
            </button>
            <button
              type='button'
              className={`tab${tab === 'files' ? ' active' : ''}`}
              onClick={() => setTab('files')}>
              Generated files
            </button>
          </nav>

          {tab === 'tokens' && (
            <>
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
                  <h3>Everything else</h3>
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
              )}
            </>
          )}

          {tab === 'files' && (
            <section className='files'>
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
          )}
        </main>
      )}

      <footer className='footer'>
        Runs 100% client-side — your tokens never leave this tab. Built with{' '}
        <a
          href='https://github.com/marklearst/figma-vars-hooks'
          target='_blank'
          rel='noreferrer'>
          @figma-vars
        </a>
        .
      </footer>
    </div>
  )
}
