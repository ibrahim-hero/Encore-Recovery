import { AppRail } from '@/components/encore/app-rail'
import { CaseWorkspace } from '@/components/encore/case-workspace'

// Deep-linkable case page (plan section 23). A reload restores the same
// persisted case state from the API.
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="min-h-screen md:flex">
      <AppRail active="/recovery" />
      <main className="min-w-0 flex-1">
        <CaseWorkspace caseId={id} />
      </main>
    </div>
  )
}
