import { useEffect, useState } from 'react';
import type { EdfRecording } from './lib/edf';
import { analyzeEdfChannel, eegAnalysisReceipt } from './lib/eeg-analysis';
import type { EegAnalysis } from './lib/eeg-analysis';
import './brainwave-lab.css';

type Props = {
  recording: EdfRecording;
  viewStartSeconds: number;
  viewWindowSeconds: number;
};

const COLORS = ['#86dfbf', '#a5afed', '#eeb98c', '#83b6ee', '#d7c88f'];

function formatPower(value: number): string {
  if (!Number.isFinite(value)) return 'unavailable';
  if (value === 0) return '0';
  if (value < 0.001 || value > 999999) return value.toExponential(2);
  return value.toFixed(value < 1 ? 4 : 2);
}

function SpectrumPlot({ data }: { data: EegAnalysis }) {
  const left = 70, top = 32, width = 900, height = 270, right = 25, bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxHz = Math.min(45, data.sampleRateHz / 2);
  const visible = data.frequenciesHz.flatMap((frequency, i) =>
    frequency <= maxHz ? [{ frequency, power: data.psd[i] }] : [],
  );
  const peakPower = Math.max(0, ...visible.map((point) => point.power));
  const highDb = peakPower > 0 ? 10 * Math.log10(peakPower) : 0;
  const lowDb = highDb - 60;
  const xPos = (f: number) => left + f / maxHz * plotWidth;
  const yPos = (power: number) => {
    const db = power > 0 ? 10 * Math.log10(power) : lowDb;
    return top + (1 - Math.max(0, Math.min(1, (db - lowDb) / (highDb - lowDb)))) * plotHeight;
  };
  const points = visible.map((point) =>
    xPos(point.frequency).toFixed(2) + ',' + yPos(point.power).toFixed(2),
  ).join(' ');
  const ticksHz = [0, 10, 20, 30, 40].filter((f) => f <= maxHz);
  const ticksDb = [0, 15, 30, 45, 60];

  return (
    <svg viewBox="0 0 900 270" className="brainwave-plot" role="img"
      aria-label="Log-scale Welch power spectral density plotted against frequency in hertz">
      <title>Selected channel spectrum</title>
      <desc>One-channel Welch estimate in units squared per hertz, with 60 decibels of display range relative to the largest plotted bin. No clinical interpretation.</desc>
      <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="#0b192a" />
      {data.bands.map((band, i) => {
        if (band.lowHz >= maxHz) return null;
        const clippedHigh = Math.min(maxHz, band.highHz);
        return <rect key={band.key} x={xPos(band.lowHz)} y={top}
          width={Math.max(0, xPos(clippedHigh) - xPos(band.lowHz))}
          height={plotHeight} fill={COLORS[i]} fillOpacity="0.065" />;
      })}
      {ticksDb.map((level) => {
        const y = top + level / 60 * plotHeight;
        return <g key={level}>
          <line x1={left} y1={y} x2={width - right} y2={y} stroke="#2b4258" strokeDasharray="4 5" />
          <text x={left - 10} y={y + 4} fill="#9cb9ce" textAnchor="end" fontSize="11">-{level}</text>
        </g>;
      })}
      {ticksHz.map((f) => <g key={f}>
        <line x1={xPos(f)} y1={top} x2={xPos(f)} y2={top + plotHeight} stroke="#294052" />
        <text x={xPos(f)} y={height - 25} fill="#9cb9ce" textAnchor="middle" fontSize="12">{f}</text>
      </g>)}
      <polyline points={points} stroke="#89e1c7" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
      <text x={left} y={18} fill="#9fb8cf" fontSize="12">PSD LEVEL (dB RELATIVE TO PLOT PEAK)</text>
      <text x={left + plotWidth / 2} y={height - 5} fill="#9fb8cf" fontSize="12" textAnchor="middle">FREQUENCY (Hz)</text>
    </svg>
  );
}

