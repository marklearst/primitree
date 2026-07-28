import Image from 'next/image'
import Link from 'next/link'
import mark from '@/public/primitree-icon.svg'
import { cn } from '@/lib/cn'

const markSizes = {
  sm: 'h-[20px] w-[22px]',
  md: 'h-[24px] w-[27px]',
  lg: 'h-[32px] w-[35px] sm:h-[36px] sm:w-[40px]',
  xl: 'h-[40px] w-[44px] sm:h-[48px] sm:w-[53px] md:h-[52px] md:w-[57px]',
} as const

const textSizes = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl sm:text-[28px]',
  xl: 'text-3xl sm:text-4xl md:text-[44px]',
} as const

export function BrandLogo({
  size = 'md',
  linked = false,
  className,
}: {
  size?: keyof typeof markSizes
  linked?: boolean
  className?: string
}) {
  const inner = (
    <>
      <Image
        src={mark}
        alt=''
        className={cn('pointer-events-none shrink-0', markSizes[size])}
        priority
      />
      <span className={cn('font-semibold tracking-tight', textSizes[size])}>
        Primitree
      </span>
    </>
  )

  if (linked) {
    return (
      <Link
        href='/'
        className={cn(
          'brand-logo-link inline-flex items-center gap-2 transition-opacity',
          className
        )}>
        {inner}
      </Link>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {inner}
    </span>
  )
}
