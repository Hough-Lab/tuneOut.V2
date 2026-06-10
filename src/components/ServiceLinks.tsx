import { spotifyUrl, youtubeUrl, discogsUrl } from '../lib/links'
import type { Track } from '../lib/shazam'

const ICONS = {
  spotify: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.3 14.5a.62.62 0 0 1-.86.2c-2.36-1.44-5.33-1.76-8.83-.96a.62.62 0 1 1-.28-1.21c3.83-.88 7.11-.5 9.76 1.11.3.18.39.57.21.86Zm1.2-2.72a.78.78 0 0 1-1.07.26c-2.7-1.66-6.82-2.14-10.01-1.17a.78.78 0 1 1-.45-1.49c3.65-1.11 8.19-.57 11.27 1.33.37.22.49.7.26 1.07Zm.1-2.83C14.4 9.03 9.05 8.85 5.96 9.79a.93.93 0 1 1-.54-1.79c3.55-1.08 9.44-.87 13.16 1.34a.93.93 0 0 1-.95 1.6Z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.5 12 4.5 12 4.5s-7 0-8.9.6A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.6 8.9.6 8.9.6s7 0 8.9-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.2ZM9.75 15.02V8.98L15.5 12l-5.75 3.02Z" />
    </svg>
  ),
  discogs: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  ),
}

export default function ServiceLinks({ track }: { track: Track }) {
  const links = [
    // Discogs brand mark is black; render white on the dark theme.
    { name: 'Discogs', href: discogsUrl(track), icon: ICONS.discogs, color: '#ffffff' },
    { name: 'YouTube', href: youtubeUrl(track), icon: ICONS.youtube, color: '#ff0000' },
    { name: 'Spotify', href: spotifyUrl(track), icon: ICONS.spotify, color: '#1db954' },
  ]
  return (
    <span className="service-links">
      {links.map((l) => (
        <a
          key={l.name}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          title={`Open on ${l.name}`}
          style={{ color: l.color }}
        >
          {l.icon}
        </a>
      ))}
    </span>
  )
}
