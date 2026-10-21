import { describe, expect, it } from 'vitest';
import { createSpatial, spatialCenter } from './spatial';
import { createStageGeometry } from './stage';

describe('MRIΦ 3D tri-plane geometry', () => {
  const spatial = createSpatial(
    [10, 20, 30],
    [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0],
    'sform',
  );

  it('sizes image planes according to physical millimeter span, not voxel counts', () => {
    const geometry = createStageGeometry(spatial, spatialCenter(spatial), 290);
    const [coronal, axial, sagittal] = geometry.planes;
    expect(geometry.scale).toBeCloseTo(290 / 87, 7);
    expect(coronal.axis).toBe('coronal');
    expect(coronal.width).toBeCloseTo(9 * geometry.scale);
    expect(coronal.height).toBeCloseTo(87 * geometry.scale);
    expect(axial.width).toBeCloseTo(9 * geometry.scale);
    expect(axial.height).toBeCloseTo(38 * geometry.scale);
    expect(sagittal.width).toBeCloseTo(38 * geometry.scale);
    expect(sagittal.height).toBeCloseTo(87 * geometry.scale);
    expect(axial.rotation).toBe('rotateX(-90deg)');
    expect(sagittal.rotation).toBe('rotateY(-90deg)');
  });

  it('places the three planes at the same crosshair world coordinates', () => {
    const { min, max } = spatial.bounds;
    const atMax = createStageGeometry(spatial, max, 290);
    const planes = Object.fromEntries(atMax.planes.map((plane) => [plane.axis, plane]));
    expect(planes.sagittal.x).toBeCloseTo(9 / 2 * atMax.scale);
    expect(planes.coronal.z).toBeCloseTo(38 / 2 * atMax.scale);
    expect(planes.axial.y).toBeCloseTo(-87 / 2 * atMax.scale);
    const atMin = createStageGeometry(spatial, min, 290);
    const planesMin = Object.fromEntries(atMin.planes.map((plane) => [plane.axis, plane]));
    expect(planesMin.sagittal.x).toBeCloseTo(-planes.sagittal.x);
    expect(planesMin.coronal.z).toBeCloseTo(-planes.coronal.z);
    expect(planesMin.axial.y).toBeCloseTo(-planes.axial.y);
  });

  it('clamps out-of-volume crosshairs and protects against non-finite extent', () => {
    const beyond = createStageGeometry(spatial, { x: 999, y: 999, z: 999 }, 100);
    const center = createStageGeometry(spatial, spatialCenter(spatial), 100);
    expect(beyond.planes[0].z).toBeGreaterThan(center.planes[0].z);
    expect(beyond.planes[1].y).toBeLessThan(center.planes[1].y);
    expect(() => createStageGeometry(spatial, spatialCenter(spatial), 0)).toThrow();
    expect(() => createStageGeometry(spatial, spatialCenter(spatial), NaN)).toThrow();
  });

  it('remains meaningful for oblique MRI data', () => {
    const tilted = createSpatial([6, 7, 8], [
      0.8660254, -0.5, 0, 5,
      0.5, 0.8660254, 0, -6,
      0, 0, 1.5, 4,
    ], 'sform');
    const geometry = createStageGeometry(tilted, spatialCenter(tilted));
    expect(tilted.oblique).toBe(true);
    expect(geometry.planes).toHaveLength(3);
    for (const p of geometry.planes) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      for (const offset of [p.x, p.y, p.z]) expect(offset).toBeCloseTo(0, 9);
    }
  });
});
