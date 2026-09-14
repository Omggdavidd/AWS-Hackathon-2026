import type { ScanSummary } from '@openloop/shared'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The one line a person reads after a scan. A scan that lost threads finished without reading the
 * whole inbox, so it says which part it could not read instead of reporting a clean run (#166).
 */
export function formatScanStatus(summary: ScanSummary): string {
  const found = summary.created + summary.updated
  const tracked = `${plural(found, 'thing')} worth tracking`
  if (summary.failed === 0) return `${tracked} across ${plural(summary.threads, 'thread')}.`
  const read = Math.max(summary.threads - summary.failed, 0)
  if (read === 0 && found === 0)
    return 'None of your mail could be read. Nothing was tracked, so run the scan again.'
  return `${tracked} across ${read} of ${plural(summary.threads, 'thread')}. ${plural(summary.failed, 'thread')} could not be read, so anything in ${summary.failed === 1 ? 'it' : 'them'} is missing from your list.`
}

/** The same scan as the closing line of the progress log. */
export function formatScanCounts(summary: ScanSummary): string {
  const counts = `${summary.created} new, ${summary.updated} updated, ${summary.skipped} skipped`
  return summary.failed === 0 ? `${counts}.` : `${counts}, ${summary.failed} could not be read.`
}
