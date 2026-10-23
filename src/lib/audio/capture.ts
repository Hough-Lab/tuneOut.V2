export interface CaptureSession {
  /** Live analyser for visuals (FFT of the tab audio). */
  analyser: AnalyserNode
  /** All audio captured so far as s16le 16 kHz mono. */
  getPcm(): Int16Array
  durationSeconds(): number
  stop(): void
}

/**
 * Capture the current tab's audio. The AudioContext is created at 16 kHz so
 * Chrome resamples for us — the worklet output is already signature-ready.
 * Audio is routed back to the speakers (tabCapture mutes the tab otherwise).
 */
export async function startCapture(): Promise<CaptureSession> {
  const stream = await new Promise<MediaStream>((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (s) => {
      if (chrome.runtime.lastError || !s) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Could not capture tab audio'))
      } else {
        resolve(s)
      }
    })
  })

  const ctx = new AudioContext({ sampleRate: 16000 })
  await ctx.audioWorklet.addModule('/pcm-worklet.js')

  const source = ctx.createMediaStreamSource(stream)
  const worklet = new AudioWorkletNode(ctx, 'pcm-collector')
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.7

  const chunks: Float32Array[] = []
  let totalSamples = 0
  worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
    chunks.push(e.data)
    totalSamples += e.data.length
  }

  source.connect(worklet)
  source.connect(analyser)
  source.connect(ctx.destination) // keep the tab audible while capturing

  let stopped = false
  return {
    analyser,
    durationSeconds: () => totalSamples / 16000,
    getPcm() {
      const pcm = new Int16Array(totalSamples)
      let offset = 0
      for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++) {
          const v = Math.round(chunk[i] * 32768)
          pcm[offset + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v
        }
        offset += chunk.length
      }
      return pcm
    },
    stop() {
      if (stopped) return
      stopped = true
      worklet.port.onmessage = null
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    },
  }
}
