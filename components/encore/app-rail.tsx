import Link from 'next/link'
import { Inbox, ReceiptText, FlaskConical } from 'lucide-react'
import { Wordmark } from './wordmark'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/recovery', label: 'Recovery', icon: Inbox },
  { href: '/receipts', label: 'Receipts', icon: ReceiptText },
  { href: '/demo', label: 'Demo', icon: FlaskConical },
]

// Narrow application rail on desktop; compact top navigation below 768px
// (plan sections 20 and 22).
export function AppRail({ active }: { active?: string }) {
  return (
    <>
      {/* Desktop rail */}
      <aside className="print-hidden sticky top-0 hidden h-screen w-16 shrink-0 flex-col items-center border-r border-line bg-surface py-4 md:flex">
        <Link href="/" aria-label="Encore Recovery home" className="mb-8">
          <Wordmark compact />
        </Link>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? 'page' : undefined}
              className={cn(
                'flex min-h-11 w-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-colors',
                active === item.href
                  ? 'bg-surface-subdued text-ink'
                  : 'text-ink-muted hover:bg-surface-subdued hover:text-ink',
              )}
            >
              <item.icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="mt-auto rounded-full bg-attention-bg px-2 py-1 text-[9px] font-semibold tracking-wide text-attention">
          SANDBOX
        </span>
      </aside>

      {/* Mobile top bar */}
      <header className="print-hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 md:hidden">
        <Link href="/" aria-label="Encore Recovery home">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium',
                active === item.href ? 'bg-surface-subdued text-ink' : 'text-ink-muted',
              )}
            >
              <item.icon aria-hidden className="size-4" />
              <span className="sr-only min-[400px]:not-sr-only">{item.label}</span>
            </Link>
          ))}
        </nav>
      </header>
    </>
  )
}
