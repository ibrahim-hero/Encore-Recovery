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
      {/* Desktop sidebar */}
      <aside className="print-hidden sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink px-4 py-6 md:flex">
        <Link href="/" aria-label="Encore Recovery home" className="px-2">
          <Wordmark tone="light" />
        </Link>
        <nav aria-label="Primary" className="mt-10 flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors',
                active === item.href
                  ? 'bg-surface/12 text-surface'
                  : 'text-surface/65 hover:bg-surface/8 hover:text-surface',
              )}
            >
              <item.icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-surface/15 px-2 pt-4">
          <span className="w-fit rounded-sm bg-attention-bg px-2 py-0.5 text-[10px] font-bold tracking-widest text-attention">
            SANDBOX
          </span>
          <p className="text-xs leading-relaxed text-surface/60">No real money moves. Every refund is a PayPal Sandbox read.</p>
        </div>
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
                'flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium',
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
