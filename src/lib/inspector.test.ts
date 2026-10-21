import { describe, expect, it } from 'vitest';
import { createSpatial } from './spatial';
import { buildReceipt, computeHistogram, distanceBetween, distanceUnit, inspectPoint } from './inspector';
import type { Volume } from './volume';

function makeVolume(
  source: 'demo' | 'nifti' = 'nifti',
  orientation: 'sform' | 'qform' | 'unverified' | 'demo' = 'sform',
  units: 'mm' | 'assumed mm' = 'mm',
): Volume {
  return {
    name: 'test.nii',
    source,
    dims: [2, 2, 2],
    spacing: [2, 3, 4],
    data: new Float32Array([0, 10, 20, 30, 40, 50, 60, 70]),
    low: 0,
    high: 70,
    spatial: createSpatial([2, 2, 2], [
      -2, 0, 0, 10,
      0, 3, 0, -8,
      0, 0, 4, 12,
    ], orientation, units),
  };
}

describe('R3 crosshair probe', () => {
  it('reports world, fractional voxel and nearest raw intensity through an affine flip', () => {
    const scan = makeVolume();
    const p = inspectPoint(scan, { x: 8, y: -8, z: 12 });
    expect(p).not.toBeNull();
    expect(p?.voxel).toEqual({ x: 1, y: 0, z: 0 });
    expect(p?.nearest).toEqual([1, 0, 0]);
    expect(p?.nearestValue).toBe(10);
    expect(p?.interpolatedValue).toBeCloseTo(10);
  });

  it('uses trilinear values at non-voxel points and ignores coordinates outside data', () => {
    const scan = makeVolume();
    const p = inspectPoint(scan, { x: 9, y: -6.5, z: 14 });
    expect(p?.interpolatedValue).toBeCloseTo(35);
    expect(p?.nearestValue).toBe(70);
    expect(inspectPoint(scan, { x: 100, y: 0, z: 0 })).toBeNull();
    expect(inspectPoint(scan, { x: NaN, y: 0, z: 0 })).toBeNull();
  });
});

describe('R3 intensity histograms', () => {
  it('bins in-range samples once, including the right endpoint', () => {
    const h = computeHistogram(makeVolume(), 7);
    expect(h.sampled).toBe(8);
    expect(h.bins.reduce((sum, v) => sum + v, 0)).toBe(8);
    expect(h.withinWindow).toBe(8);
    expect(h.bins[6]).toBeGreaterThanOrEqual(1);
    expect(h.invalid).toBe(0);
  });

  it('tracks window outliers and NaN without incorrectly classifying them', () => {
    const scan = makeVolume();
    scan.low = 10;
    scan.high = 60;
    scan.data[1] = NaN;
    const h = computeHistogram(scan, 5);
    expect(h.sampled).toBe(8);
    expect(h.invalid).toBe(1);
    expect(h.belowWindow).toBe(1);
    expect(h.aboveWindow).toBe(1);
    expect(h.withinWindow).toBe(5);
  });

  it('rejects invalid histogram configurations', () => {
    expect(() => computeHistogram(makeVolume(), 1)).toThrow();
    expect(() => computeHistogram(makeVolume(), 257)).toThrow();
  });
});

describe('R3 measurement provenance and export', () => {
  it('calculates Euclidean length but allows mm only with explicit spatial metadata', () => {
    expect(distanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 })).toBe(13);
    expect(distanceUnit(makeVolume()).interpretable).toBe(true);
    expect(distanceUnit(makeVolume('nifti', 'qform')).label).toContain('mm');
    expect(distanceUnit(makeVolume('nifti', 'sform', 'assumed mm')).interpretable).toBe(false);
    expect(distanceUnit(makeVolume('nifti', 'unverified')).label).toBe('unverified units');
    expect(distanceUnit(makeVolume('demo', 'demo')).label).toBe('synthetic units');
  });

  it('exports a structured JSON receipt without pixel data or unjustified diagnoses', () => {
    const scan = makeVolume();
    const receipt = JSON.parse(buildReceipt(scan, {
      A: { world: { x: 8, y: -8, z: 12 }, capturedAt: '2026-10-20T12:00:00Z' },
      B: { world: { x: 10, y: -5, z: 16 }, capturedAt: '2026-10-20T12:01:00Z' },
    }, '2026-10-20T12:02:00Z'));
    expect(receipt.schema).toBe('mriphi.scan-inspector.receipt.v1');
    expect(receipt.provenance.datasetFilename).toBe('test.nii');
    expect(receipt.acquisition.orientationSource).toBe('sform');
    expect(receipt.marks.A.rawVoxelIntensity).toBe(10);
    expect(receipt.marks.B.rawVoxelIntensity).toBe(60);
    expect(receipt.distance.value).toBeCloseTo(Math.sqrt(29));
    expect(receipt.distance.validatedPhysicalUnits).toBe(true);
    expect(receipt.data).toBeUndefined();
    expect(receipt.warnings).toHaveLength(5);
  });

  it('labels uncertainty in a synthetic receipt even if a distance is present', () => {
    const scan = makeVolume('demo', 'demo');
    const receipt = JSON.parse(buildReceipt(scan, {
      A: { world: { x: 8, y: -8, z: 12 }, capturedAt: 't0' },
      B: { world: { x: 10, y: -5, z: 16 }, capturedAt: 't1' },
    }, 't2'));
    expect(receipt.provenance.synthetic).toBe(true);
    expect(receipt.distance.validatedPhysicalUnits).toBe(false);
    expect(receipt.distance.units).toBe('synthetic units');
  });
});
