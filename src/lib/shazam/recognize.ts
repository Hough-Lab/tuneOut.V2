import type { Track } from './types'

// ShazamUrl.SEARCH_FROM_FILE from shazamio misc.py (whitespace cleaned)
export function buildRecognizeUrl(): string {
  const a = crypto.randomUUID().toUpperCase()
  const b = crypto.randomUUID().toUpperCase()
  return (
    `https://amp.shazam.com/discovery/v5/en/GB/iphone/-/tag/${a}/${b}` +
    '?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3' +
    '&sharehub=true&hubv5minorversion=v5.1&hidelb=true&video=v3'
  )
}

// Converter.data_search from shazamio converter.py
export function buildRecognizePayload(uri: string, samplems: number) {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    signature: { uri, samplems },
    timestamp: Date.now(),
    context: {},
    geolocation: {},
  }
}

export const SHAZAM_HEADERS = {
  'X-Shazam-Platform': 'IPHONE',
  'X-Shazam-AppVersion': '14.1.0',
  Accept: '*/*',
  'Content-Type': 'application/json',
}

/** Normalise Shazam's response into our Track, or null for no match. */
export function parseTrack(response: unknown): Track | null {
  const r = response as any
  if (!r?.matches?.length || !r.track) return null
  const track = r.track

  let album: string | undefined
  for (const section of track.sections ?? []) {
    for (const meta of section.metadata ?? []) {
      if (meta.title === 'Album') album = meta.text
    }
  }

  let spotifyUrl: string | undefined
  const spotify = (track.hub?.providers ?? []).find((p: any) => p.type === 'SPOTIFY')
  const spotifyAction = spotify?.actions?.find((a: any) => typeof a.uri === 'string')
  if (spotifyAction?.uri?.startsWith('spotify:search:')) {
    spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(
      spotifyAction.uri.slice('spotify:search:'.length),
    )}`
  } else if (spotifyAction?.uri?.startsWith('https://')) {
    spotifyUrl = spotifyAction.uri
  }

  return {
    title: track.title ?? 'Unknown title',
    artist: track.subtitle ?? 'Unknown artist',
    album,
    artUrl: track.images?.coverart,
    isrc: track.isrc,
    shazamUrl: track.url,
    spotifyUrl,
  }
}

/** Popup-side: ask the background service worker to perform the fetch. */
export async function recognizeSignature(uri: string, samplems: number): Promise<Track | null> {
  const response = await chrome.runtime.sendMessage({ type: 'recognize', uri, samplems })
  if (response?.error) throw new Error(response.error)
  return parseTrack(response)
}
