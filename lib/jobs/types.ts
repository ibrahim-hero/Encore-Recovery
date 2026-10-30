export type JobResult = { done: true } | { retryInMs: number; note?: string }
