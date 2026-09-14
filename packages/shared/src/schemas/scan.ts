import { z } from 'zod'

/**
 * What a scan reports when it finishes: the agent's return value and, as JSON over the runtime's
 * event stream, what the web app reads. `failed` counts threads whose pipeline threw. The scan
 * carries on, so the run can finish with the ledger missing what those threads held; a thread that
 * threw after its loop reached the ledger is counted in both `created` and here, so `created` never
 * reports fewer loops than a person can see. A runtime deployed before the count sends no `failed`,
 * which reads as none.
 */
export const ScanSummary = z.object({
  threads: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative().default(0),
  byStatus: z.record(z.string(), z.number()).default({}),
})
export type ScanSummary = z.infer<typeof ScanSummary>
