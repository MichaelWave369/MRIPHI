import { physicalSample } from './edf';
import type { EdfChannel, EdfRecording } from './edf';

/**
 * R5 educational spectral analysis of ONE continuous EDF signal channel.
 * Does not identify physiological signal source or make diagnostic inferences.
 *
 * Welch PSD: Hann window; subtract per-segment mean; 50% overlap;
 * one-sided PSD normalized by sampling frequency and sum(window^2).
 * Band powers integrate PSD bins; band edges use half-open [low, high).
 */
export const EEG_BANDS = [
  { key: 'delta', name: 'Delta', lowHz: 0.5, highHz: 4 },
  { key: 'theta', name: 'Theta', lowHz: 4, highHz: 8 },
  { key: 'alpha', name: 'Alpha', lowHz: 8, highHz: 13 },
  { key: 'beta', name: 'Beta', lowHz: 13, highHz: 30 },
  { key: 'gamma', name: 'Gamma', lowHz: 30, highHz: 45 },
] as const;

export type BandPower = {
  key: typeof EEG_BANDS[number]['key'];
  name: string;
  lowHz: number;
  highHz: number;
  /** Null when the band exceeds the channel's Nyquist frequency. */
  power: number | null;
  relativePercent: number | null;
  available: boolean;
};

export type EegAnalysis = {
  channelIndex: number;
  sampleRateHz: number;
  unit: string;
  provenance: 'local' | 'synthetic';
  startSeconds: number;
  durationSeconds: number;
  analyzedSamples: number;
  fftSize: number;
  welchSegments: number;
  frequencyResolutionHz: number;
  frequenciesHz: number[];
  psd: number[];
  bands: BandPower[];
  mean: number;
  acRms: number;
  peakToPeak: number;
  nearRailPercent: number;
  unchangedAdjacentPercent: number;
  warnings: string[];
};

const MAX_ANALYSIS_SAMPLES = 131072;
const MAX_FFT_SIZE = 4096;
const MAX_ANALYSIS_SECONDS = 4;

/** Cooley-Tukey FFT. In-place, power-of-two lengths. */
function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >>> 1;
    while (j & bit) { j ^= bit; bit >>>= 1; }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = -2 * Math.PI / length;
    const stepR = Math.cos(angle);
    const stepI = Math.sin(angle);
    for (let offset = 0; offset < n; offset += length) {
      let rotationR = 1, rotationI = 0;
      for (let j = 0; j < length / 2; j++) {
        const left = offset + j;
        const right = left + length / 2;
        const rightR = real[right] * rotationR - imag[right] * rotationI;
        const rightI = real[right] * rotationI + imag[right] * rotationR;
        const leftR = real[left], leftI = imag[left];
        real[left] = leftR + rightR;
        imag[left] = leftI + rightI;
        real[right] = leftR - rightR;
        imag[right] = leftI - rightI;
        const nextR = rotationR * stepR - rotationI * stepI;
        rotationI = rotationR * stepI + rotationI * stepR;
        rotationR = nextR;
      }
    }
  }
}

function integerDigitalSample(recording: EdfRecording, channel: EdfChannel, globalIndex: number): number {
  const record = Math.floor(globalIndex / channel.samplesPerRecord);
  const within = globalIndex % channel.samplesPerRecord;
  const offset = recording.headerBytes + record * recording.bytesPerRecord +
    channel.byteOffsetInRecord + within * 2;
  return recording.view.getInt16(offset, true);
}

