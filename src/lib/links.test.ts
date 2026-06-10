import { describe, it, expect } from 'vitest'
import { spotifyUrl, youtubeUrl, discogsUrl } from './links'

const track = { title: 'Midnight City', artist: 'M83' }

describe('links', () => {
  it('builds youtube search url', () => {
    expect(youtubeUrl(track)).toBe(
      'https://www.youtube.com/results?search_query=M83%20Midnight%20City',
    )
  })
  it('builds discogs release search url', () => {
    expect(discogsUrl(track)).toBe(
      'https://www.discogs.com/search/?q=M83%20Midnight%20City&type=release',
    )
  })
  it('prefers a direct spotify url from the track when present', () => {
    expect(spotifyUrl({ ...track, spotifyUrl: 'https://open.spotify.com/track/x' })).toBe(
      'https://open.spotify.com/track/x',
    )
  })
  it('falls back to spotify search', () => {
    expect(spotifyUrl(track)).toBe('https://open.spotify.com/search/M83%20Midnight%20City')
  })
})
