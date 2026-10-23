import { describe, expect, it } from 'vitest';
import { edfReceipt, parseEdf, physicalSample, waveformEnvelope } from './edf';
import { makeSyntheticEeg } from './eeg-demo';

function fixture(options: {
  marker?: string;
  declaredRecords?: number;
  secondLabel?: string;
  version?: string;
} = {}): ArrayBuffer {
  const channelCount = 2;
  const headerLength = 256 + channelCount * 256;
  const recordBytes = (4 + 2) * 2;
  const records = 2;
  const buffer = new ArrayBuffer(headerLength + recordBytes * records);
  const bytes = new Uint8Array(buffer);
  bytes.fill(32, 0, headerLength);
  function put(position: number, width: number, value: string) {
    if (value.length > width) throw new Error('Fixture value too long');
    for (let n = 0; n < value.length; n++) bytes[position + n] = value.charCodeAt(n);
  }
  put(0, 8, options.version ?? '0');
  put(8, 80, 'subject-secret');
  put(184, 8, String(headerLength));
  put(192, 44, options.marker ?? 'EDF+C');
  put(236, 8, String(options.declaredRecords ?? records));
  put(244, 8, '1');
  put(252, 4, String(channelCount));
  let cursor = 256;
  function columns(width: number, values: string[]) {
    for (let i = 0; i < channelCount; i++) put(cursor + i * width, width, values[i]);
    cursor += channelCount * width;
  }
  columns(16, ['Fp1', options.secondLabel ?? 'Fp2']);
  columns(80, ['EEG electrode', 'EEG electrode']);
  columns(8, ['uV', 'uV']);
  columns(8, ['-50', '-200']);
  columns(8, ['50', '200']);
  columns(8, ['-100', '-100']);
  columns(8, ['100', '100']);
  columns(80, ['', '']);
  columns(8, ['4', '2']);
  columns(32, ['', '']);
  if (cursor !== headerLength) throw new Error('Fixture header error');
  const view = new DataView(buffer);
  const samples = [-100, 0, 100, -50, 0, 50, 50, -100, 100, 0, 100, -100];
  samples.forEach((sample, index) => view.setInt16(headerLength + index * 2, sample, true));
  return buffer;
}

describe('EDF import R4', () => {
  it('provides deterministic demo waves clearly separated from human recordings', () => {
    const demo = makeSyntheticEeg();
    expect(demo.source).toBe('synthetic');
    expect(demo.channels).toHaveLength(4);
    expect(demo.durationSeconds).toBe(12);
    expect(demo.channels.every((channel) => channel.sampleRate === 128)).toBe(true);
    expect(physicalSample(demo, demo.channels[0], 12)).toBeCloseTo(physicalSample(makeSyntheticEeg(), demo.channels[0], 12));
    expect(JSON.stringify(edfReceipt(demo))).toContain('synthetic illustrative data');
    expect(demo.warnings[0]).toContain('not human brain activity');
  });

  it('parses interleaved records and calibrates each channel in its own units', () => {
    const recording = parseEdf(fixture(), 'brain.edf');
    expect(recording.format).toBe('EDF+C');
    expect(recording.records).toBe(2);
    expect(recording.durationSeconds).toBe(2);
    expect(recording.channels.map((channel) => channel.sampleRate)).toEqual([4, 2]);
    expect(physicalSample(recording, recording.channels[0], 0)).toBe(-50);
    expect(physicalSample(recording, recording.channels[0], 2)).toBe(50);
    expect(physicalSample(recording, recording.channels[0], 4)).toBe(25);
    expect(physicalSample(recording, recording.channels[1], 1)).toBe(100);
    expect(physicalSample(recording, recording.channels[1], 2)).toBe(200);
    expect(physicalSample(recording, recording.channels[1], 3)).toBe(-200);
  });

  it('preserves impulses with min/max downsampling', () => {
    const recording = parseEdf(fixture());
    const firstSecond = waveformEnvelope(recording, recording.channels[0], 0, 1, 2);
    expect(firstSecond).toEqual([{ min: -50, max: 0 }, { min: -25, max: 50 }]);
    expect(waveformEnvelope(recording, recording.channels[0], 4, 1, 2)).toEqual([
      { min: Number.NaN, max: Number.NaN }, { min: Number.NaN, max: Number.NaN },
    ]);
  });

  it('rejects discontinued timing rather than drawing it as uninterrupted', () => {
    expect(() => parseEdf(fixture({ marker: 'EDF+D' }))).toThrow(/discontinuous/i);
  });

  it('rejects non-EDF, truncated data and inconsistent record counts', () => {
    expect(() => parseEdf(fixture({ version: 'BDF' }))).toThrow(/version/i);
    expect(() => parseEdf(fixture().slice(0, -1))).toThrow(/truncated|inconsistent/i);
    expect(() => parseEdf(fixture({ declaredRecords: 3 }))).toThrow(/record count/i);
  });

  it('infers unknown record count only when the file has a complete record layout', () => {
    const recording = parseEdf(fixture({ declaredRecords: -1 }));
    expect(recording.records).toBe(2);
    expect(recording.warnings.join(' ')).toContain('inferred');
  });

  it('excludes EDF+ annotation channels from waveform inspection', () => {
    const recording = parseEdf(fixture({ secondLabel: 'EDF Annotations' }));
    expect(recording.channels[1].annotation).toBe(true);
    expect(waveformEnvelope(recording, recording.channels[1], 0, 1, 20)).toEqual([]);
  });

  it('exports a metadata-only receipt with no patient header or filename', () => {
    const receipt = JSON.stringify(edfReceipt(parseEdf(fixture(), 'subject-secret.edf')));
    expect(receipt).toContain('mriphi-edf-r4-v1');
    expect(receipt).not.toContain('subject-secret');
    expect(receipt).not.toContain('rawSamples');
  });

  it('prevents unsafe sample indices and invalid envelope ranges', () => {
    const recording = parseEdf(fixture());
    expect(() => physicalSample(recording, recording.channels[0], -1)).toThrow(RangeError);
    expect(() => physicalSample(recording, recording.channels[0], 100)).toThrow(RangeError);
    expect(() => waveformEnvelope(recording, recording.channels[0], 0, 10, 3000)).toThrow(RangeError);
  });
});
