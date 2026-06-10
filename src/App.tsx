import { useEffect, useRef, useState } from 'react'
import {
  SignatureGenerator,
  encodeSignatureToUri,
  recognizeSignature,
  type HistoryEntry,
} from './lib/shazam'
import { startCapture, type CaptureSession } from './lib/audio/capture'
import { getHistory, addEntry, removeEntry, clearHistory } from './lib/history'
import Orb from './components/Orb'
import MatchCard from './components/MatchCard'
import HistoryList from './components/HistoryList'

type Phase = 'idle' | 'listening' | 'match' | 'no-match' | 'error'

const ATTEMPT_SECONDS = [4, 8, 12]
const WINDOW_SAMPLES = 8 * 16000 // recognition window: most recent 8s

function waitForDuration(session: CaptureSession, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      if (session.durationSeconds() >= seconds) {
        clearInterval(poll)
        resolve()
      }
    }, 100)
  })
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [track, setTrack] = useState<HistoryEntry | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [history, setHistory] = useState(getHistory)
  const [elapsed, setElapsed] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const sessionRef = useRef<CaptureSession | null>(null)

  useEffect(() => () => sessionRef.current?.stop(), [])

  async function listen() {
    setPhase('listening')
    setTrack(null)
    setErrorMessage('')
    setElapsed(0)

    let session: CaptureSession
    try {
      session = await startCapture()
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not capture tab audio')
      setPhase('error')
      return
    }
    sessionRef.current = session
    setAnalyser(session.analyser)
    const ticker = setInterval(() => setElapsed(session.durationSeconds()), 250)

    try {
      for (const target of ATTEMPT_SECONDS) {
        await waitForDuration(session, target)
        let pcm = session.getPcm()
        if (pcm.length > WINDOW_SAMPLES) pcm = pcm.subarray(pcm.length - WINDOW_SAMPLES)
        const generator = new SignatureGenerator()
        generator.maxTimeSeconds = 8
        generator.feedInput(pcm)
        const signature = generator.getNextSignature()
        if (!signature) continue
        const samplems = Math.round((signature.numberSamples / 16000) * 1000)
        const found = await recognizeSignature(encodeSignatureToUri(signature), samplems)
        if (found) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          const entry: HistoryEntry = {
            ...found,
            id: crypto.randomUUID(),
            foundAt: Date.now(),
            tabTitle: tab?.title,
            tabUrl: tab?.url,
          }
          setHistory(addEntry(entry))
          setTrack(entry)
          setPhase('match')
          return
        }
      }
      setPhase('no-match')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Recognition failed')
      setPhase('error')
    } finally {
      clearInterval(ticker)
      session.stop()
      sessionRef.current = null
      setAnalyser(null)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">tuneOut</span>
      </header>

      <div
        className={`stage${phase !== 'listening' ? ' clickable' : ''}`}
        onClick={phase !== 'listening' ? listen : undefined}
        role="button"
        aria-label="Identify the music playing in this tab"
      >
        <Orb phase={phase} analyser={analyser} />
        <span className={`orb-label${phase === 'listening' ? ' listening' : ''}`}>
          {phase === 'idle' && 'tap to identify'}
          {phase === 'listening' && `listening · ${elapsed.toFixed(0)}s`}
          {(phase === 'no-match' || phase === 'error') && 'tap to try again'}
          {phase === 'match' && 'tap to identify'}
        </span>
      </div>

      {phase === 'match' && track ? (
        <MatchCard track={track} onListenAgain={listen} />
      ) : (
        <p className={`status-text${phase === 'error' ? ' error' : ''}`}>
          {phase === 'error' && (errorMessage || 'Something went wrong')}
          {phase === 'no-match' && 'No match found — is music playing in this tab?'}
          {phase === 'listening' && 'Identifying tab audio…'}
        </p>
      )}

      <HistoryList
        entries={history}
        onRemove={(id) => setHistory(removeEntry(id))}
        onClear={() => setHistory(clearHistory())}
      />
    </div>
  )
}
