import type { HistoryEntry } from './shazam/types'

const KEY = 'tuneout:history'
export const MAX_ENTRIES = 200

export function getHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(entries: HistoryEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries))
}

export function addEntry(entry: HistoryEntry): HistoryEntry[] {
  const entries = [entry, ...getHistory()].slice(0, MAX_ENTRIES)
  save(entries)
  return entries
}

export function removeEntry(id: string): HistoryEntry[] {
  const entries = getHistory().filter((e) => e.id !== id)
  save(entries)
  return entries
}

export function clearHistory(): HistoryEntry[] {
  save([])
  return []
}
