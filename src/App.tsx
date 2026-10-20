import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { axisIndex, makeDemoVolume, readNifti, type Axis, type Position, type Volume } from './lib/volume';
import { paintSlice, positionFromCanvas, sliceSize } from './lib/viewer';
import './styles.css';

type Tab = 'explorer' | 'atlas' | 'about';
type RegionKey = 'hippocampus' | 'amygdala' | 'caudate' | 'putamen';

const REGIONS: {
  id: RegionKey; label: string; category: string; color: string;
  description: string; role: string; caution: string;
}[] = [
  {
    id: 'hippocampus', label: 'Hippocampus', category: 'MEDIAL TEMPORAL LOBE',
    color: '#70d9a5', role: 'Memory · learning · navigation',
    description: 'A paired structure important for forming and organizing memories, and for spatial navigation.',
    caution: 'Volume differences alone do not prove better memory or a cause for the difference.',
  },
  {
    id: 'amygdala', label: 'Amygdala', category: 'LIMBIC SYSTEM',
    color: '#f5a477', role: 'Emotion · salience · threat',
    description: 'Small paired nuclei involved in assigning emotional significance to experiences and supporting learning.',
    caution: 'It is not simply a “fear center,” and larger size does not mean greater emotional intelligence.',
  },
  {
    id: 'caudate', label: 'Caudate', category: 'BASAL GANGLIA',
    color: '#baa3ff', role: 'Learning · action selection',
    description: 'Part of the dorsal striatum, involved in action selection, learning, and cognitive control.',
    caution: 'A conventional MRI image does not directly measure neuron count or function.',
  },
  {
    id: 'putamen', label: 'Putamen', category: 'BASAL GANGLIA',
    color: '#76cbf5', role: 'Movement · habits · learning',
    description: 'A striatal structure involved in movement and learning patterns of behavior.',
    caution: 'This diagram is illustrative, not an automated segmentation of an uploaded scan.',
  },
];

const AXES: { axis: Axis; title: string; code: string; subtitle: string }[] = [
  { axis: 'axial', title: 'Axial', code: 'AX', subtitle: 'Top → bottom' },
  { axis: 'coronal', title: 'Coronal', code: 'CO', subtitle: 'Front → back' },
  { axis: 'sagittal', title: 'Sagittal', code: 'SA', subtitle: 'Side → side' },
];

function Logo() {
  return (
    <div className="brand" aria-label="MRI Phi">
      <div className="brand-icon">Φ</div>
      <div className="brand-word"><strong>MRI<span>Φ</span></strong><small>OPEN NEUROIMAGING STUDIO</small></div>
    </div>
  );
}

function SlicePanel({ volume, axis, title, code, subtitle, position, onMove, brightness, contrast }: {
  volume: Volume; axis: Axis; title: string; code: string; subtitle: string;
  position: Position; onMove: (updates: Partial<Position>) => void;
  brightness: number; contrast: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const index = position[axisIndex[axis]];
  const maxIndex = volume.dims[axis === 'sagittal' ? 0 : axis === 'coronal' ? 1 : 2] - 1;
  const [width, height] = sliceSize(volume, axis);

  useEffect(() => {
    if (canvasRef.current) paintSlice(canvasRef.current, volume, axis, position, brightness, contrast);
  }, [volume, axis, position, brightness, contrast]);

  const pickPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onMove(positionFromCanvas(
      volume, axis,
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    ));
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'MRIPHI-' + axis + '-slice-' + index + '.png';
    a.click();
  };

  return (
    <article className="slice-panel">
      <div className="slice-heading">
        <div><span className="axis-code">{code}</span><strong>{title}</strong><small>{subtitle}</small></div>
        <button type="button" className="icon-button" onClick={download} title="Save this view as PNG" aria-label={'Save ' + title + ' slice PNG'}>↧</button>
      </div>
      <div className="scan-container">
        <div className="scan-corner top-left" aria-hidden="true" />
        <div className="scan-corner bottom-right" aria-hidden="true" />
        <canvas
          ref={canvasRef}
          aria-label={title + ' MRI slice. Click to position crosshairs.'}
          role="img"
          onClick={pickPoint}
          style={{ aspectRatio: width + '/' + height }}
        />
        <span className="orientation-label">VOXEL SPACE</span>
      </div>
      <div className="slice-footer">
        <label htmlFor={'slider-' + axis}>SLICE POSITION</label>
        <span className="mono">{String(index + 1).padStart(3, '0')} <i>/</i> {String(maxIndex + 1).padStart(3, '0')}</span>
      </div>
      <input
        id={'slider-' + axis}
        className="range"
        type="range" min={0} max={maxIndex} step={1} value={index}
        onChange={(e) => onMove({ [axisIndex[axis]]: Number(e.target.value) })}
        aria-label={title + ' slice'}
      />
    </article>
  );
}

