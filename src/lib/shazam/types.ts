// Mirrors shazamio's enums.py / signature.py data model.
export enum FrequencyBand {
  hz_250_520 = 0,
  hz_520_1450 = 1,
  hz_1450_3500 = 2,
  hz_3500_5500 = 3, // unreachable in legacy mode — kept for fidelity
}

export interface FrequencyPeak {
  fftPassNumber: number
  peakMagnitude: number
  correctedPeakFrequencyBin: number
}

export interface Signature {
  sampleRateHz: number
  numberSamples: number
  bands: Map<FrequencyBand, FrequencyPeak[]>
}

export interface Track {
  title: string
  artist: string
  album?: string
  artUrl?: string
  isrc?: string
  shazamUrl?: string
  spotifyUrl?: string
}

export interface HistoryEntry extends Track {
  id: string
  foundAt: number // epoch ms
  tabTitle?: string
  tabUrl?: string
}
