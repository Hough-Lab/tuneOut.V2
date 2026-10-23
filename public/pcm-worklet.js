// Collects mono Float32 PCM chunks and posts them to the main thread.
class PcmCollector extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0]
    if (channels && channels.length > 0 && channels[0].length > 0) {
      const len = channels[0].length
      const mono = new Float32Array(len)
      for (let c = 0; c < channels.length; c++) {
        const ch = channels[c]
        for (let i = 0; i < len; i++) mono[i] += ch[i] / channels.length
      }
      this.port.postMessage(mono, [mono.buffer])
    }
    return true
  }
}
registerProcessor('pcm-collector', PcmCollector)
