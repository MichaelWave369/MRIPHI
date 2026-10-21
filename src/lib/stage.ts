import type { Axis, Position } from './volume';
import type { Spatial } from './spatial';

/**
 * Geometry for three world-aligned MRI planes displayed in a CSS 3D scene.
 *
 * The scene uses CSS coordinates:
 *   +X = patient right, +Y (CSS down) = patient inferior,
 *   +Z (toward camera) = patient anterior.
 *
 * Therefore RAS world (X,Y,Z) -> scene (+X, +Z, -Y).
 *
 * This is an interactive orthogonal slice sculpture, NOT a volumetric
 * raycaster, brain mesh, segmentation, or diagnostic instrument.
 */
export type StagePlaneGeometry = {
  axis: Axis;
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
  rotation: 'none' | 'rotateX(-90deg)' | 'rotateY(-90deg)';
};

export type StageGeometry = {
  extent: number;
  scale: number;
  planes: StagePlaneGeometry[];
};

function span(min: number, max: number): number {
  return Math.max(0, max - min);
}

export function createStageGeometry(
  spatial: Spatial,
  position: Position,
  maxExtent = 310,
): StageGeometry {
  if (!Number.isFinite(maxExtent) || maxExtent <= 0) {
    throw new Error('3D scene extent must be positive and finite');
  }

  const { min, max } = spatial.bounds;
  const sx = span(min.x, max.x);
  const sy = span(min.y, max.y);
  const sz = span(min.z, max.z);
  const scale = maxExtent / Math.max(1e-6, sx, sy, sz);
  const middle: Position = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };

  const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, value));

  // Actual displayed image proportions must follow physical world spans,
  // not original voxel counts (MRI voxels may be non-isotropic).
  return {
    extent: maxExtent,
    scale,
    planes: [
      {
        axis: 'coronal',
        width: sx * scale,
        height: sz * scale,
        x: 0,
        y: 0,
        z: (clamp(position.y, min.y, max.y) - middle.y) * scale,
        rotation: 'none',
      },
      {
        axis: 'axial',
        width: sx * scale,
        height: sy * scale,
        x: 0,
        y: -(clamp(position.z, min.z, max.z) - middle.z) * scale,
        z: 0,
        rotation: 'rotateX(-90deg)',
      },
      {
        axis: 'sagittal',
        width: sy * scale,
        height: sz * scale,
        x: (clamp(position.x, min.x, max.x) - middle.x) * scale,
        y: 0,
        z: 0,
        rotation: 'rotateY(-90deg)',
      },
    ],
  };
}