function BrainDiagram({ selected }: { selected: RegionKey }) {
  return (
    <div className="brain-illustration">
      <div className="brain-aura" />
      <svg viewBox="0 0 600 380" role="img" aria-label="Stylized educational diagram of brain regions, not anatomical segmentation">
        <defs>
          <linearGradient id="brain-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c3d0eb" stopOpacity=".37" />
            <stop offset="1" stopColor="#7989b6" stopOpacity=".12" />
          </linearGradient>
        </defs>
        <path d="M106 184 C82 158 99 119 124 113 C115 74 156 46 190 59 C219 17 284 22 315 53 C353 24 407 49 420 76 C457 68 496 106 482 147 C524 171 512 230 477 245 C484 282 445 311 409 301 C382 334 340 321 310 309 C280 339 236 317 218 302 C168 312 139 283 141 261 C101 252 86 216 106 184Z" fill="url(#brain-fill)" stroke="#a7bbdc" strokeOpacity=".6" strokeWidth="3"/>
        <g fill="none" stroke="#b5c8de" strokeOpacity=".24" strokeWidth="3" strokeLinecap="round">
          <path d="M177 72 C152 114 202 120 176 152 S154 205 192 223"/>
          <path d="M219 56 C230 92 190 117 225 149 S210 215 237 259"/>
          <path d="M274 43 C256 88 286 116 257 154 S284 209 269 269"/>
          <path d="M323 53 C307 93 343 114 317 161 S322 221 307 286"/>
          <path d="M370 62 C355 99 393 120 364 159 S387 206 352 260"/>
          <path d="M419 91 C394 119 443 159 408 195 S425 244 394 285"/>
          <path d="M137 179 C165 169 165 233 196 250"/>
          <path d="M467 175 C434 189 457 228 431 252"/>
        </g>
        <g strokeWidth="2">
          <path d="M240 218 C252 201 276 198 301 207 C323 213 348 227 368 231 C350 248 329 257 307 255 C275 251 254 246 240 218Z" fill="#70d9a5" opacity={selected === 'hippocampus' ? 1 : .55} stroke="#70d9a5"/>
          <ellipse cx="232" cy="224" rx="19" ry="16" fill="#f5a477" opacity={selected === 'amygdala' ? 1 : .55} stroke="#f5a477"/>
          <path d="M250 159 C268 122 320 127 349 143 C328 145 320 160 308 174 C286 178 264 175 250 159Z" fill="#baa3ff" opacity={selected === 'caudate' ? 1 : .55} stroke="#baa3ff"/>
          <ellipse cx="367" cy="179" rx="44" ry="24" transform="rotate(-18 367 179)" fill="#76cbf5" opacity={selected === 'putamen' ? 1 : .55} stroke="#76cbf5"/>
        </g>
        <g stroke="#bdd0e6" strokeWidth="1.5" opacity=".8">
          <path d="M257 243 L188 284 L108 284" fill="none"/>
          <path d="M226 237 L150 253 L85 253" fill="none"/>
          <path d="M290 140 L331 105 L410 105" fill="none"/>
          <path d="M403 177 L442 156 L515 156" fill="none"/>
        </g>
        <g fontSize="11" fill="#c8d7e9" fontFamily="sans-serif" letterSpacing="1">
          <text x="42" y="256">AMYGDALA</text>
          <text x="53" y="288">HIPPOCAMPUS</text>
          <text x="415" y="109">CAUDATE</text>
          <text x="520" y="160" textAnchor="end">PUTAMEN</text>
        </g>
      </svg>
      <div className="diagram-disclaimer">ILLUSTRATIVE SCHEMATIC · NOT REGISTERED TO MRI DATA</div>
    </div>
  );
}

