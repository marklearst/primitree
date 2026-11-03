'use client'

import { type ChangeEvent, useState, useSyncExternalStore } from 'react'
import { jumpHue, pageStore, retune } from '@/lib/tokens/page-store'
import { siteTuning } from '@/lib/tokens/signal-zones'
import './theme-lab.css'

interface LabState {
  readonly hue: number
  readonly brandChroma: number
  readonly neutralTint: number
  readonly corners: 'tight' | 'soft' | 'round'
}

const CORNERS = {
  tight: { control: '6px', card: '10px' },
  soft: { control: '10px', card: '14px' },
  round: { control: '999px', card: '20px' },
} as const

const SLIDERS = [
  { key: 'hue', label: 'Hue', min: 0, max: 359, step: 1 },
  { key: 'brandChroma', label: 'Brand chroma', min: 0.5, max: 1.2, step: 0.01 },
  { key: 'neutralTint', label: 'Neutral tint', min: 0, max: 4, step: 0.05 },
] as const

const SAVED_KEY = 'primitree-lab-saved'

const readSaved = (): LabState[] => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** Every taste decision on the homepage's theme, as a knob. Hue, chroma, and tint
 * write tokens/theme.config.json and rebuild the tokens. Corners preview here, and
 * the panel prints the token edit that ships them. */
export function ThemeLab({ initial }: { initial: { hue: number } }) {
  const hue = useSyncExternalStore(
    pageStore.subscribe,
    () => pageStore.get().hue,
    () => initial.hue
  )
  const [lab, setLab] = useState<LabState>({
    hue: initial.hue,
    ...siteTuning,
    corners: 'tight',
  })
  const [saved, setSaved] = useState<LabState[]>(readSaved)
  const [status, setStatus] = useState('')

  const apply = (next: LabState) => {
    setLab(next)
    const { style } = document.documentElement
    jumpHue(next.hue)
    retune({ brandChroma: next.brandChroma, neutralTint: next.neutralTint })
    style.setProperty(
      '--semantic-radius-control',
      CORNERS[next.corners].control
    )
    style.setProperty('--semantic-radius-panel', CORNERS[next.corners].card)
  }

  const onSlider =
    (key: (typeof SLIDERS)[number]['key']) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      apply({ ...lab, [key]: Number(event.target.value) })
    }

  const surprise = () => {
    apply({
      ...lab,
      hue: Math.floor(Math.random() * 360),
      brandChroma: 0.7 + Math.random() * 0.5,
      neutralTint: Math.random() * 3,
    })
  }

  const save = async () => {
    const keeper = { ...lab, hue }
    const next = [keeper, ...saved]
    setSaved(next)
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    } catch {
      // The file on disk still holds the keeper.
    }
    const json = JSON.stringify(keeper, null, 2)
    await navigator.clipboard.writeText(json).catch(() => {})
    const response = await fetch('/lab/theme/save', {
      method: 'POST',
      body: json,
    })
    const result = await response.json()
    setStatus(
      result.built
        ? `Saved to ${result.path} and rebuilt the tokens. Copied the JSON.`
        : `Saved to ${result.path}, and the build failed: ${result.output}`
    )
  }

  const edits = [
    lab.corners === 'tight'
      ? null
      : `semantic.radius.control and .panel: ${CORNERS[lab.corners].control}, ${CORNERS[lab.corners].card}`,
  ].filter(edit => edit !== null)

  return (
    <aside
      className='lab'
      aria-label='Theme lab'>
      <p className='lab-seed'>
        hue {hue} · chroma {lab.brandChroma.toFixed(2)} · tint{' '}
        {lab.neutralTint.toFixed(2)}
      </p>
      {SLIDERS.map(slider => (
        <label
          key={slider.key}
          className='lab-knob'>
          <span>{slider.label}</span>
          <input
            type='range'
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={slider.key === 'hue' ? hue : lab[slider.key]}
            onChange={onSlider(slider.key)}
          />
        </label>
      ))}
      <label className='lab-knob'>
        <span>Corners</span>
        <select
          value={lab.corners}
          onChange={event =>
            apply({
              ...lab,
              corners: event.target.value as LabState['corners'],
            })
          }>
          <option value='tight'>Tight</option>
          <option value='soft'>Soft</option>
          <option value='round'>Round</option>
        </select>
      </label>
      <div className='lab-actions'>
        <button
          type='button'
          onClick={surprise}>
          Surprise me
        </button>
        <button
          type='button'
          onClick={save}>
          Save
        </button>
      </div>
      {status === '' ? null : <p className='lab-status'>{status}</p>}
      {edits.length === 0 ? null : (
        <ul className='lab-edits'>
          {edits.map(edit => (
            <li key={edit}>{edit}</li>
          ))}
        </ul>
      )}
      {saved.length === 0 ? null : (
        <ol className='lab-saved'>
          {saved.map(item => (
            <li key={JSON.stringify(item)}>
              <button
                type='button'
                onClick={() => apply(item)}>
                {item.hue} · {item.brandChroma.toFixed(2)} ·{' '}
                {item.neutralTint.toFixed(2)}
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
