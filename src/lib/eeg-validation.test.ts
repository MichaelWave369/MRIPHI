import { describe, expect, it } from 'vitest';
import { makeSyntheticEeg } from './eeg-demo';
import { analyzeEdfChannel } from './eeg-analysis';
import { compareR6, createR6Request, parseR6Reference, R6_METHOD } from './eeg-validation';

function fixture() {
  const recording = makeSyntheticEeg();
  const channel = recording.channels[1];
  const analysis = analyzeEdfChannel(recording, channel, 0, 4);
  const request = createR6Request(analysis);
  const reference = {
    schema: 'mriphi-r6-mne-reference-v1',
    method: R6_METHOD,
    channelIndex: request.channelIndex,
    sampleRateHz: request.sampleRateHz,
    startSample: request.startSample,
    sampleCount: request.sampleCount,
    fftSize: request.fftSize,
    welchSegments: request.welchSegments,
    bands: request.bands,
    peakFrequencyHz: request.peakFrequencyHz,
    acRms: request.acRms,
    peakToPeak: request.peakToPeak,
    engine: 'MNE-Python test-only-double',
  };
  return { request, reference };
}

describe('MRIΦ R6 validation protocol', () => {
  it('exports request without filename, channel label, patient fields or EEG samples', () => {
    const { request } = fixture();
    const exported = JSON.stringify(request);
    expect(request.sampleCount).toBe(512);
    expect(request.startSample).toBe(0);
    expect(request.method).toBe(R6_METHOD);
    expect(exported).not.toContain('SYN-FP2');
    expect(exported).not.toContain('physicalSamples');
    expect(exported).not.toContain('patientName');
    expect(exported).not.toContain('"psd"');
  });

  it('matches a numerical reference with identical calculation parameters', () => {
    const { request, reference } = fixture();
    const parsed = parseR6Reference(JSON.stringify(reference));
    const result = compareR6(request, parsed);
    expect(result.result).toBe('MATCH');
    expect(result.checks.every((check) => check.outcome === 'PASS')).toBe(true);
    expect(result.caveat).toContain('not');
  });

  it('does not match mismatched channel identity or frequency power', () => {
    const { request, reference } = fixture();
    reference.channelIndex += 1;
    reference.bands[2] = { ...reference.bands[2], power: reference.bands[2].power! * 1.5 };
    const result = compareR6(request, parseR6Reference(JSON.stringify(reference)));
    expect(result.result).toBe('DIFFER');
    expect(result.checks.some((check) => check.name === 'channelIndex' && check.outcome === 'FAIL')).toBe(true);
    expect(result.checks.some((check) => check.name === 'alpha power' && check.outcome === 'FAIL')).toBe(true);
  });

  it('tolerates only small rounding differences', () => {
    const { request, reference } = fixture();
    reference.bands[2] = { ...reference.bands[2], power: reference.bands[2].power! * 1.002 };
    expect(compareR6(request, parseR6Reference(JSON.stringify(reference))).result).toBe('MATCH');
    reference.bands[2].power = reference.bands[2].power! * 1.03;
    expect(compareR6(request, parseR6Reference(JSON.stringify(reference))).result).toBe('DIFFER');
  });

  it('refuses forged schema, missing metrics, malformed numbers and oversized JSON', () => {
    const { reference } = fixture();
    expect(() => parseR6Reference('{}')).toThrow(/expected an R6/i);
    expect(() => parseR6Reference(JSON.stringify({ ...reference, sampleCount: null }))).toThrow(/sampleCount/);
    expect(() => parseR6Reference(JSON.stringify({ ...reference, engine: 'anonymous' }))).toThrow(/MNE/i);
    expect(() => parseR6Reference(JSON.stringify({ ...reference, bands: [] }))).toThrow(/five/);
    expect(() => parseR6Reference(' '.repeat(100_001))).toThrow(/limit/i);
  });

  it('requires null unavailable bands to match exactly', () => {
    const { request, reference } = fixture();
    request.bands[4].power = null;
    request.bands[4].relativePercent = null;
    expect(compareR6(request, parseR6Reference(JSON.stringify(reference))).result).toBe('DIFFER');
    reference.bands[4].power = null;
    reference.bands[4].relativePercent = null;
    expect(compareR6(request, parseR6Reference(JSON.stringify(reference))).result).toBe('MATCH');
  });
});
