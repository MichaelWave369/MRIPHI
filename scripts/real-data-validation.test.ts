/**
 * R6.1 evidence test against a real public continuous EDF recording.
 *
 * Opt-in only: normal npm test will SKIP; real-data workflow must supply all
 * MRIPHI_E2E_* environment variables. A missing reference NEVER counts as a pass.
 * No patient headers, channel labels or samples are written to artifacts.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseEdf } from '../src/lib/edf';
import { analyzeEdfChannel } from '../src/lib/eeg-analysis';
import { compareR6, createR6Request, parseR6Reference } from '../src/lib/eeg-validation';

const edfPath = process.env.MRIPHI_E2E_EDF;
const outDir = process.env.MRIPHI_E2E_OUT;
const stage = process.env.MRIPHI_E2E_STAGE;
const enabled = Boolean(edfPath && outDir && (stage === 'request' || stage === 'compare'));
const windows = [
  { channelIndex: 0, startSeconds: 0, seconds: 4 },
  { channelIndex: 1, startSeconds: 8, seconds: 4 },
  { channelIndex: 8, startSeconds: 20, seconds: 4 },
] as const;

describe.skipIf(!enabled)('R6.1 real-recording EDF cross-check', () => {
  it('parses actual EDF, and agrees with independent MNE numerical references', () => {
    const data = readFileSync(edfPath!);
    const bytes = Uint8Array.from(data);
    const recording = parseEdf(bytes.buffer, 'REDACTED-PUBLIC-EDF.edf');
    expect(recording.source).toBe('local');
    expect(recording.format).toMatch(/^EDF/);
    expect(recording.durationSeconds).toBeGreaterThan(30);
    expect(recording.channels.length).toBeGreaterThanOrEqual(64);
    mkdirSync(outDir!, { recursive: true });

    const run = windows.map((spec, index) => {
      const channel = recording.channels[spec.channelIndex];
      expect(channel).toBeDefined();
      expect(channel.annotation).toBe(false);
      const analysis = analyzeEdfChannel(recording, channel, spec.startSeconds, spec.seconds);
      expect(analysis.analyzedSamples).toBeGreaterThan(100);
      expect(analysis.psd.every(Number.isFinite)).toBe(true);
      const request = createR6Request(analysis);
      const id = String(index + 1).padStart(2, '0');
      const requestPath = join(outDir!, 'request-' + id + '.json');
      if (stage === 'request') {
        writeFileSync(requestPath, JSON.stringify(request, null, 2) + '\n', { flag: 'wx' });
        return { id, channelIndex: spec.channelIndex, startSeconds: spec.startSeconds, result: 'REFERENCE_PENDING' };
      }
      const referencePath = join(outDir!, 'reference-' + id + '.json');
      const reference = parseR6Reference(readFileSync(referencePath, 'utf8'));
      const result = compareR6(request, reference);
      // Release the manifest regardless of mismatch so failures are auditable.
      return {
        id, channelIndex: spec.channelIndex, startSeconds: spec.startSeconds,
        result: result.result, checks: result.checks.map(({ name, outcome }) => ({ name, outcome })),
        warning: 'Numerical validation only; no source authentication, clinical or consciousness claims.',
      };
    });

    if (stage === 'compare') {
      const manifest = {
        schema: 'mriphi-r6.1-real-edf-evidence-v1',
        source: 'PhysioNet EEG Motor Movement/Imagery Dataset, v1.0.0, S001R01.edf',
        sourceUrl: 'https://physionet.org/files/eegmmidb/1.0.0/S001/S001R01.edf',
        sourceDoi: '10.13026/C28G6P',
        sourceLicense: 'Open Data Commons Attribution 1.0',
        sha256: createHash('sha256').update(data).digest('hex'),
        fileBytes: data.length,
        signalChannels: recording.channels.filter((channel) => !channel.annotation).length,
        result: run.every((result) => result.result === 'MATCH') ? 'PASS' : 'FAIL',
        windows: run,
        qualification: 'Independent MNE vs MRIΦ numeric check on public EEG data. Not a medical, diagnostic or anomalous-coupling validation.',
      };
      writeFileSync(join(outDir!, 'real-eeg-ledger.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
      for (const item of run) expect(item.result, 'MNE reference disagreement: ' + item.id).toBe('MATCH');
      expect(manifest.result).toBe('PASS');
    }
  });
});
