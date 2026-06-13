import Image from 'next/image'
import Link from 'next/link'
import wordmark from '@/public/figmavars.svg'
import { cn } from '@/lib/cn'

const sizes = {
  sm: 'h-[22px]',
  md: 'h-[28px]',
  lg: 'h-[36px] sm:h-[40px]',
  xl: 'h-[44px] sm:h-[52px] md:h-[56px]',
} as const

export function BrandLogo({
  size = 'md',
  linked = false,
  className,
}: {
  size?: keyof typeof sizes
  linked?: boolean
  className?: string
}) {
  const inner = (
    <Image
      src={wordmark}
      alt='FigmaVars'
      className={cn('w-auto', sizes[size], className)}
      priority
    />
  )

  if (linked) {
    return (
      <Link
        href='/'
        className='brand-logo-link inline-flex transition-opacity'>
        {inner}
      </Link>
    )
  }

  return inner
}
