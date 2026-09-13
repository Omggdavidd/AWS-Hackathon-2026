import { LoopDetail } from '@/components/loop-detail'

export const dynamic = 'force-dynamic'

/** The full page for a loop, for deep links from the bell, the activity feed and the outside world. */
export default async function LoopPage({ params }: PageProps<'/loops/[id]'>) {
  const { id } = await params
  return <LoopDetail id={id} mode="page" />
}