export function analyzeEdfChannel(
  recording: EdfRecording,
  channel: EdfChannel,
  startSeconds: number,
  requestedSeconds = MAX_ANALYSIS_SECONDS,
): EegAnalysis {
  if (!recording.channels.includes(channel) || channel.annotation || channel.samplesPerRecord <= 0) {
    throw new Error('Choose a supported non-annotation signal channel.');
  }
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds >= recording.durationSeconds ||
      !Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
    throw new Error('Analysis time range is invalid.');
  }
  const fs = channel.sampleRate;
  if (!Number.isFinite(fs) || fs <= 0) throw new Error('Channel sampling rate is invalid.');
  const totalSamples = recording.records * channel.samplesPerRecord;
  const first = Math.min(totalSamples, Math.floor(startSeconds * fs));
  const effectiveSeconds = Math.min(
    MAX_ANALYSIS_SECONDS, requestedSeconds, recording.durationSeconds - startSeconds,
  );
  const sampleCount = Math.min(totalSamples - first, Math.floor(effectiveSeconds * fs));
  if (sampleCount < 64) throw new Error('At least 64 samples are required for spectral analysis.');
  if (sampleCount > MAX_ANALYSIS_SAMPLES) {
    throw new Error('Channel has too many samples for this bounded browser analysis window.');
  }
  let fftSize = 1;
  const requestedFft = Math.min(sampleCount, MAX_FFT_SIZE, Math.floor(fs * 2));
  while (fftSize * 2 <= requestedFft) fftSize *= 2;
  if (fftSize < 64) throw new Error('Channel sample rate is too low for the R5 spectrum method.');

  const values = new Float64Array(sampleCount);
  let sum = 0, squared = 0, min = Infinity, max = -Infinity, nearRails = 0, sameAdjacent = 0;
  let previousDigital: number | null = null;
  const nearRailMargin = Math.max(1, (channel.digitalMax - channel.digitalMin) * 0.001);
  for (let i = 0; i < sampleCount; i++) {
    const globalIndex = first + i;
    const value = physicalSample(recording, channel, globalIndex);
    if (!Number.isFinite(value)) throw new Error('EDF physical calibration produced a nonfinite value.');
    values[i] = value;
    sum += value;
    squared += value * value;
    min = Math.min(min, value);
    max = Math.max(max, value);
    const digital = integerDigitalSample(recording, channel, globalIndex);
    if (digital - channel.digitalMin <= nearRailMargin ||
        channel.digitalMax - digital <= nearRailMargin) nearRails++;
    if (previousDigital !== null && previousDigital === digital) sameAdjacent++;
    previousDigital = digital;
  }
  const mean = sum / sampleCount;
  const acRms = Math.sqrt(Math.max(0, squared / sampleCount - mean * mean));
  if (!Number.isFinite(acRms)) throw new Error('EDF amplitude range is not numerically supported.');

  const window = new Float64Array(fftSize);
  let windowSquareSum = 0;
  for (let i = 0; i < fftSize; i++) {
    const value = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    window[i] = value;
    windowSquareSum += value * value;
  }
  const half = fftSize / 2;
  const psd = new Array<number>(half + 1).fill(0);
  const hop = fftSize / 2;
  let welchSegments = 0;
  for (let offset = 0; offset + fftSize <= sampleCount; offset += hop) {
    const real = new Float64Array(fftSize);
    const imaginary = new Float64Array(fftSize);
    let segmentMean = 0;
    for (let i = 0; i < fftSize; i++) segmentMean += values[offset + i];
    segmentMean /= fftSize;
    for (let i = 0; i < fftSize; i++) real[i] = (values[offset + i] - segmentMean) * window[i];
    fft(real, imaginary);
    const normalization = fs * windowSquareSum;
    for (let k = 0; k <= half; k++) {
      const oneSided = k > 0 && k < half ? 2 : 1;
      psd[k] += oneSided * (real[k] * real[k] + imaginary[k] * imaginary[k]) / normalization;
    }
    welchSegments++;
  }
  if (!welchSegments) throw new Error('Could not construct a Welch segment.');
  const binHz = fs / fftSize;
  const frequenciesHz = psd.map((_, k) => k * binHz);
  for (let k = 0; k < psd.length; k++) psd[k] /= welchSegments;
  const nyquist = fs / 2;
  const upper = Math.min(45, nyquist);
  const totalBandPower = frequenciesHz.reduce(
    (sumPower, frequency, index) =>
      frequency >= 0.5 && frequency < upper ? sumPower + psd[index] * binHz : sumPower, 0,
  );
  const bands: BandPower[] = EEG_BANDS.map((band) => {
    const available = nyquist >= band.highHz;
    const power = available ? frequenciesHz.reduce(
      (acc, frequency, index) =>
        frequency >= band.lowHz && frequency < band.highHz ? acc + psd[index] * binHz : acc, 0,
    ) : null;
    return {
      ...band, available, power,
      relativePercent: power === null || totalBandPower <= 0 ? null : power / totalBandPower * 100,
    };
  });
  const warnings = [
    'Only the selected EDF channel is analyzed. The file label does not prove the source is cortical EEG.',
    'Spectral bands are descriptive conventions, not diagnoses, emotional states or consciousness measures.',
    'Header amplitude calibration and units are unverified. Recording artifacts, filtering and electrode montage affect results.',
    'Mean removal and Hann windowing are applied for spectrum estimation; raw EDF signal samples are not modified.',
    'Near-rail and unchanged-sample percentages are descriptive indicators, not a validated signal quality score.',
  ];
  if (welchSegments === 1) warnings.push('Only one spectral segment was available; no multi-segment averaging occurred.');
  if (nyquist < 45) warnings.push('Higher frequency bands exceeding Nyquist are unavailable.');
  if (!totalBandPower) warnings.push('No positive 0.5–45 Hz band power was measured in the analyzed segment.');
  if (recording.source === 'synthetic') warnings.unshift('SYNTHETIC: output reflects mathematical demonstration signals, not a person.');

  return {
    channelIndex: channel.index, sampleRateHz: fs, unit: channel.unit,
    provenance: recording.source, startSeconds: first / fs, durationSeconds: sampleCount / fs,
    analyzedSamples: sampleCount, fftSize, welchSegments, frequencyResolutionHz: binHz,
    frequenciesHz, psd, bands, mean, acRms, peakToPeak: max - min,
    nearRailPercent: 100 * nearRails / sampleCount,
    unchangedAdjacentPercent: sampleCount > 1 ? 100 * sameAdjacent / (sampleCount - 1) : 0,
    warnings,
  };
}

/** Portable aggregate-only receipt. No patient details, filename or waveform samples. */
export function eegAnalysisReceipt(analysis: EegAnalysis) {
  return {
    schema: 'mriphi-r5-eeg-spectrum-v1',
    provenance: analysis.provenance === 'synthetic'
      ? 'deterministic synthetic illustration, not human EEG'
      : 'locally imported EDF with unverified metadata',
    method: 'One-channel Welch PSD, Hann window, half overlap, per-segment mean subtraction, one-sided fs-scaled power density.',
    channelIndex: analysis.channelIndex,
    sampleRateHz: analysis.sampleRateHz,
    unit: analysis.unit,
    startSeconds: analysis.startSeconds,
    durationSeconds: analysis.durationSeconds,
    analyzedSamples: analysis.analyzedSamples,
    fftSize: analysis.fftSize,
    welchSegments: analysis.welchSegments,
    frequencyResolutionHz: analysis.frequencyResolutionHz,
    bands: analysis.bands,
    indicators: {
      mean: analysis.mean,
      acRms: analysis.acRms,
      peakToPeak: analysis.peakToPeak,
      nearRailPercent: analysis.nearRailPercent,
      unchangedAdjacentPercent: analysis.unchangedAdjacentPercent,
    },
    warnings: analysis.warnings,
    note: 'For educational research only; no patient header, filename, channel label, or raw samples. Aggregates may still be sensitive.',
  };
}
