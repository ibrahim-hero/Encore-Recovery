import { after } from 'next/server'
import { drainJobs } from '@/lib/jobs/drain'

/** Drain this workspace's due jobs after the response is sent (preview has no long-running worker). */
export function kickWorker(workspaceId: string): void {
  after(async () => {
    try {
      await drainJobs({ workspaceId, max: 5 })
    } catch (err) {
      console.error('[encore] background drain failed', err)
    }
  })
}
