import { describe, expect, it } from 'vitest';
import { makeSyntheticEeg } from './eeg-demo';
import { analyzeEdfChannel, eegAnalysisReceipt } from './eeg-analysis';

describe('R5 EEG frequency lab', () => {
  it('recognizes the planted 9 Hz spectral component in synthetic channel 2', () => {
    const recording = makeSyntheticEeg();
    const result = analyzeEdfChannel(recording, recording.channels[1], 1, 4);
    const strongestBin = result.psd.reduce((max, power, index, values) => power > values[max] ? index : max, 0);
    expect(result.frequenciesHz[strongestBin]).toBeCloseTo(9, 1);
    const alpha = result.bands.find((band) => band.key === 'alpha')!;
    const theta = result.bands.find((band) => band.key === 'theta')!;
    expect(alpha.available).toBe(true);
    expect(alpha.relativePercent!).toBeGreaterThan(50);
    expect(theta.relativePercent!).toBeLessThan(alpha.relativePercent!);
    expect(result.welchSegments).toBeGreaterThan(1);
    expect(result.analyzedSamples).toBe(512);
    expect(result.frequencyResolutionHz).toBeCloseTo(0.5);
  });

  it('recognizes planted 7 Hz component in the theta range', () => {
    const recording = makeSyntheticEeg();
    const result = analyzeEdfChannel(recording, recording.channels[0], 0);
    const theta = result.bands.find((band) => band.key === 'theta')!;
    const alpha = result.bands.find((band) => band.key === 'alpha')!;
    expect(theta.power!).toBeGreaterThan(alpha.power!);
  });

  it('uses file physical units and yields sensible AC RMS and peak-to-peak range', () => {
    const recording = makeSyntheticEeg();
    const result = analyzeEdfChannel(recording, recording.channels[1], 0, 4);
    expect(result.unit).toBe('uV');
    expect(result.acRms).toBeGreaterThan(10);
    expect(result.acRms).toBeLessThan(25);
    expect(result.peakToPeak).toBeGreaterThan(35);
    expect(result.peakToPeak).toBeLessThan(100);
    expect(result.nearRailPercent).toBe(0);
  });

  it('bounds each analysis to four seconds even for a longer requested window', () => {
    const recording = makeSyntheticEeg();
    const result = analyzeEdfChannel(recording, recording.channels[0], 2, 20);
    expect(result.durationSeconds).toBe(4);
    expect(result.startSeconds).toBe(2);
  });

  it('flags rail samples and constant digital values without claiming a diagnosis', () => {
    const recording = makeSyntheticEeg();
    const channel = recording.channels[0];
    for (let record = 0; record < recording.records; record++) {
      for (let j = 0; j < channel.samplesPerRecord; j++) {
        const at = recording.headerBytes + record * recording.bytesPerRecord +
          channel.byteOffsetInRecord + j * 2;
        recording.view.setInt16(at, channel.digitalMax, true);
      }
    }
    const result = analyzeEdfChannel(recording, channel, 0);
    expect(result.unchangedAdjacentPercent).toBe(100);
    expect(result.nearRailPercent).toBe(100);
    expect(result.acRms).toBeCloseTo(0, 5);
    expect(result.bands.every((band) => band.relativePercent === null)).toBe(true);
  });

  it('rejects out-of-range inputs and annotation-only channels', () => {
    const recording = makeSyntheticEeg();
    expect(() => analyzeEdfChannel(recording, recording.channels[0], -1)).toThrow(/time range/);
    expect(() => analyzeEdfChannel(recording, recording.channels[0], 12)).toThrow(/time range/);
    expect(() => analyzeEdfChannel(recording, recording.channels[0], 0, 0)).toThrow(/time range/);
    expect(() => analyzeEdfChannel(recording, { ...recording.channels[0], annotation: true }, 0)).toThrow(/choose/i);
  });

  it('reports absent bands when sampling rate puts them above Nyquist', () => {
    const recording = makeSyntheticEeg();
    // Artificially set metadata for this test to exercise the Nyquist guard.
    const channel = recording.channels[0];
    channel.sampleRate = 64;
    const result = analyzeEdfChannel(recording, channel, 0);
    expect(result.bands.find((band) => band.key === 'gamma')!.available).toBe(false);
    expect(result.bands.find((band) => band.key === 'gamma')!.power).toBe(null);
    expect(result.warnings.join(' ')).toContain('Nyquist');
  });

  it('exports aggregate analysis with explicit provenance and without waveform samples or patient fields', () => {
    const recording = makeSyntheticEeg();
    const analysis = analyzeEdfChannel(recording, recording.channels[0], 0);
    const receipt = JSON.stringify(eegAnalysisReceipt(analysis));
    expect(receipt).toContain('mriphi-r5-eeg-spectrum-v1');
    expect(receipt).toContain('synthetic illustration');
    expect(receipt).not.toContain('SYN-FP1');
    expect(receipt).not.toContain('patientName');
    expect(receipt).not.toContain('frequenciesHz');
    expect(receipt).not.toContain('"psd"');
  });
});
