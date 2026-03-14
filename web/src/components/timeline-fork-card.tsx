import type { TimelineForkCardItem } from '@pilot/core/types.js'
import { BranchLifecycleBlock } from '~/components/branch-lifecycle-block'

interface TimelineForkCardProps {
  item: TimelineForkCardItem
  jobId: string
}

export function TimelineForkCard({ item, jobId }: TimelineForkCardProps) {
  return <BranchLifecycleBlock item={item} jobId={jobId} />
}
