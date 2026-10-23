"""Generate byte-exact ground-truth fixtures from the ShazamIO Python reference."""
import sys, os, json, base64, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy
from _ref.algorithm import SignatureGenerator
from _ref.signature import DecodedMessage, FrequencyPeak
from _ref.enums import FrequencyBand

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures')

# --- Fixture 1: hand-built peaks -> encoded data URI (exercises 0xff escape too) ---
msg = DecodedMessage()
msg.sample_rate_hz = 16000
msg.number_samples = 48000
msg.frequency_band_to_sound_peaks = {
    FrequencyBand.hz_250_520: [
        FrequencyPeak(46, 7000, 2458, 16000),
        FrequencyPeak(350, 6500, 2500, 16000),  # gap >= 255 -> 0xff escape path
    ],
    FrequencyBand.hz_1450_3500: [FrequencyPeak(100, 7100, 16384, 16000)],
}
with open(os.path.join(OUT, 'signature-encode.json'), 'w') as f:
    json.dump({
        'sampleRateHz': 16000,
        'numberSamples': 48000,
        'bands': {'0': [[46, 7000, 2458], [350, 6500, 2500]], '2': [[100, 7100, 16384]]},
        'uri': msg.encode_to_uri(),
    }, f, indent=1)

# --- Fixture 2: deterministic 4s PCM -> full pipeline signature URI ---
rate, dur = 16000, 4
rng = numpy.random.default_rng(42)
t = numpy.arange(rate * dur) / rate
sig = (
    0.35 * numpy.sin(2 * math.pi * 440 * t)
    + 0.25 * numpy.sin(2 * math.pi * (1000 + 200 * numpy.sin(2 * math.pi * 0.7 * t)) * t)
    + 0.2 * numpy.sin(2 * math.pi * 2500 * t) * (0.5 + 0.5 * numpy.sin(2 * math.pi * 1.3 * t))
    + 0.15 * rng.standard_normal(rate * dur)
)
pcm = numpy.clip(sig * 8000, -32768, 32767).astype('<i2')

gen = SignatureGenerator()
gen.feed_input(pcm.tolist())
gen.MAX_TIME_SECONDS = 8
s = gen.get_next_signature()
total_peaks = sum(len(p) for p in s.frequency_band_to_sound_peaks.values())
assert total_peaks > 10, f'fixture too trivial: {total_peaks} peaks'
with open(os.path.join(OUT, 'signature-pipeline.json'), 'w') as f:
    json.dump({
        'pcmBase64': base64.b64encode(pcm.tobytes()).decode(),
        'numberSamples': s.number_samples,
        'totalPeaks': total_peaks,
        'uri': s.encode_to_uri(),
    }, f, indent=1)
print(f'fixtures written ({total_peaks} peaks in pipeline fixture)')
