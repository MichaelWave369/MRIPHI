import { useMemo } from 'react';
import type { Position, Volume } from './lib/volume';
import {
  buildReceipt, computeHistogram, distanceBetween, distanceUnit,
  inspectPoint, type Marks,
} from './lib/inspector';

const print = (value: number) => Number.isFinite(value) ? String(Number(value.toPrecision(6))) : '—';
const printPosition = (point: Position) =>
  [point.x, point.y, point.z].map((n) => n.toFixed(1)).join(' / ');

type Props = {
  volume: Volume;
  position: Position;
  marks: Marks;
  onMark: (key: 'A' | 'B') => void;
  onClear: () => void;
};

export function ScanInspector({ volume, position, marks, onMark, onClear }: Props) {
  const histogram = useMemo(() => computeHistogram(volume), [volume]);
  const probe = useMemo(() => inspectPoint(volume, position), [volume, position]);
  const unit = distanceUnit(volume);
  const measured = marks.A && marks.B ? distanceBetween(marks.A.world, marks.B.world) : null;
  const maximum = Math.max(1, ...histogram.bins);
  const bins = histogram.bins;
  const verifiedSpatial = volume.spatial.source === 'sform' || volume.spatial.source === 'qform';

  const download = () => {
    const receipt = buildReceipt(volume, marks, new Date().toISOString());
    const url = URL.createObjectURL(new Blob([receipt], { type: 'application/json' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = 'MRIPHI-scan-inspector-receipt.json';
      link.click();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  };

  return (
    <section className="inspector-panel" aria-labelledby="inspector-title">
      <header className="inspector-heading">
        <div>
          <span className="section-kicker">R3 / REPRODUCIBLE OBSERVATIONS</span>
          <h3 id="inspector-title">Scan inspector<span className="heading-period">.</span></h3>
          <p>Read voxel intensity, explore the image distribution, and compare two crosshair positions. All calculations run locally.</p>
        </div>
        <span className="mini-tag">NO DIAGNOSIS · NO UPLOADS</span>
      </header>

      <div className="inspector-grid">
        <article className="inspector-card">
          <div className="inspector-card-head"><span className="panel-number">01 /</span><strong>Crosshair probe</strong><span className="inspector-light" /></div>
          <div className="inspector-meta">CURRENT WORLD POSITION</div>
          <div className="inspector-primary mono">{printPosition(position)}</div>
          <div className="inspector-field-list">
            <div><span>Voxel index (continuous)</span><strong>{probe ? printPosition(probe.voxel) : 'Outside scan'}</strong></div>
            <div><span>Nearest voxel (i/j/k)</span><strong>{probe ? probe.nearest.join(' / ') : '—'}</strong></div>
            <div><span>Raw voxel intensity</span><strong>{probe ? print(probe.nearestValue) : '—'}</strong></div>
            <div><span>Interpolated intensity</span><strong>{probe?.interpolatedValue !== null && probe?.interpolatedValue !== undefined ? print(probe.interpolatedValue) : '—'}</strong></div>
            <div><span>Spatial source</span><strong>{volume.spatial.source.toUpperCase()}</strong></div>
          </div>
          <p className="inspector-footnote">MRI signal intensities are not standardized tissue measurements. The interpolated value is a display sample, not a biological property.</p>
        </article>

        <article className="inspector-card">
          <div className="inspector-card-head"><span className="panel-number">02 /</span><strong>Intensity distribution</strong><span className="inspector-light" /></div>
          <div className="inspector-histogram" role="img" aria-label={'A 64-bin histogram representing ' + histogram.withinWindow + ' sampled voxels within the image intensity window.'}>
            <svg viewBox="0 0 512 145" preserveAspectRatio="none" aria-hidden="true">
              <g stroke="#416077" strokeOpacity=".55" strokeWidth="1">
                <line x1="0" y1="24" x2="512" y2="24"/>
                <line x1="0" y1="72" x2="512" y2="72"/>
                <line x1="0" y1="119" x2="512" y2="119"/>
              </g>
              {bins.map((bin, i) => {
                const height = bin === 0 ? 0 : Math.sqrt(bin / maximum) * 112;
                return <rect key={i} x={i * 8 + 1} y={119 - height} width="6.2" height={height}
                  rx="1" fill={i < 4 || i > 59 ? '#f0bf8b' : '#88e1c4'} opacity={.8 + (bin / maximum) * .2} />;
              })}
            </svg>
          </div>
          <div className="inspector-chart-labels"><span>{print(histogram.min)}</span><span>DISPLAY INTENSITY WINDOW</span><span>{print(histogram.max)}</span></div>
          <div className="inspector-field-list">
            <div><span>Sampled voxels</span><strong>{histogram.sampled.toLocaleString()}</strong></div>
            <div><span>Within 1–99% window</span><strong>{histogram.withinWindow.toLocaleString()}</strong></div>
            <div><span>Below / above window</span><strong>{histogram.belowWindow.toLocaleString()} / {histogram.aboveWindow.toLocaleString()}</strong></div>
            <div><span>Non-finite samples</span><strong>{histogram.invalid}</strong></div>
          </div>
          <p className="inspector-footnote">Deterministically subsampled, 64 bins. Display uses square-root scaling and ignores out-of-window intensities. No tissue or disease inference.</p>
        </article>

        <article className="inspector-card">
          <div className="inspector-card-head"><span className="panel-number">03 /</span><strong>Two-point research ledger</strong><span className="inspector-light" /></div>
          <div className="inspector-mark-actions">
            <button type="button" onClick={() => onMark('A')} disabled={!probe} className="inspector-mark mark-a">CAPTURE POINT A</button>
            <button type="button" onClick={() => onMark('B')} disabled={!probe} className="inspector-mark mark-b">CAPTURE POINT B</button>
          </div>
          <div className="inspector-marked">
            <div><span>A</span><strong>{marks.A ? printPosition(marks.A.world) : 'No point captured'}</strong></div>
            <div><span>B</span><strong>{marks.B ? printPosition(marks.B.world) : 'No point captured'}</strong></div>
          </div>
          <div className="inspector-distance">
            <span>POINT-TO-POINT DISTANCE</span>
            <strong>{measured === null ? '—' : print(measured)} <small>{measured === null ? '' : unit.label}</small></strong>
          </div>
          <p className="inspector-footnote">{unit.explanation} {verifiedSpatial && volume.spatial.units === 'mm' ? 'This is a coordinate distance, not a segmented anatomical measurement.' : ''}</p>
          <div className="inspector-export-actions">
            <button type="button" onClick={download} className="primary-action">↓ EXPORT JSON RECEIPT</button>
            <button type="button" onClick={onClear} className="inspector-reset" disabled={!marks.A && !marks.B}>CLEAR MARKS</button>
          </div>
          <p className="inspector-privacy">Export includes the local file name and spatial coordinates. Review for identifying details before sharing.</p>
        </article>
      </div>
    </section>
  );
}
