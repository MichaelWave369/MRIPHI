/**
 * MRIΦ spatial coordinates.
 *
 * A NIfTI qform/sform maps voxel index (i,j,k) to RAS+ coordinates:
 * world X = Right, Y = Anterior, Z = Superior.
 * The viewer presents neurological orientation (patient right at screen right).
 * RAS coordinates are only claimed when a valid qform or sform exists.
 */
import type { Position } from './volume';

export type Matrix3x4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export type SpatialSource = 'demo' | 'sform' | 'qform' | 'unverified';

export type Spatial = {
  affine: Matrix3x4;
  inverse: Matrix3x4;
  source: SpatialSource;
  units: 'mm' | 'assumed mm';
  bounds: { min: Position; max: Position };
  gridDims: [number, number, number];
  oblique: boolean;
};

export function applyAffine(matrix: Matrix3x4, point: Position): Position {
  const { x, y, z } = point;
  return {
    x: matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    y: matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    z: matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
  };
}

/** Reject singular, non-finite, and badly conditioned transforms. */
export function invertAffine(m: Matrix3x4): Matrix3x4 | null {
  if (!m.every(Number.isFinite)) return null;
  const [a,b,c,tx,d,e,f,ty,g,h,i,tz] = m;
  const det = a * (e*i-f*h) - b * (d*i-f*g) + c * (d*h-e*g);
  const lengths = [
    Math.hypot(a,d,g), Math.hypot(b,e,h), Math.hypot(c,f,i),
  ];
  const scale = lengths[0] * lengths[1] * lengths[2];
  if (!Number.isFinite(scale) || scale <= 1e-15 || Math.abs(det) / scale < 1e-6) return null;
  const n: Matrix3x4 = [
    (e*i-f*h)/det, (c*h-b*i)/det, (b*f-c*e)/det, 0,
    (f*g-d*i)/det, (a*i-c*g)/det, (c*d-a*f)/det, 0,
    (d*h-e*g)/det, (b*g-a*h)/det, (a*e-b*d)/det, 0,
  ];
  n[3] = -(n[0]*tx+n[1]*ty+n[2]*tz);
  n[7] = -(n[4]*tx+n[5]*ty+n[6]*tz);
  n[11] = -(n[8]*tx+n[9]*ty+n[10]*tz);
  return n.every(Number.isFinite) ? n : null;
}

function isOblique(m: Matrix3x4): boolean {
  // A simple axis permutation / flip is not oblique. Shear/rotation can be.
  for (let row = 0; row < 3; row++) {
    const v = [m[row*4],m[row*4+1],m[row*4+2]].map(Math.abs);
    const largest = Math.max(...v);
    if (largest > 0 && v.filter((n) => n > largest * 1e-3).length > 1) return true;
  }
  return false;
}

export function createSpatial(
  dims: [number, number, number],
  affine: Matrix3x4,
  source: SpatialSource,
  units: Spatial['units'] = 'mm',
): Spatial {
  const inverse = invertAffine(affine);
  if (!inverse) throw new Error('Invalid spatial affine');
  const points: Position[] = [];
  for (const i of [0, dims[0]-1]) for (const j of [0, dims[1]-1])
    for (const k of [0, dims[2]-1])
      points.push(applyAffine(affine, {x:i,y:j,z:k}));
  const min: Position = {
    x: Math.min(...points.map(p=>p.x)),
    y: Math.min(...points.map(p=>p.y)),
    z: Math.min(...points.map(p=>p.z)),
  };
  const max: Position = {
    x: Math.max(...points.map(p=>p.x)),
    y: Math.max(...points.map(p=>p.y)),
    z: Math.max(...points.map(p=>p.z)),
  };
  // Bound the rendering grid for large or oblique datasets. The view is
  // sampled on demand, not an additional in-memory 3D image volume.
  const columnSpacing = [0,1,2].map(j => Math.hypot(affine[j],affine[4+j],affine[8+j]));
  const natural = Math.max(.1, Math.min(...columnSpacing));
  const step = Math.max(natural, Math.max(
    (max.x-min.x)/383, (max.y-min.y)/383, (max.z-min.z)/383,
  ));
  const gridDims: [number,number,number] = [max.x-min.x,max.y-min.y,max.z-min.z]
    .map(span => Math.max(2,Math.min(384,Math.ceil(span/step)+1))) as [number,number,number];
  return {affine,inverse,source,units,bounds:{min,max},gridDims,oblique:isOblique(affine)};
}

