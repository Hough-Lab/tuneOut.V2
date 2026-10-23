import type { Track } from './shazam/types'

const q = (t: Pick<Track, 'title' | 'artist'>) => encodeURIComponent(`${t.artist} ${t.title}`)

export const youtubeUrl = (t: Pick<Track, 'title' | 'artist'>) =>
  `https://www.youtube.com/results?search_query=${q(t)}`

export const discogsUrl = (t: Pick<Track, 'title' | 'artist'>) =>
  `https://www.discogs.com/search/?q=${q(t)}&type=release`

export const spotifyUrl = (t: Pick<Track, 'title' | 'artist' | 'spotifyUrl'>) =>
  t.spotifyUrl ?? `https://open.spotify.com/search/${q(t)}`
