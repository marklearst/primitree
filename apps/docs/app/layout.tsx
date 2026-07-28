import { RootProvider } from 'fumadocs-ui/provider/next'
import { Geist_Mono, Inter } from 'next/font/google'
import { siteMetadata } from '@/lib/discovery'
import './global.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata = siteMetadata

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang='en'
      className={`${inter.variable} ${geistMono.variable}`}
      suppressHydrationWarning>
      <body className='flex min-h-screen flex-col bg-primitree-bg font-sans text-primitree-text antialiased'>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
