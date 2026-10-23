import { useState } from 'react'
import type { HistoryEntry } from '../lib/shazam'
import ServiceLinks from './ServiceLinks'

interface Props {
  entries: HistoryEntry[]
  onRemove: (id: string) => void
  onClear: () => void
}

function relativeTime(epochMs: number): string {
  const seconds = Math.floor((Date.now() - epochMs) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(epochMs).toLocaleDateString()
}

export default function HistoryList({ entries, onRemove, onClear }: Props) {
  const [confirmingClear, setConfirmingClear] = useState(false)

  if (entries.length === 0) {
    return <p className="history-empty">Identified tracks will appear here.</p>
  }

  return (
    <section className="history">
      <header className="history-header">
        <h2>History</h2>
        {confirmingClear ? (
          <span>
            <button type="button" className="text-button danger" onClick={onClear}>
              Clear all?
            </button>
            <button type="button" className="text-button" onClick={() => setConfirmingClear(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="text-button" onClick={() => setConfirmingClear(true)}>
            Clear
          </button>
        )}
      </header>
      <ul className="history-list">
        {entries.map((entry) => (
          <li key={entry.id} className="history-row glass-card">
            {entry.artUrl ? (
              <img className="history-art" src={entry.artUrl} alt="" loading="lazy" />
            ) : (
              <div className="history-art match-art-placeholder" />
            )}
            <div className="history-meta">
              <span className="history-title" title={entry.title}>{entry.title}</span>
              <span className="history-artist" title={entry.artist}>
                {entry.artist} · {relativeTime(entry.foundAt)}
              </span>
            </div>
            <ServiceLinks track={entry} />
            <button
              type="button"
              className="text-button history-remove"
              title="Remove"
              onClick={() => onRemove(entry.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
