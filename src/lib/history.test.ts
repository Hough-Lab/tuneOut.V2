import { describe, it, expect, beforeEach } from 'vitest'
import { getHistory, addEntry, removeEntry, clearHistory, MAX_ENTRIES } from './history'
import type { HistoryEntry } from './shazam/types'

const entry = (id: string): HistoryEntry => ({
  id, title: `t${id}`, artist: 'a', foundAt: Number(id),
})

describe('history', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty', () => {
    expect(getHistory()).toEqual([])
  })
  it('adds newest first and persists', () => {
    addEntry(entry('1'))
    addEntry(entry('2'))
    expect(getHistory().map((e) => e.id)).toEqual(['2', '1'])
  })
  it('caps at MAX_ENTRIES with FIFO eviction', () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) addEntry(entry(String(i)))
    const h = getHistory()
    expect(h.length).toBe(MAX_ENTRIES)
    expect(h[0].id).toBe(String(MAX_ENTRIES + 4)) // newest kept
  })
  it('removes by id and clears all', () => {
    addEntry(entry('1'))
    addEntry(entry('2'))
    removeEntry('1')
    expect(getHistory().map((e) => e.id)).toEqual(['2'])
    clearHistory()
    expect(getHistory()).toEqual([])
  })
  it('returns [] on corrupt storage instead of throwing', () => {
    localStorage.setItem('tuneout:history', '{not json')
    expect(getHistory()).toEqual([])
  })
})