/** World coordinate at resliced grid position. */
export function gridToWorld(spatial: Spatial, axis: 0|1|2, index: number): number {
  const keys = ['x','y','z'] as const;
  const key = keys[axis];
  const min=spatial.bounds.min[key],max=spatial.bounds.max[key];
  return min + (max-min) * Math.max(0,Math.min(1,index/(spatial.gridDims[axis]-1)));
}

export function worldToGrid(spatial: Spatial, axis: 0|1|2, coord: number): number {
  const keys=['x','y','z'] as const;
  const key=keys[axis];
  const {min,max}=spatial.bounds;
  if(max[key]===min[key]) return 0;
  return Math.max(0,Math.min(spatial.gridDims[axis]-1,
    Math.round((coord-min[key])/(max[key]-min[key])*(spatial.gridDims[axis]-1))));
}

export function spatialCenter(spatial: Spatial): Position {
  const {min,max}=spatial.bounds;
  return { x:(min.x+max.x)/2, y:(min.y+max.y)/2, z:(min.z+max.z)/2 };
}

const fallback = (dims: [number,number,number], spacing: [number,number,number]) =>
  createSpatial(dims, [
    spacing[0],0,0,0,
    0,spacing[1],0,0,
    0,0,spacing[2],0,
  ],'unverified','assumed mm');

export function parseSpatial(
  view: DataView,
  little: boolean,
  dims: [number,number,number],
  spacing: [number,number,number],
): Spatial {
  // xyzt_units low 3 bits: 1=m, 2=mm, 3=µm, otherwise unspecified.
  const unitCode = view.getUint8(123)&7;
  const multiplier = unitCode === 1 ? 1000 : unitCode === 3 ? .001 : 1;
  const units: Spatial['units'] = [1,2,3].includes(unitCode) ? 'mm' : 'assumed mm';
  const sformCode=view.getInt16(254,little);
  const qformCode=view.getInt16(252,little);

  if(sformCode>0){
    const rows: number[]=[];
    for(const start of [280,296,312])for(let col=0;col<4;col++)
      rows.push(view.getFloat32(start+4*col,little)*multiplier);
    const matrix=rows as Matrix3x4;
    if(invertAffine(matrix))return createSpatial(dims,matrix,'sform',units);
  }

  if(qformCode>0){
    let b=view.getFloat32(256,little), c=view.getFloat32(260,little), d=view.getFloat32(264,little);
    let norm=b*b+c*c+d*d;
    if(Number.isFinite(norm)){
      if(norm>1){const fac=1/Math.sqrt(norm);b*=fac;c*=fac;d*=fac;norm=1;}
      const a=Math.sqrt(Math.max(0,1-norm));
      const [dx,dy,dz]=spacing;
      const qfac=view.getFloat32(76,little)<0 ? -1 : 1;
      const tx=view.getFloat32(268,little)*multiplier;
      const ty=view.getFloat32(272,little)*multiplier;
      const tz=view.getFloat32(276,little)*multiplier;
      const m:Matrix3x4=[
        (a*a+b*b-c*c-d*d)*dx*multiplier, 2*(b*c-a*d)*dy*multiplier, 2*(b*d+a*c)*dz*qfac*multiplier, tx,
        2*(b*c+a*d)*dx*multiplier, (a*a+c*c-b*b-d*d)*dy*multiplier, 2*(c*d-a*b)*dz*qfac*multiplier, ty,
        2*(b*d-a*c)*dx*multiplier, 2*(c*d+a*b)*dy*multiplier, (a*a+d*d-c*c-b*b)*dz*qfac*multiplier, tz,
      ];
      if(invertAffine(m))return createSpatial(dims,m,'qform',units);
    }
  }
  return fallback(dims,spacing.map(v=>v*multiplier) as [number,number,number]);
}
