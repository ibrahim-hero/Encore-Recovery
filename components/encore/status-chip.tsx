import { CheckCircle2, AlertTriangle, XCircle, Clock, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FactTone } from '@/lib/fixtures'

// Status is always text + icon/shape, never color alone (plan section 22).
const toneStyles: Record<FactTone | 'info', string> = {
  confirmed: 'bg-confirmed-bg text-confirmed',
  attention: 'bg-attention-bg text-attention',
  failure: 'bg-failure-bg text-failure',
  neutral: 'bg-surface-subdued text-ink-body',
  info: 'bg-surface-subdued text-link',
}

const toneIcons = {
  confirmed: CheckCircle2,
  attention: Clock,
  failure: XCircle,
  neutral: Info,
  info: AlertTriangle,
}

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: FactTone | 'info'
  children: React.ReactNode
  className?: string
}) {
  const Icon = toneIcons[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        toneStyles[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  )
}
