import { z } from 'zod'

/**
 * What a scan reports when it finishes, as the runtime sends it to the web app. `failed` counts
 * threads whose pipeline threw: the scan carries on, so a run can finish while the ledger is
 * missing what those threads held. A runtime that predates the count sends nothing, which reads
 * as none failed.
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
