import { buildRecognizeUrl, buildRecognizePayload, SHAZAM_HEADERS } from './lib/shazam/recognize'

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'recognize') return
  ;(async () => {
    const res = await fetch(buildRecognizeUrl(), {
      method: 'POST',
      headers: SHAZAM_HEADERS,
      body: JSON.stringify(buildRecognizePayload(msg.uri, msg.samplems)),
    })
    if (!res.ok) throw new Error(`Shazam responded ${res.status}`)
    return res.json()
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: e instanceof Error ? e.message : String(e) }))
  return true // keep the message channel open for the async response
})
