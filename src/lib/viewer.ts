import type { Axis, Position, Volume } from './volume';

export function sliceSize(volume: Volume, axis: Axis): [number, number] {
  const [x, y, z] = volume.dims;
  if (axis === 'axial') return [x, y];
  if (axis === 'coronal') return [x, z];
  return [y, z];
}

export function positionFromCanvas(
  volume: Volume, axis: Axis, px: number, py: number,
): Partial<Position> {
  const [width, height] = sliceSize(volume, axis);
  const x = Math.min(width - 1, Math.max(0, Math.round(px * (width - 1))));
  const y = Math.min(height - 1, Math.max(0, Math.round((1 - py) * (height - 1))));
  if (axis === 'axial') return { x, y };
  if (axis === 'coronal') return { x, z: y };
  return { y: x, z: y };
}

export function paintSlice(
  canvas: HTMLCanvasElement,
  volume: Volume,
  axis: Axis,
  position: Position,
  brightness: number,
  contrast: number,
): void {
  const [width, height] = sliceSize(volume, axis);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const pixels = context.createImageData(width, height);
  const [nx, ny] = volume.dims;
  const dynamic = Math.max(1e-6, volume.high - volume.low);
  const center = (volume.low + volume.high) / 2 +
    (brightness - 50) / 100 * dynamic;
  const windowWidth = Math.max(1e-6, dynamic * (2.0 - contrast / 100 * 1.8));
  const bottom = center - windowWidth / 2;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const flippedY = height - 1 - j;
      let x = position.x, y = position.y, z = position.z;
      if (axis === 'axial') { x = i; y = flippedY; }
      else if (axis === 'coronal') { x = i; z = flippedY; }
      else { y = i; z = flippedY; }
      const raw = volume.data[x + nx * (y + ny * z)];
      const gray = Math.round(Math.min(1, Math.max(0,
        (raw - bottom) / windowWidth)) * 255);
      const at = (i + j * width) * 4;
      pixels.data[at] = gray;
      pixels.data[at + 1] = gray;
      pixels.data[at + 2] = gray;
      pixels.data[at + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const crossX = axis === 'sagittal' ? position.y : position.x;
  const crossY = axis === 'axial' ? position.y : position.z;
  context.lineWidth = Math.max(0.6, Math.min(width, height) / 170);
  context.strokeStyle = 'rgba(98, 244, 204, .78)';
  context.beginPath();
  context.moveTo(crossX + 0.5, 0);
  context.lineTo(crossX + 0.5, height);
  context.moveTo(0, height - crossY - 0.5);
  context.lineTo(width, height - crossY - 0.5);
  context.stroke();
  context.fillStyle = '#ffb69c';
  context.beginPath();
  context.arc(crossX + 0.5, height - crossY - 0.5,
    Math.max(1.7, Math.min(width, height) / 75), 0, Math.PI * 2);
  context.fill();
}
