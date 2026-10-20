export type Axis = 'axial' | 'coronal' | 'sagittal';
export type Position = { x: number; y: number; z: number };

export type Volume = {
  name: string;
  source: 'demo' | 'nifti';
  dims: [number, number, number];
  spacing: [number, number, number];
  data: Float32Array;
  low: number;
  high: number;
};

export const axisIndex: Record<Axis, keyof Position> = {
  axial: 'z',
  coronal: 'y',
  sagittal: 'x',
};

export function makeDemoVolume(): Volume {
  const dims: [number, number, number] = [128, 128, 96];
  const [nx, ny, nz] = dims;
  const data = new Float32Array(nx * ny * nz);

  for (let z = 0; z < nz; z++) {
    const zz = (z / (nz - 1) - 0.5) * 2;
    for (let y = 0; y < ny; y++) {
      const yy = (y / (ny - 1) - 0.5) * 2;
      for (let x = 0; x < nx; x++) {
        const xx = (x / (nx - 1) - 0.5) * 2;
        const ellipsoid = (xx / 0.82) ** 2 + (yy / 0.89) ** 2 + (zz / 0.86) ** 2;
        const waves =
          Math.sin(xx * 36 + Math.cos(yy * 14 + zz * 10) * 2.7) *
          Math.cos(yy * 31 - zz * 22) * 0.047;
        const granular = (Math.sin(x * 14.71 + y * 27.13 + z * 8.33) +
          Math.sin(x * 3.53 - y * 11.41 + z * 17.19)) * 0.019;
        const ventricular =
          (((Math.abs(xx) - 0.105) / 0.095) ** 2 +
            ((yy + 0.08) / 0.19) ** 2 +
            ((zz - 0.19) / 0.13) ** 2) < 1;
        let value = 0.018 + Math.abs(granular) * 0.3;
        if (ellipsoid < 0.95) {
          value = ellipsoid < 0.63
            ? 0.64 + granular * 1.8
            : 0.46 + waves * 2.2 + granular;
          if (ventricular) value = 0.12 + granular;
          if (ellipsoid > 0.90) value = 0.85 + granular * 0.5;
        } else if (ellipsoid < 1.01) {
          value = 0.25 + granular;
        }
        data[x + nx * (y + ny * z)] = Math.max(0, Math.min(1, value));
      }
    }
  }

  return { name: 'Synthetic brain phantom', source: 'demo', dims,
    spacing: [1, 1, 1], data, low: 0, high: 1 };
}

function percentileWindow(data: Float32Array): [number, number] {
  const samples: number[] = [];
  const stride = Math.max(1, Math.floor(data.length / 25000));
  for (let i = 0; i < data.length; i += stride) {
    if (Number.isFinite(data[i])) samples.push(data[i]);
  }
  samples.sort((a, b) => a - b);
  if (!samples.length) return [0, 1];
  const low = samples[Math.floor((samples.length - 1) * 0.01)];
  const high = samples[Math.floor((samples.length - 1) * 0.99)];
  return high > low ? [low, high] : [low - 0.5, low + 0.5];
}

/** NIfTI-1, single-file .nii or gzip .nii.gz, first 3D volume only. */
export async function readNifti(file: File): Promise<Volume> {
  if (file.size > 180 * 1024 * 1024) {
    throw new Error('File exceeds the 180 MB input limit for this browser viewer.');
  }
  let raw = await file.arrayBuffer();
  const signature = new Uint8Array(raw, 0, Math.min(2, raw.byteLength));
  if (signature[0] === 0x1f && signature[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot unpack gzip. Try a .nii file.');
    }
    raw = await new Response(
      new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
  }
  if (raw.byteLength > 220 * 1024 * 1024) {
    throw new Error('Uncompressed dataset is too large for this viewer (220 MB limit).');
  }
  if (raw.byteLength < 352) throw new Error('File is too small to be a NIfTI-1 image.');
  const view = new DataView(raw);
  const little = view.getInt32(0, true) === 348;
  if (!little && view.getInt32(0, false) !== 348) {
    throw new Error('Expected a NIfTI-1 header (348 bytes). NIfTI-2 is not yet supported.');
  }
  const magic = String.fromCharCode(...new Uint8Array(raw, 344, 3));
  if (magic !== 'n+1') {
    throw new Error('Expected single-file NIfTI-1 (.nii or .nii.gz), not a paired header.');
  }
  const dimensionCount = view.getInt16(40, little);
  const dims: [number, number, number] = [
    view.getInt16(42, little),
    view.getInt16(44, little),
    view.getInt16(46, little),
  ];
  const timepoints = view.getInt16(48, little);
  if (dimensionCount < 3 || dims.some((d) => d < 2 || d > 2048)) {
    throw new Error('Only valid 3D images are supported.');
  }
  if (dimensionCount > 3 && timepoints > 1) {
    throw new Error('4D/time-series volumes are not yet supported. Export a single 3D volume.');
  }
  const count = dims[0] * dims[1] * dims[2];
  if (count > 25000000) {
    throw new Error('Volume exceeds the 25-million-voxel browser limit.');
  }
  const datatype = view.getInt16(70, little);
  const readers: Record<number, [number, (offset: number) => number]> = {
    2: [1, (o) => view.getUint8(o)],
    4: [2, (o) => view.getInt16(o, little)],
    8: [4, (o) => view.getInt32(o, little)],
    16: [4, (o) => view.getFloat32(o, little)],
    64: [8, (o) => view.getFloat64(o, little)],
    256: [1, (o) => view.getInt8(o)],
    512: [2, (o) => view.getUint16(o, little)],
    768: [4, (o) => view.getUint32(o, little)],
  };
  const decoder = readers[datatype];
  if (!decoder) throw new Error('Unsupported NIfTI datatype: ' + datatype);
  const [bytesPerVoxel, decode] = decoder;
  const bitsPerVoxel = view.getInt16(72, little);
  if (bitsPerVoxel !== bytesPerVoxel * 8) throw new Error('Inconsistent NIfTI bit depth.');
  const offset = Math.max(352, Math.ceil(view.getFloat32(108, little)));
  if (!Number.isFinite(offset) || offset + count * bytesPerVoxel > raw.byteLength) {
    throw new Error('The voxel data is missing or truncated.');
  }
  const slope = view.getFloat32(112, little);
  const intercept = view.getFloat32(116, little);
  const scale = Number.isFinite(slope) && slope !== 0 ? slope : 1;
  const shift = Number.isFinite(intercept) && slope !== 0 ? intercept : 0;
  const data = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const value = decode(offset + i * bytesPerVoxel) * scale + shift;
    data[i] = Number.isFinite(value) ? value : 0;
  }
  const spacing: [number, number, number] = [80, 84, 88].map(
    (o) => Math.abs(view.getFloat32(o, little)) || 1,
  ) as [number, number, number];
  const [low, high] = percentileWindow(data);
  return { name: file.name, source: 'nifti', dims, spacing, data, low, high };
}
