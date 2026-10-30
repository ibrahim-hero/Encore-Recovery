import { hostname } from 'node:os'
import { drainJobs } from '@/lib/jobs/drain'

// Long-running worker for Render (render.yaml "worker" service).
const workerId = `worker-${hostname()}-${process.pid}`
let stopping = false

process.on('SIGTERM', () => {
  stopping = true
})

async function main() {
  console.log(`[encore] worker ${workerId} started`)
  while (!stopping) {
    try {
      const processed = await drainJobs({ workerId, max: 25 })
      if (processed === 0) await new Promise((r) => setTimeout(r, 1000))
    } catch (err) {
      console.error('[encore] worker loop error', err)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
  console.log('[encore] worker stopped')
  process.exit(0)
}

main()
