'use client'

import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'
import { ruleBreaks } from '@/lib/tokens/breaks'
import {
  type BreakId,
  jumpHue,
  liveHue,
  setBreak,
  usePageState,
} from '@/lib/tokens/page-store'

const HUE_SWEEP = 70

/** The hue and theme preference a rule row left behind, so whichever switch
 * turns the rule off puts them back. One record per rule, shared by every
 * switch. */
const restores = new Map<BreakId, { hue: number; preference: string }>()

/** Breaks one rule on this page's tokens, and shows what the break costs: the
 * hue turns so a hard-coded accent stays behind, and the theme flips so a
 * skipped layer stops following it. A break a rule row started restores both,
 * from whichever switch ends it. A break the hero switch started turns the hue
 * and leaves it where the visitor puts it, and leaves the theme alone. */
export function useRuleBreak(id: BreakId, demo = true) {
  const on = usePageState(state => state.breaks.has(id))
  const findings = usePageState(state => state.findings)
  const checking = usePageState(state => state.checking)
  const { theme, setTheme } = useTheme()

  const undo = () => {
    const previous = restores.get(id)
    restores.delete(id)
    setBreak(id, false)
    if (previous === undefined) {
      return
    }
    if (id === 'literal') {
      jumpHue(previous.hue)
    }
    if (id === 'skip') {
      setTheme(previous.preference)
    }
  }
  const undoOnLeave = useRef(undo)
  undoOnLeave.current = undo

  // Leaving the page takes the break and its cost with it, on a link, a reload,
  // or a closed tab, so no other page shows them.
  useEffect(() => {
    const leave = () => {
      if (restores.has(id)) {
        undoOnLeave.current()
      }
    }
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [id])

  const toggle = () => {
    if (on) {
      undo()
      return
    }
    if (demo) {
      restores.set(id, { hue: liveHue(), preference: theme ?? 'system' })
    }
    setBreak(id, true)
    if (id === 'literal') {
      jumpHue(liveHue() + HUE_SWEEP)
    }
    if (id === 'skip' && demo) {
      setTheme('dark')
    }
  }

  return { on, toggle, findings, checking }
}

/** The switch inside a rule row, with the finding the check returned. */
export function RuleSwitch({ id, label }: { id: BreakId; label: string }) {
  const { on, toggle, findings, checking } = useRuleBreak(id)
  const own = findings.filter(finding => finding.ruleId === ruleBreaks[id].code)
  const [first] = own

  return (
    <div className='rule-control'>
      <button
        type='button'
        role='switch'
        className='rule-switch'
        aria-checked={on}
        onClick={toggle}>
        <span
          className='rule-track'
          aria-hidden='true'>
          <span className='rule-thumb' />
        </span>
        {label}
      </button>
      <p
        className='rule-output'
        role='status'>
        {on && first !== undefined ? (
          <code>
            {first.ruleId} {first.path}: {first.message}
            {`\nowners: ${first.owners.length === 0 ? 'none' : first.owners.join(', ')}`}
            {own.length > 1
              ? `\nand ${own.length - 1} more, exit 1`
              : '\nexit 1'}
          </code>
        ) : on && checking ? (
          <code>primitree check</code>
        ) : on ? (
          <code>The check did not load. Reload the page to run it.</code>
        ) : null}
      </p>
    </div>
  )
}
