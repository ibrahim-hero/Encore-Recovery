import { notFound } from 'next/navigation'
import { AppRail } from '@/components/encore/app-rail'
import { CaseWorkspace } from '@/components/encore/case-workspace'
import { getFixtureCase, fixtureCases } from '@/lib/fixtures'

export function generateStaticParams() {
  return fixtureCases.map((c) => ({ id: c.id }))
}

// Deep-linkable case page (plan section 23). A reload restores the same
// persisted case state.
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caseData = getFixtureCase(id)
  if (!caseData) notFound()

  return (
    <div className="min-h-screen md:flex">
      <AppRail active="/recovery" />
      <main className="min-w-0 flex-1">
        <CaseWorkspace caseData={caseData} />
      </main>
    </div>
  )
}
