import type { HistoryEntry } from '../lib/shazam'
import ServiceLinks from './ServiceLinks'

interface Props {
  track: HistoryEntry
  onListenAgain: () => void
}

export default function MatchCard({ track, onListenAgain }: Props) {
  const art = track.artUrl ? (
    <img className="match-art" src={track.artUrl} alt="" />
  ) : (
    <div className="match-art match-art-placeholder" />
  )
  return (
    <div className="glass-card match-card fade-in">
      {track.shazamUrl ? (
        <a href={track.shazamUrl} target="_blank" rel="noreferrer">{art}</a>
      ) : (
        art
      )}
      <div className="match-meta">
        <strong className="match-title">{track.title}</strong>
        <span className="match-artist">{track.artist}</span>
        {track.album && <span className="match-album">{track.album}</span>}
        <div className="match-actions">
          <ServiceLinks track={track} />
          <button type="button" className="text-button" onClick={onListenAgain}>
            Listen again
          </button>
        </div>
      </div>
    </div>
  )
}
