import { describe, it, expect } from 'vitest'
import { buildRecognizeUrl, buildRecognizePayload, parseTrack } from './recognize'

const sampleResponse = {
  matches: [{ id: '123', offset: 10 }],
  track: {
    key: '123',
    title: 'Midnight City',
    subtitle: 'M83',
    isrc: 'FR6V81162797',
    url: 'https://www.shazam.com/track/123/midnight-city',
    images: { coverart: 'https://is1-ssl.mzstatic.com/cover.jpg' },
    sections: [
      { type: 'SONG', metadata: [{ title: 'Album', text: "Hurry Up, We're Dreaming" }] },
    ],
    hub: {
      providers: [
        {
          type: 'SPOTIFY',
          actions: [{ type: 'uri', uri: 'spotify:search:Midnight City M83' }],
        },
      ],
    },
  },
}

describe('buildRecognizeUrl', () => {
  it('hits the amp.shazam.com discovery endpoint with two uppercase UUIDs', () => {
    const url = buildRecognizeUrl()
    expect(url).toMatch(
      /^https:\/\/amp\.shazam\.com\/discovery\/v5\/en\/GB\/iphone\/-\/tag\/[0-9A-F-]{36}\/[0-9A-F-]{36}\?sync=true/,
    )
    expect(url).toContain('shazamapiversion=v3')
  })
})

describe('buildRecognizePayload', () => {
  it('matches ShazamIO Converter.data_search shape', () => {
    const p = buildRecognizePayload('data:audio/vnd.shazam.sig;base64,AAAA', 4000)
    expect(p.signature).toEqual({ uri: 'data:audio/vnd.shazam.sig;base64,AAAA', samplems: 4000 })
    expect(typeof p.timezone).toBe('string')
    expect(typeof p.timestamp).toBe('number')
    expect(p.context).toEqual({})
    expect(p.geolocation).toEqual({})
  })
})

describe('parseTrack', () => {
  it('normalises a match', () => {
    const t = parseTrack(sampleResponse)
    expect(t).toEqual({
      title: 'Midnight City',
      artist: 'M83',
      album: "Hurry Up, We're Dreaming",
      artUrl: 'https://is1-ssl.mzstatic.com/cover.jpg',
      isrc: 'FR6V81162797',
      shazamUrl: 'https://www.shazam.com/track/123/midnight-city',
      spotifyUrl: 'https://open.spotify.com/search/Midnight%20City%20M83',
    })
  })
  it('returns null when there are no matches', () => {
    expect(parseTrack({ matches: [] })).toBeNull()
    expect(parseTrack({})).toBeNull()
  })
  it('survives missing optional fields', () => {
    const t = parseTrack({ matches: [{}], track: { title: 'X', subtitle: 'Y' } })
    expect(t).toEqual({
      title: 'X', artist: 'Y', album: undefined, artUrl: undefined,
      isrc: undefined, shazamUrl: undefined, spotifyUrl: undefined,
    })
  })
})
