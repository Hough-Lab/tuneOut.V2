import type { HistoryEntry } from '../lib/shazam'
export default function HistoryList(_: {
  entries: HistoryEntry[]
  onRemove: (id: string) => void
  onClear: () => void
}) {
  return null
}
