import type { Position, Volume } from './volume';
import { applyAffine } from './spatial';
import { sampleVolume } from './viewer';

export type Probe = {
  world: Position;
  voxel: Position;
  nearest: [number, number, number];
  nearestValue: number;
  interpolatedValue: number | null;
  inside: boolean;
};

export type Histogram = {
  bins: number[];
  min: number;
  max: number;
  sampled: number;
  withinWindow: number;
  belowWindow: number;
  aboveWindow: number;
  invalid: number;
};

export type Mark = { world: Position; capturedAt: string };
export type Marks = { A: Mark | null; B: Mark | null };

function finitePosition(p: Position): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

export function inspectPoint(volume: Volume, world: Position): Probe | null {
  if (!finitePosition(world)) return null;
  const voxel = applyAffine(volume.spatial.inverse, world);
  const [nx, ny, nz] = volume.dims;
  const inside = voxel.x >= -1e-5 && voxel.x <= nx - 1 + 1e-5 &&
    voxel.y >= -1e-5 && voxel.y <= ny - 1 + 1e-5 &&
    voxel.z >= -1e-5 && voxel.z <= nz - 1 + 1e-5;
  if (!inside || !finitePosition(voxel)) return null;
  const nearest = [
    Math.round(Math.max(0, Math.min(nx - 1, voxel.x))),
    Math.round(Math.max(0, Math.min(ny - 1, voxel.y))),
    Math.round(Math.max(0, Math.min(nz - 1, voxel.z))),
  ] as [number, number, number];
  const raw = volume.data[nearest[0] + nx * (nearest[1] + ny * nearest[2])];
  return {
    world: { ...world },
    voxel,
    nearest,
    nearestValue: raw,
    interpolatedValue: sampleVolume(volume, world),
    inside: true,
  };
}

/**
 * Bounded, deterministic intensity histogram of finite voxels.
 * Uses the existing data-based 1st/99th-percentile display range as the
 * histogram domain; reports out-of-range samples separately.
 * This is NOT a tissue segmentation or a statistical population analysis.
 */
export function computeHistogram(volume: Volume, binCount = 64, targetSamples = 120000): Histogram {
  if (!Number.isInteger(binCount) || binCount < 2 || binCount > 256) {
    throw new Error('Histogram requires 2 to 256 bins');
  }
  const n = volume.data.length;
  const stride = Math.max(1, Math.ceil(n / Math.max(1, targetSamples)));
  const min = volume.low;
  const max = volume.high;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new Error('Invalid intensity window');
  }
  const bins = Array<number>(binCount).fill(0);
  let sampled = 0;
  let invalid = 0;
  let belowWindow = 0;
  let aboveWindow = 0;
  let withinWindow = 0;
  for (let i = 0; i < n; i += stride) {
    const v = volume.data[i];
    sampled++;
    if (!Number.isFinite(v)) { invalid++; continue; }
    if (v < min) { belowWindow++; continue; }
    if (v > max) { aboveWindow++; continue; }
    const fraction = (v - min) / (max - min);
    const index = Math.max(0, Math.min(binCount - 1, Math.floor(fraction * binCount)));
    bins[index]++;
    withinWindow++;
  }
  return { bins, min, max, sampled, invalid, belowWindow, aboveWindow, withinWindow };
}

export function distanceBetween(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function distanceUnit(volume: Volume): {
  label: string;
  interpretable: boolean;
  explanation: string;
} {
  const spatial = volume.spatial;
  if ((spatial.source === 'sform' || spatial.source === 'qform') && spatial.units === 'mm') {
    return {
      label: 'mm (header-reported)',
      interpretable: true,
      explanation: 'Calculated from the NIfTI header spatial transform. MRIPHI cannot independently verify its accuracy.',
    };
  }
  if (spatial.source === 'demo') {
    return {
      label: 'synthetic units',
      interpretable: false,
      explanation: 'The demo is a mathematical phantom. Its distances are not anatomical measurements.',
    };
  }
  return {
    label: 'unverified units',
    interpretable: false,
    explanation: 'Spatial orientation or length units are missing or uncertain. Do not interpret this distance as millimeters.',
  };
}

const rounded = (value: number): number => Number(value.toFixed(5));
const exportPoint = (volume: Volume, marker: Mark | null) => {
  if (!marker) return null;
  const probe = inspectPoint(volume, marker.world);
  return {
    capturedAt: marker.capturedAt,
    positionWorld: Object.fromEntries(
      Object.entries(marker.world).map(([key, val]) => [key, rounded(val)]),
    ),
    voxelFloat: probe ? Object.fromEntries(
      Object.entries(probe.voxel).map(([key, val]) => [key, rounded(val)]),
    ) : null,
    voxelNearest: probe?.nearest ?? null,
    rawVoxelIntensity: probe?.nearestValue ?? null,
    trilinearIntensity: probe?.interpolatedValue ?? null,
    inBounds: Boolean(probe),
  };
};

export function buildReceipt(volume: Volume, marks: Marks, when: string): string {
  const unit = distanceUnit(volume);
  const distance = marks.A && marks.B ? distanceBetween(marks.A.world, marks.B.world) : null;
  return JSON.stringify({
    schema: 'mriphi.scan-inspector.receipt.v1',
    createdAt: when,
    application: 'MRIΦ R3',
    provenance: {
      source: volume.source,
      datasetFilename: volume.name,
      synthetic: volume.source === 'demo',
      inputProcessedLocally: true,
    },
    acquisition: {
      dimensionsVoxels: volume.dims,
      voxelSpacingFromHeader: volume.spacing,
      orientationSource: volume.spatial.source,
      spatialUnits: volume.spatial.units,
      oblique: volume.spatial.oblique,
      affineVoxelToWorld: volume.spatial.affine,
    },
    marks: { A: exportPoint(volume, marks.A), B: exportPoint(volume, marks.B) },
    distance: distance === null ? null : {
      value: rounded(distance),
      units: unit.label,
      validatedPhysicalUnits: unit.interpretable,
      caveat: unit.explanation,
    },
    warnings: [
      'This is a local educational observation receipt, not a clinical report.',
      'Intensity numbers may be arbitrary scanner signal units and are not tissue classifications.',
      'A valid NIfTI transform does not prove header spatial information is correct.',
      'No images, patient diagnoses, or brain structure volumes were calculated.',
      'Filename may contain identifying information; review before sharing.',
    ],
  }, null, 2);
}