function RegionSelector({ selected, onSelect }: {
  selected: RegionKey; onSelect: (id: RegionKey) => void;
}) {
  return (
    <div className="region-grid">
      {REGIONS.map((region) => (
        <button
          type="button"
          key={region.id}
          className={'region-choice ' + (selected === region.id ? 'is-active' : '')}
          style={{ '--region-color': region.color } as React.CSSProperties}
          onClick={() => onSelect(region.id)}
          aria-pressed={selected === region.id}
        >
          <span className="region-dot" />
          <span>{region.label}</span>
          <span className="choice-arrow">↗</span>
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('explorer');
  const [volume, setVolume] = useState<Volume>(() => makeDemoVolume());
  const [position, setPosition] = useState<Position>({ x: 64, y: 64, z: 48 });
  const [brightness, setBrightness] = useState(50);
  const [contrast, setContrast] = useState(55);
  const [regionId, setRegionId] = useState<RegionKey>('hippocampus');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pickerRef = useRef<HTMLInputElement>(null);
  const region = REGIONS.find((item) => item.id === regionId)!;

  const onMove = (update: Partial<Position>) => setPosition((old) => ({ ...old, ...update }));
  const useDemo = () => {
    setVolume(makeDemoVolume());
    setPosition({ x: 64, y: 64, z: 48 });
    setBrightness(50);
    setContrast(55);
    setError('');
    setTab('explorer');
  };

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const next = await readNifti(file);
      setVolume(next);
      setPosition({
        x: Math.floor(next.dims[0] / 2),
        y: Math.floor(next.dims[1] / 2),
        z: Math.floor(next.dims[2] / 2),
      });
      setBrightness(50);
      setContrast(55);
      setTab('explorer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <Logo />
        <nav className="nav" aria-label="Main navigation">
          {(['explorer', 'atlas', 'about'] as Tab[]).map((item) => (
            <button key={item} onClick={() => setTab(item)}
              className={tab === item ? 'nav-active' : ''}
              aria-current={tab === item ? 'page' : undefined}>
              {item === 'explorer' ? '01 / Explorer' : item === 'atlas' ? '02 / Anatomy' : '03 / About'}
            </button>
          ))}
        </nav>
        <a className="github-link" href="https://github.com/MichaelWave369/MRIPHI"
          target="_blank" rel="noreferrer">GITHUB <span aria-hidden="true">↗</span></a>
      </header>

      <main>
        <div className="hero">
          <div className="hero-content">
            <div className="eyebrow"><span className="live-dot" /> OPEN SOURCE · LOCAL FIRST · FOR EVERYONE</div>
            <h1>Explore the brain.<br /><em>Question everything.</em></h1>
            <p>An open neuroimaging studio for curious minds. Explore MRI slices, discover brain anatomy, and bring your own scans into the browser.</p>
            <div className="hero-actions">
              <button className="primary-action" onClick={() => pickerRef.current?.click()} disabled={loading}>
                <span aria-hidden="true">↑</span> {loading ? 'READING SCAN…' : 'OPEN AN MRI FILE'}
              </button>
              <button className="secondary-action" onClick={useDemo}>↺&nbsp; TRY THE DEMO</button>
              <input type="file" accept=".nii,.gz,.nii.gz" onChange={onImport} ref={pickerRef}
                className="visually-hidden" aria-label="Upload NIfTI scan from your computer" />
            </div>
            <p className="privacy-line"><span>◎</span> Files are processed on your device. Nothing is uploaded.</p>
          </div>
          <div className="hero-aside">
            <div className="orbit">Φ</div>
            <span>HUMAN CURIOSITY / UNLIMITED</span>
            <strong>NO GATEKEEPERS.<br />JUST QUESTIONS.</strong>
            <span className="index-number">208<span> / ∞</span></span>
          </div>
        </div>

        <div className="notice-bar" role="note">
          <span className="notice-symbol">!</span>
          <p><strong>Educational / research exploration only.</strong> MRIPHI is not a medical device and does not provide diagnoses or quantitative brain-region segmentation. Any supplied image remains in raw voxel orientation.</p>
        </div>
        {error && <div className="error-bar" role="alert"><strong>Could not open file:</strong> {error}</div>}

        {tab === 'explorer' && <>
          <div className="section-heading">
            <div><span className="section-kicker">01 / SPATIAL WORKSPACE</span><h2>Imaging explorer<span className="heading-period">.</span></h2></div>
            <span className={'dataset-badge ' + (volume.source === 'demo' ? 'demo' : 'real')}>
              <span className="live-dot" /> {volume.source === 'demo' ? 'SYNTHETIC DEMO' : 'LOCAL NIFTI FILE'}
            </span>
          </div>
          <div className="dataset-line"><span>DATASET</span><strong title={volume.name}>{volume.name}</strong><span>3D VOLUME · {volume.dims.join(' × ')} VOXELS</span></div>
          <div className="slice-grid">
            {AXES.map((spec) => (
              <SlicePanel key={spec.axis} {...spec} volume={volume} position={position}
                onMove={onMove} brightness={brightness} contrast={contrast} />
            ))}
          </div>
          <p className="slice-instruction">MOVE A SLIDER TO SCROLL THROUGH A PLANE · CLICK AN IMAGE TO REPOSITION THE SHARED CROSSHAIR · EXPORT ANY VIEW AS PNG</p>

          <div className="bottom-grid">
            <section className="control-card">
              <div className="card-heading"><span className="panel-number">A /</span><h3>Image controls</h3><span className="mini-tag">DISPLAY ONLY</span></div>
              <div className="control-row"><label htmlFor="brightness">WINDOW CENTER <span>{brightness}%</span></label>
                <input id="brightness" className="range" type="range" min="0" max="100" value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))} /></div>
              <div className="control-row"><label htmlFor="contrast">WINDOW CONTRAST <span>{contrast}%</span></label>
                <input id="contrast" className="range" type="range" min="0" max="100" value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))} /></div>
              <div className="control-note">Controls adjust screen brightness/contrast only. Original voxel values remain unchanged.</div>
              <div className="coordinates">
                <span>CROSSHAIR</span>
                <code>X {position.x} &nbsp; Y {position.y} &nbsp; Z {position.z}</code>
              </div>
            </section>
            <section className="control-card anatomy-teaser">
              <div className="card-heading"><span className="panel-number">B /</span><h3>Anatomy spotlight</h3><button className="text-action" onClick={() => setTab('atlas')}>OPEN ATLAS ↗</button></div>
              <div className="teaser-inner">
                <div className="region-icon" style={{ color: region.color }}>◉</div>
                <div><span className="section-kicker">{region.category}</span><h4>{region.label}</h4><p>{region.role}</p></div>
              </div>
              <RegionSelector selected={regionId} onSelect={setRegionId} />
              <p className="control-note">Atlas content is educational and is not mapped onto the displayed MRI.</p>
            </section>
          </div>
        </>}

        {tab === 'atlas' && <>
          <div className="section-heading">
            <div><span className="section-kicker">02 / INTERACTIVE REFERENCE</span><h2>The anatomy atlas<span className="heading-period">.</span></h2></div>
            <span className="dataset-badge demo">ILLUSTRATIVE · NOT SEGMENTED</span>
          </div>
          <div className="atlas-layout">
            <div className="atlas-visual">
              <div className="atlas-upper"><span>REGION OVERVIEW</span><span>REFERENCE FIGURE · 001</span></div>
              <BrainDiagram selected={regionId} />
              <RegionSelector selected={regionId} onSelect={setRegionId} />
            </div>
            <article className="region-detail" style={{ '--region-color': region.color } as React.CSSProperties}>
              <div className="detail-index">NEUROANATOMY / {String(REGIONS.findIndex((r) => r.id === regionId) + 1).padStart(2, '0')}</div>
              <div className="detail-sigil">◉</div>
              <span className="section-kicker">{region.category}</span>
              <h3>{region.label}</h3>
              <strong>{region.role}</strong>
              <p>{region.description}</p>
              <div className="note-block"><strong>RESEARCH LITERACY</strong><p>{region.caution}</p></div>
              <button className="text-action" onClick={() => setTab('explorer')}>← RETURN TO EXPLORER</button>
            </article>
          </div>
          <div className="atlas-footnote">Brain structure size and cognitive function are complex. Association does not prove causation. This reference is intended for learning, not for estimating structures in personal scans.</div>
        </>}

        {tab === 'about' && <>
          <div className="section-heading"><div><span className="section-kicker">03 / THE MANIFESTO</span><h2>Everybody gets a piece<span className="heading-period">.</span></h2></div></div>
          <div className="about-grid">
            <section className="about-lead">
              <span className="section-kicker">MRIΦ · MRIPHI</span>
              <h3>Brain science should inspire questions, not build walls.</h3>
              <p>MRIPHI is a free, open-source browser workspace for exploring volumetric neuroimaging. No accounts, no server-side file upload, and no paywall between you and a three-dimensional dataset.</p>
              <p>Start with a deliberately synthetic phantom or open a local single-volume NIfTI-1 scan. Explore axial, coronal, and sagittal planes together, then learn what brain regions do from the illustrated atlas.</p>
              <a href="https://github.com/MichaelWave369/MRIPHI" target="_blank" rel="noreferrer" className="primary-action about-link">VIEW SOURCE ON GITHUB ↗</a>
            </section>
            <section className="about-facts">
              <div><span>01 / INPUT</span><strong>.nii &amp; .nii.gz</strong><p>Single-file NIfTI-1, one 3D volume, common scalar datatypes. No DICOM or time-series in R0.</p></div>
              <div><span>02 / PRIVACY</span><strong>100% browser-side</strong><p>Scans stay in your current browser session. Nothing is uploaded or stored by MRIPHI.</p></div>
              <div><span>03 / INTERPRETATION</span><strong>Know the limits</strong><p>Raw voxel directions may not match anatomical left/right. No spatial registration, AI interpretation, or diagnosis.</p></div>
              <div><span>04 / OPEN SCIENCE</span><strong>MIT licensed</strong><p>Read, fork, study, improve. Start with sample neuroimaging datasets from <a href="https://openneuro.org/" target="_blank" rel="noreferrer">OpenNeuro ↗</a>.</p></div>
            </section>
          </div>
        </>}

        <div className="closing-band"><div><span>THE FUTURE OF SCIENCE IS OPEN.</span><strong>EXPLORE. VERIFY. SHARE.</strong></div><span className="closing-phi">Φ</span></div>
      </main>
      <footer><span>© MRIΦ / MRIPHI · AN OPEN-SOURCE COMMUNITY PROJECT</span><span>BUILT FOR CURIOSITY · NOT CLINICAL USE</span><a href="https://github.com/MichaelWave369/MRIPHI" target="_blank" rel="noreferrer">SOURCE ↗</a></footer>
    </div>
  );
}
