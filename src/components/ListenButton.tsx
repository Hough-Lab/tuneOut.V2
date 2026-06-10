interface Props {
  phase: 'idle' | 'listening' | 'no-match' | 'error'
  elapsed: number
  onClick: () => void
}

const LABELS: Record<Props['phase'], string> = {
  idle: 'Tap to identify',
  listening: 'Listening',
  'no-match': 'Try again',
  error: 'Try again',
}

export default function ListenButton({ phase, elapsed, onClick }: Props) {
  const listening = phase === 'listening'
  return (
    <button
      type="button"
      className={`listen-button${listening ? ' listening' : ''}`}
      onClick={onClick}
      disabled={listening}
    >
      <span className="listen-dot" />
      {LABELS[phase]}
      {listening && <span>{elapsed.toFixed(0)}s</span>}
    </button>
  )
}
