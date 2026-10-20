import { describe, expect, it } from 'vitest';
import { makeDemoVolume, readNifti } from './volume';
import { positionFromCanvas, sliceSize } from './viewer';

function miniNifti(): File {
  const bytes = new ArrayBuffer(352 + 2 * 2 * 2 * 4);
  const view = new DataView(bytes);
  view.setInt32(0, 348, true);
  view.setInt16(40, 3, true);
  for (const at of [42, 44, 46]) view.setInt16(at, 2, true);
  view.setInt16(70, 16, true);
  view.setInt16(72, 32, true);
  for (const at of [80, 84, 88]) view.setFloat32(at, 1, true);
  view.setFloat32(108, 352, true);
  for (let i = 0; i < 8; i++) view.setFloat32(352 + i * 4, i, true);
  new Uint8Array(bytes).set([110, 43, 49, 0], 344);
  return new File([bytes], 'example.nii', { type: 'application/octet-stream' });
}

describe('NIfTI reader', () => {
  it('reads a single 3D scalar volume and keeps voxel order', async () => {
    const volume = await readNifti(miniNifti());
    expect(volume.dims).toEqual([2, 2, 2]);
    expect([...volume.data]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(volume.low).toBeLessThan(volume.high);
  });
  it('rejects input without a NIfTI header', async () => {
    await expect(readNifti(new File(['not MRI'], 'oops.nii'))).rejects.toThrow();
  });
});

describe('demo and planes', () => {
  it('creates an explicitly synthetic finite volume', () => {
    const demo = makeDemoVolume();
    expect(demo.source).toBe('demo');
    expect(demo.data.length).toBe(128 * 128 * 96);
    expect(demo.data[0]).toBeGreaterThanOrEqual(0);
  });
  it('maps clicks between coordinate systems without changing slice axis', () => {
    const demo = makeDemoVolume();
    expect(sliceSize(demo, 'sagittal')).toEqual([128, 96]);
    expect(positionFromCanvas(demo, 'axial', .5, .5).z).toBeUndefined();
    expect(positionFromCanvas(demo, 'coronal', .5, .5).z).toBeDefined();
  });
});
