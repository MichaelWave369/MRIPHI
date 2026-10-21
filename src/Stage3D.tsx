import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import type { Axis, Position, Volume } from './lib/volume';
import { paintSlice } from './lib/viewer';
import { createStageGeometry, type StagePlaneGeometry } from './lib/stage';

const DEFAULT_CAMERA = { yaw: -34, pitch: 23, zoom: 1 };
const PLANE_NAMES: Record<Axis, string> = {
  axial: 'Axial',
  coronal: 'Coronal',
  sagittal: 'Sagittal',
};

function StagePlane({
  plane, volume, position, brightness, contrast,
}: {
  plane: StagePlaneGeometry;
  volume: Volume;
  position: Position;
  brightness: number;
  contrast: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      paintSlice(ref.current, volume, plane.axis, position, brightness, contrast);
    }
  }, [volume, plane.axis, position, brightness, contrast]);

  return (
    <div
      className={'stage-plane stage-plane-' + plane.axis}
      style={{
        width: plane.width,
        height: plane.height,
        marginLeft: -plane.width / 2,
        marginTop: -plane.height / 2,
        transform: 'translate3d(' + plane.x + 'px, ' + plane.y + 'px, ' + plane.z + 'px) ' + (plane.rotation === 'none' ? '' : plane.rotation),
      }}
    >
      <canvas
        ref={ref}
        aria-label={PLANE_NAMES[plane.axis] + ' slice in a three-dimensional coordinate stage'}
        role="img"
      />
    </div>
  );
}

/**
 * Lightweight CSS-3D tri-planar viewer.
 * Uses the exact R1 reslice implementation; it never fabricates anatomical
 * segmentation, textured brain surfaces, or true volumetric reconstruction.
 */
export function Stage3D({
  volume, position, brightness, contrast,
}: {
  volume: Volume;
  position: Position;
  brightness: number;
  contrast: number;
}) {
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [visible, setVisible] = useState<Axis[]>(['axial', 'coronal', 'sagittal']);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const geometry = useMemo(
    () => createStageGeometry(volume.spatial, position),
    [volume.spatial, position],
  );
  const verified = volume.spatial.source === 'sform' || volume.spatial.source === 'qform';

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const moveCamera = (dx: number, dy: number) => {
    setCamera((previous) => ({
      ...previous,
      yaw: previous.yaw + dx,
      pitch: clamp(previous.pitch + dy, -85, 85),
    }));
  };
  const toggle = (axis: Axis) => {
    setVisible((previous) => {
      if (previous.includes(axis) && previous.length === 1) return previous;
      return previous.includes(axis)
        ? previous.filter((a) => a !== axis)
        : [...previous, axis];
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, ...camera };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    setCamera({
      yaw: start.yaw + (event.clientX - start.x) * 0.45,
      pitch: clamp(start.pitch - (event.clientY - start.y) * 0.4, -85, 85),
      zoom: camera.zoom,
    });
  };
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-8, 0], ArrowRight: [8, 0],
      ArrowUp: [0, 8], ArrowDown: [0, -8],
    };
    if (keys[event.key]) {
      event.preventDefault();
      const [dx, dy] = keys[event.key];
      moveCamera(dx, dy);
    }
  };

  return (
    <section className="stage-section" aria-labelledby="stage-heading">
      <div className="stage-heading">
        <div>
          <span className="section-kicker">R2 / THREE-DIMENSIONAL WORKSPACE</span>
          <h3 id="stage-heading">The 3D slice stage<span className="heading-period">.</span></h3>
          <p>Three real imaging planes, intersecting in one coordinate system. Drag to orbit, then move the 2D slice sliders to explore the volume.</p>
        </div>
        <span className="mini-tag">INTERACTIVE · LOCAL ONLY</span>
      </div>
      <div className="stage-layout">
        <div
          className="stage-viewport"
          tabIndex={0}
          role="group"
          aria-label="3D MRI slice viewer. Drag to rotate. Use arrow keys to orbit."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <div className="stage-grid" aria-hidden="true" />
          <div className="stage-horizon" aria-hidden="true" />
          <div className="stage-view-label">ORTHOGONAL MULTIPLANAR RECONSTRUCTION</div>
          <div
            className="stage-world"
            style={{
              transform: 'rotateX(' + camera.pitch + 'deg) rotateY(' + camera.yaw + 'deg) scale(' + camera.zoom + ')',
            }}
          >
            {geometry.planes.filter((plane) => visible.includes(plane.axis)).map((plane) => (
              <StagePlane
                key={plane.axis}
                plane={plane}
                volume={volume}
                position={position}
                brightness={brightness}
                contrast={contrast}
              />
            ))}
          </div>
          <div className="stage-axis-hint">
            {verified ? 'RAS+ COORDINATES' : volume.source === 'demo' ? 'SYNTHETIC COORDINATES' : 'UNVERIFIED COORDINATES'}
            <span> · {visible.length} PLANE{visible.length === 1 ? '' : 'S'} VISIBLE</span>
          </div>
          <div className="stage-drag-hint">DRAG TO ORBIT · ARROW KEYS TO ROTATE</div>
        </div>

        <div className="stage-controls">
          <div className="stage-control-group">
            <span className="stage-control-title">01 / VISIBLE PLANES</span>
            {(['axial', 'coronal', 'sagittal'] as Axis[]).map((axis) => (
              <button
                type="button"
                key={axis}
                className={'stage-plane-toggle toggle-' + axis + (visible.includes(axis) ? ' toggle-on' : '')}
                aria-pressed={visible.includes(axis)}
                onClick={() => toggle(axis)}
                title={visible.length === 1 && visible.includes(axis) ? 'At least one plane must remain visible' : undefined}
              >
                <span className="stage-toggle-marker" />
                {PLANE_NAMES[axis]}
                <span aria-hidden="true">{visible.includes(axis) ? 'ON' : 'OFF'}</span>
              </button>
            ))}
          </div>
          <div className="stage-control-group">
            <span className="stage-control-title">02 / CAMERA VIEW</span>
            <div className="stage-camera-presets">
              <button type="button" onClick={() => setCamera(DEFAULT_CAMERA)}>ISOMETRIC</button>
              <button type="button" onClick={() => setCamera({ yaw: 0, pitch: 0, zoom: camera.zoom })}>FRONT</button>
              <button type="button" onClick={() => setCamera({ yaw: 0, pitch: 78, zoom: camera.zoom })}>TOP</button>
            </div>
            <div className="stage-camera-buttons" aria-label="Rotation controls">
              <button aria-label="Rotate left" type="button" onClick={() => moveCamera(-15, 0)}>←</button>
              <button aria-label="Tilt up" type="button" onClick={() => moveCamera(0, 15)}>↑</button>
              <button aria-label="Tilt down" type="button" onClick={() => moveCamera(0, -15)}>↓</button>
              <button aria-label="Rotate right" type="button" onClick={() => moveCamera(15, 0)}>→</button>
            </div>
          </div>
          <div className="stage-control-group">
            <label htmlFor="stage-zoom" className="stage-control-title">03 / ZOOM <span>{Math.round(camera.zoom * 100)}%</span></label>
            <input className="range" id="stage-zoom" type="range" min={65} max={150} value={Math.round(camera.zoom * 100)}
              onChange={(event) => setCamera((previous) => ({ ...previous, zoom: Number(event.target.value) / 100 }))} />
            <p className="stage-note">This is an interactive view of three resliced planes, not a 3D reconstruction of the brain surface or a volumetric tissue analysis.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
