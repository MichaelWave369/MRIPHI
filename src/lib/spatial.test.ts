import { describe, expect, it } from 'vitest';
import {
  applyAffine, createSpatial, gridToWorld, invertAffine, parseSpatial,
  spatialCenter, worldToGrid, type Matrix3x4,
} from './spatial';
import { positionFromCanvas, sampleVolume, sliceSize } from './viewer';
import type { Volume } from './volume';

const dims: [number,number,number]=[2,3,4];
const diag: Matrix3x4=[1,0,0,0, 0,1,0,0, 0,0,1,0];
const newHeader=()=>new DataView(new ArrayBuffer(352));
const spacings:[number,number,number]=[1,2,3];

describe('NIfTI RAS+ spatial handling',()=>{
  it('inverts a translated and rotated affine without changing voxel anatomy',()=>{
    const m:Matrix3x4=[0,-2,0,42, 1,0,0,-30, 0,0,3,11];
    const inv=invertAffine(m);
    expect(inv).not.toBeNull();
    const origin={x:1,y:2,z:3};
    const world=applyAffine(m,origin);
    expect(world).toEqual({x:38,y:-29,z:20});
    const back=applyAffine(inv!,world);
    expect(back.x).toBeCloseTo(origin.x,7);
    expect(back.y).toBeCloseTo(origin.y,7);
    expect(back.z).toBeCloseTo(origin.z,7);
  });

  it('prefers valid sform to qform and respects voxel flips',()=>{
    const header=newHeader();
    header.setInt16(254,1,true);
    header.setInt16(252,1,true);
    const m:Matrix3x4=[-2,0,0,20, 0,3,0,-10, 0,0,4,5];
    for(let row=0;row<3;row++)
      for(let col=0;col<4;col++)
        header.setFloat32(280+16*row+4*col,m[4*row+col],true);
    header.setUint8(123,2);
    const spatial=parseSpatial(header,true,dims,spacings);
    expect(spatial.source).toBe('sform');
    expect(spatial.units).toBe('mm');
    expect(applyAffine(spatial.affine,{x:1,y:2,z:3})).toEqual({x:18,y:-4,z:17});
    expect(spatial.oblique).toBe(false);
  });

  it('constructs qform quaternion rotation and negative qfac',()=>{
    const header=newHeader();
    header.setInt16(252,1,true);
    header.setFloat32(76,-1,true);
    header.setFloat32(264,Math.SQRT1_2,true); // 90-degree Z rotation
    header.setFloat32(268,7,true);
    header.setFloat32(272,8,true);
    header.setFloat32(276,9,true);
    header.setUint8(123,2);
    const spatial=parseSpatial(header,true,dims,spacings);
    expect(spatial.source).toBe('qform');
    const p=applyAffine(spatial.affine,{x:1,y:1,z:1});
    expect(p.x).toBeCloseTo(5,5);
    expect(p.y).toBeCloseTo(9,5);
    expect(p.z).toBeCloseTo(6,5);
  });

  it('handles oblique reslicing with trilinear sampling in source voxels',()=>{
    const c=Math.SQRT1_2;
    const m:Matrix3x4=[c,-c,0,0,c,c,0,0,0,0,1,0];
    const spatial=createSpatial([2,2,2],m,'sform');
    expect(spatial.oblique).toBe(true);
    const volume:Volume={
      name:'test',source:'nifti',dims:[2,2,2],spacing:[1,1,1],
      data:new Float32Array([0,10,20,30,40,50,60,70]),
      low:0,high:70,spatial,
    };
    const world=applyAffine(spatial.affine,{x:0.5,y:0.5,z:0.5});
    expect(sampleVolume(volume,world)).toBeCloseTo(35,5);
    expect(sampleVolume(volume,{x:100,y:100,z:100})).toBeNull();
    expect(sliceSize(volume,'axial')).toEqual(spatial.gridDims.slice(0,2));
    const click=positionFromCanvas(volume,'axial',1,0);
    expect(click.x).toBeCloseTo(spatial.bounds.max.x,6);
    expect(click.y).toBeCloseTo(spatial.bounds.max.y,6);
  });

  it('reverses left/right sampled voxels when sform reverses x',()=>{
    const spatial=createSpatial([2,2,2],[-1,0,0,1, 0,1,0,0, 0,0,1,0],'sform');
    const volume:Volume={
      name:'flipped',source:'nifti',dims:[2,2,2],spacing:[1,1,1],
      data:new Float32Array([3,9,3,9,3,9,3,9]),low:0,high:9,spatial,
    };
    expect(sampleVolume(volume,{x:0,y:0,z:0})).toBe(9);
    expect(sampleVolume(volume,{x:1,y:0,z:0})).toBe(3);
  });

  it('flags missing/invalid transforms instead of claiming anatomical orientation',()=>{
    const header=newHeader();
    header.setInt16(254,1,true);
    // Singular sform must not be trusted.
    const spatial=parseSpatial(header,true,dims,spacings);
    expect(spatial.source).toBe('unverified');
    expect(spatial.units).toBe('assumed mm');
  });

  it('applies meter conversion and keeps grid/crosshairs within view',()=>{
    const header=newHeader();
    header.setInt16(254,1,true);
    for(let row=0;row<3;row++)header.setFloat32(280+16*row+4*row,.002,true);
    header.setUint8(123,1);
    const spatial=parseSpatial(header,true,dims,spacings);
    expect(spatial.source).toBe('sform');
    expect(spatial.affine[0]).toBeCloseTo(2);
    const center=spatialCenter(spatial);
    const mid=worldToGrid(spatial,0,center.x);
    expect(gridToWorld(spatial,0,mid)).toBeGreaterThanOrEqual(spatial.bounds.min.x);
    expect(gridToWorld(spatial,0,mid)).toBeLessThanOrEqual(spatial.bounds.max.x);
  });

  it('rejects singular transforms explicitly',()=>{
    expect(invertAffine([1,0,0,0, 2,0,0,0, 0,0,1,0])).toBeNull();
    expect(invertAffine(diag)).not.toBeNull();
  });
});