export function EegBrainwaveLab({ recording, viewStartSeconds, viewWindowSeconds }: Props) {
  const channels = recording.channels.filter((channel) => !channel.annotation && channel.samplesPerRecord > 0);
  const [selectedIndex, setSelectedIndex] = useState(channels[0]?.index ?? 0);
  const [analysis, setAnalysis] = useState<EegAnalysis | null>(null);
  const [error, setError] = useState('');
  const selectedChannel = channels.find((c) => c.index === selectedIndex) ?? channels[0];
  const duration = Math.min(4, viewWindowSeconds, recording.durationSeconds - viewStartSeconds);

  useEffect(() => {
    setSelectedIndex(channels[0]?.index ?? 0);
    setAnalysis(null);
    setError('');
  }, [recording]);
  useEffect(() => {
    setAnalysis(null);
    setError('');
  }, [viewStartSeconds, viewWindowSeconds, selectedIndex]);

  function runAnalysis() {
    if (!selectedChannel) return;
    try {
      const result = analyzeEdfChannel(recording, selectedChannel, viewStartSeconds, viewWindowSeconds);
      setAnalysis(result);
      setError('');
    } catch (problem) {
      setAnalysis(null);
      setError(problem instanceof Error ? problem.message : 'Could not analyze this segment.');
    }
  }

  function exportAnalysis() {
    if (!analysis) return;
    const link = document.createElement('a');
    const contents = JSON.stringify(eegAnalysisReceipt(analysis), null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    link.href = url;
    link.download = 'MRIPHI-R5-brainwave-research-receipt.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className="brainwave-lab" aria-label="R5 Brainwave Lab">
      <div className="brainwave-heading">
        <div>
          <span className="section-kicker">R5 / FREQUENCY &amp; SIGNAL ANALYSIS</span>
          <h3>Brainwave Lab<span className="heading-period">.</span></h3>
          <p>Explore one channel at a time with an explainable frequency estimate and descriptive recording indicators.</p>
        </div>
        <span className="dataset-badge demo">{recording.source === 'synthetic' ? 'SYNTHETIC · NOT HUMAN' : 'UNVERIFIED EDF SIGNAL'}</span>
      </div>
      <div className="brainwave-toolbar">
        <label htmlFor="brainwave-channel">ANALYZE CHANNEL
          <select id="brainwave-channel" value={selectedChannel?.index ?? 0}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}>
            {channels.map((channel) => <option key={channel.index} value={channel.index}>
              {channel.label} · {channel.sampleRate.toFixed(1)} Hz · {channel.unit}
            </option>)}
          </select>
        </label>
        <div className="brainwave-range">
          <span>FROM {viewStartSeconds.toFixed(2)} s</span>
          <strong>{duration.toFixed(2)} s analyzed maximum</strong>
          <span>Sampling {selectedChannel?.sampleRate.toFixed(1)} Hz</span>
        </div>
        <button className="primary-action" type="button" disabled={!selectedChannel} onClick={runAnalysis}>
          ↗ ANALYZE WINDOW
        </button>
      </div>
      {error && <div className="error-bar" role="alert">{error}</div>}
      {!analysis ? (
        <div className="brainwave-placeholder">
          <strong>NO SPECTRUM COMPUTED YET</strong>
          <p>Select an EDF channel, move the waveform timeline to the period you want to inspect,
            then choose <b>Analyze Window</b>. At most four seconds are analyzed per run.
            No cloud processing, diagnosis, emotion detection, or consciousness measurement.</p>
        </div>
      ) : (
        <>
          <div className="brainwave-summary">
            <div><span>WINDOW</span><strong>{analysis.startSeconds.toFixed(2)}–{(analysis.startSeconds + analysis.durationSeconds).toFixed(2)} s</strong></div>
            <div><span>WELCH SEGMENTS</span><strong>{analysis.welchSegments}</strong></div>
            <div><span>FREQUENCY RESOLUTION</span><strong>{analysis.frequencyResolutionHz.toFixed(3)} Hz</strong></div>
            <div><span>POWER UNITS</span><strong>{analysis.unit}²/Hz</strong></div>
          </div>
          <div className="brainwave-plot-wrap">
            <SpectrumPlot data={analysis} />
          </div>
          <p className="brainwave-method">
            Plot shown in dB relative to its peak for visibility. Computed PSD and band powers remain in header-reported physical units. No bandpass filtering was applied.
          </p>
          <div className="brainwave-bands">
            {analysis.bands.map((band, index) => (
              <div className="brainwave-band" key={band.key} style={{ borderTopColor: COLORS[index] }}>
                <span>{band.name.toUpperCase()} · {band.lowHz}–{band.highHz} Hz</span>
                <strong>{band.relativePercent === null ? 'N/A' : band.relativePercent.toFixed(1) + '%'}</strong>
                <small>{band.available ? formatPower(band.power!) + ' ' + analysis.unit + '²' : 'Exceeds Nyquist'}</small>
              </div>
            ))}
          </div>
          <p className="brainwave-method">Percentages are fractions of the measured 0.5–{Math.min(45, analysis.sampleRateHz / 2).toFixed(1)} Hz total power. N/A also applies when measured power is zero.</p>
          <div className="brainwave-indicators">
            <div><span>AC RMS</span><strong>{formatPower(analysis.acRms)} <small>{analysis.unit}</small></strong></div>
            <div><span>PEAK TO PEAK</span><strong>{formatPower(analysis.peakToPeak)} <small>{analysis.unit}</small></strong></div>
            <div><span>NEAR ADC RAIL</span><strong>{analysis.nearRailPercent.toFixed(2)}<small>% of samples</small></strong></div>
            <div><span>UNCHANGED SAMPLES</span><strong>{analysis.unchangedAdjacentPercent.toFixed(2)}<small>% adjacent pairs</small></strong></div>
          </div>
          <div className="brainwave-warnings" role="note">
            <strong>R5 EVIDENCE &amp; LIMITS</strong>
            <ul>{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            <button className="secondary-action" type="button" onClick={exportAnalysis}>↓ EXPORT ANALYSIS RECEIPT</button>
            <p>Receipts contain aggregated measurements which may still be sensitive. Review before sharing. No filename, patient header, channel label, or raw samples are exported.</p>
          </div>
        </>
      )}
    </section>
  );
}
