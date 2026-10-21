import type { Axis, Position, Volume } from './volume';
import { applyAffine, gridToWorld } from './spatial';

/**
 * Each displayed plane is a true world-aligned RAS+ reslice when NIfTI
 * spatial metadata is valid. For missing spatial metadata the same engine
 * uses an UNVERIFIED, axis-aligned voxel fallback, without anatomical labels.
 */
export function sliceSize(volume: Volume, axis: Axis): [number, number] {
  const [x,y,z] = volume.spatial.gridDims;
  if (axis === 'axial') return [x,y];
  if (axis === 'coronal') return [x,z];
  return [y,z];
}

/** Convert a view pixel to RAS+ world coordinates (or unverified fallback axes). */
export function positionFromCanvas(
  volume: Volume, axis: Axis, px: number, py: number,
): Partial<Position> {
  const [width,height] = sliceSize(volume,axis);
  const col = Math.min(width-1, Math.max(0, Math.round(px*(width-1))));
  const row = Math.min(height-1, Math.max(0, Math.round((1-py)*(height-1))));
  if(axis==='axial')return {
    x: gridToWorld(volume.spatial,0,col), y: gridToWorld(volume.spatial,1,row),
  };
  if(axis==='coronal')return {
    x: gridToWorld(volume.spatial,0,col), z: gridToWorld(volume.spatial,2,row),
  };
  return {
    y: gridToWorld(volume.spatial,1,col), z: gridToWorld(volume.spatial,2,row),
  };
}

/** Tri-linear sample in original voxel space. Outside image bounds = black. */
export function sampleVolume(volume: Volume, world: Position): number | null {
  const voxel=applyAffine(volume.spatial.inverse,world);
  const [nx,ny,nz]=volume.dims;
  if(voxel.x < -1e-5 || voxel.y < -1e-5 || voxel.z < -1e-5 ||
    voxel.x > nx-1+1e-5 || voxel.y > ny-1+1e-5 || voxel.z > nz-1+1e-5)
    return null;
  const x=Math.max(0,Math.min(nx-1,voxel.x));
  const y=Math.max(0,Math.min(ny-1,voxel.y));
  const z=Math.max(0,Math.min(nz-1,voxel.z));
  const i0=Math.floor(x),i1=Math.min(nx-1,i0+1),u=x-i0;
  const j0=Math.floor(y),j1=Math.min(ny-1,j0+1),v=y-j0;
  const k0=Math.floor(z),k1=Math.min(nz-1,k0+1),w=z-k0;
  const d=volume.data;
  const base0=nx*ny*k0,base1=nx*ny*k1;
  const c000=d[i0+nx*j0+base0],c100=d[i1+nx*j0+base0],
    c010=d[i0+nx*j1+base0],c110=d[i1+nx*j1+base0];
  const c001=d[i0+nx*j0+base1],c101=d[i1+nx*j0+base1],
    c011=d[i0+nx*j1+base1],c111=d[i1+nx*j1+base1];
  return (
    (1-w)*((1-v)*((1-u)*c000+u*c100)+v*((1-u)*c010+u*c110))+
      w *((1-v)*((1-u)*c001+u*c101)+v*((1-u)*c011+u*c111))
  );
}

export function paintSlice(
  canvas: HTMLCanvasElement,
  volume: Volume,
  axis: Axis,
  position: Position,
  brightness: number,
  contrast: number,
): void {
  const [width,height]=sliceSize(volume,axis);
  if(canvas.width!==width)canvas.width=width;
  if(canvas.height!==height)canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context)return;
  const pixels=context.createImageData(width,height);
  const dynamic=Math.max(1e-6,volume.high-volume.low);
  const center=(volume.low+volume.high)/2+(brightness-50)/100*dynamic;
  const windowWidth=Math.max(1e-6,dynamic*(2.0-contrast/100*1.8));
  const bottom=center-windowWidth/2;
  const s=volume.spatial;
  const cx=axis==='sagittal' ? 1 : 0;
  const cy=axis==='axial' ? 1 : 2;
  const fixed=axis==='axial' ? 2 : axis==='coronal' ? 1 : 0;
  const keys=['x','y','z'] as const;
  const point:Position={...position};
  for(let row=0;row<height;row++){
    point[keys[cy]]=gridToWorld(s,cy,height-1-row);
    for(let col=0;col<width;col++){
      point[keys[cx]]=gridToWorld(s,cx,col);
      point[keys[fixed]]=position[keys[fixed]];
      const raw=sampleVolume(volume,point);
      const gray=raw===null ? 0 : Math.round(Math.min(1,Math.max(0,(raw-bottom)/windowWidth))*255);
      const p=(col+row*width)*4;
      pixels.data[p]=gray;pixels.data[p+1]=gray;pixels.data[p+2]=gray;pixels.data[p+3]=255;
    }
  }
  context.putImageData(pixels,0,0);
  const horizontal=position[keys[cx]],vertical=position[keys[cy]];
  const norm=(value:number,low:number,high:number) =>
    high===low ? .5 : Math.max(0,Math.min(1,(value-low)/(high-low)));
  const crossX=norm(horizontal,s.bounds.min[keys[cx]],s.bounds.max[keys[cx]])*(width-1);
  const crossY=(1-norm(vertical,s.bounds.min[keys[cy]],s.bounds.max[keys[cy]]))*(height-1);
  context.lineWidth=Math.max(.6,Math.min(width,height)/170);
  context.strokeStyle='rgba(98,244,204,.78)';
  context.beginPath();
  context.moveTo(crossX+.5,0);context.lineTo(crossX+.5,height);
  context.moveTo(0,crossY+.5);context.lineTo(width,crossY+.5);context.stroke();
  context.fillStyle='#ffb69c';context.beginPath();
  context.arc(crossX+.5,crossY+.5,Math.max(1.7,Math.min(width,height)/75),0,Math.PI*2);
  context.fill();
}
