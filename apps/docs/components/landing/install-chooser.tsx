'use client'

import { useRef } from 'react'
import { CopyButton } from '@/components/landing/copy-button'
import { usePackageManager } from '@/components/landing/use-package-manager'
import { cn } from '@/lib/cn'
import {
  installCommands,
  type PackageManager,
  packageManagerNames,
  packageManagers,
} from '@/lib/landing/package-managers'
import { inkReads } from '@/lib/tokens/bind'

/** The install command for the visitor's package manager, with a copy
 * control. Every chooser on the page shares one choice, the browser keeps it
 * for the next visit, and the clipboard receives the command on screen,
 * character for character. */
export function InstallChooser({
  id,
  className,
}: {
  id: string
  className?: string
}) {
  const [manager, choose] = usePackageManager()
  const commands = useRef<Partial<Record<PackageManager, HTMLElement>>>({})
  // The copy control selects whichever command is on screen at click time.
  const visible = {
    get current() {
      return commands.current[manager] ?? null
    },
  }

  return (
    <div className={cn('install', className)}>
      <fieldset className='install-managers'>
        <legend className='sr-only'>Package manager</legend>
        {packageManagers.map(item => (
          <label
            key={item}
            className='install-manager'
            data-pm={item}>
            <input
              type='radio'
              name={`${id}-manager`}
              value={item}
              className='install-manager-input'
              checked={manager === item}
              onChange={() => choose(item)}
            />
            {packageManagerNames[item]}
          </label>
        ))}
      </fieldset>
      <div
        className='install-command'
        {...inkReads}>
        <code className='install-code'>
          <span
            className='install-prompt'
            aria-hidden='true'>
            $
          </span>
          {packageManagers.map(item => (
            <span
              key={item}
              ref={element => {
                if (element !== null) {
                  commands.current[item] = element
                }
              }}
              className='pm-only install-text'
              data-pm={item}>
              {installCommands[item]}
            </span>
          ))}
        </code>
        <CopyButton
          text={installCommands[manager]}
          target={visible}
        />
      </div>
    </div>
  )
}
