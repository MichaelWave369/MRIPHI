import { useEffect, useRef, useState } from 'react';
import './eeg.css';
import type { ChangeEvent } from 'react';
import { edfReceipt, readEdf, waveformEnvelope } from './lib/edf';
import { makeSyntheticEeg } from './lib/eeg-demo';
import { EegBrainwaveLab } from './EegBrainwaveLab';
import type { EdfChannel, EdfRecording } from './lib/edf';

const PAGE_SIZE = 8;
const CANVAS_WIDTH = 1160;
const CANVAS_HEIGHT = 656;
const COLORS = ['#86dfbf', '#8dc7ef', '#f4b48c', '#c4abed', '#e3dc91', '#81d7ce', '#e8a9c2', '#a8c79a'];

function drawWaveforms(
  canvas: HTMLCanvasElement,
  recording: EdfRecording,
  channels: EdfChannel[],
  startSeconds: number,
  spanSeconds: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const left = 174;
  const right = 30;
  const top = 48;
  const bottom = 48;
  const plotWidth = width - left - right;
  const rowHeight = (height - top - bottom) / Math.max(1, channels.length);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b1828';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'middle';
  const tickSeconds = spanSeconds <= 5 ? 0.5 : spanSeconds <= 10 ? 1 : 2;
  for (let t = 0; t <= spanSeconds + 0.0001; t += tickSeconds) {
    const x = left + t / spanSeconds * plotWidth;
    ctx.beginPath();
    ctx.moveTo(x, top - 6);
    ctx.lineTo(x, height - bottom);
    ctx.strokeStyle = '#29415a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#a0b1c5';
    ctx.textAlign = 'center';
    ctx.fillText((startSeconds + t).toFixed(1) + 's', x, 24);
  }
  channels.forEach((channel, row) => {
    const mid = top + (row + 0.5) * rowHeight;
    const halfHeight = Math.max(12, rowHeight * 0.36);
    ctx.fillStyle = row % 2 === 0 ? 'rgba(170, 205, 238, 0.028)' : 'rgba(0, 0, 0, 0.015)';
    ctx.fillRect(0, top + row * rowHeight, width, rowHeight);
    ctx.beginPath();
    ctx.moveTo(left, mid);
    ctx.lineTo(width - right, mid);
    ctx.strokeStyle = '#294052';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS[row % COLORS.length];
    ctx.font = 'bold 14px ui-monospace, Consolas, monospace';
    const label = channel.label.length > 19 ? channel.label.slice(0, 18) + '…' : channel.label;
    ctx.fillText(label, 13, mid - 11);
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#8ea8be';
    ctx.fillText(channel.sampleRate.toFixed(1) + ' Hz · ' + channel.unit, 13, mid + 13);

    const bins = Math.round(plotWidth);
    const waveform = waveformEnvelope(recording, channel, startSeconds, spanSeconds, bins);
    const values = waveform.filter((value) => Number.isFinite(value.min) && Number.isFinite(value.max));
    if (!values.length) {
      ctx.fillStyle = '#d7a9a9';
      ctx.fillText('NO SAMPLES IN WINDOW', left + 12, mid + 19);
      return;
    }
    const dataMin = Math.min(...values.map((v) => v.min));
    const dataMax = Math.max(...values.map((v) => v.max));
    const midpoint = (dataMax + dataMin) / 2;
    const radius = Math.max(1e-12, (dataMax - dataMin) / 2);
    ctx.beginPath();
    waveform.forEach((value, index) => {
      if (!Number.isFinite(value.min) || !Number.isFinite(value.max)) return;
      const x = left + index + 0.5;
      const yMin = mid - (value.min - midpoint) / radius * halfHeight;
      const yMax = mid - (value.max - midpoint) / radius * halfHeight;
      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    });
    ctx.strokeStyle = COLORS[row % COLORS.length];
    ctx.lineWidth = 1.15;
    ctx.stroke();
    ctx.fillStyle = '#7d9bb3';
    ctx.textAlign = 'right';
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.fillText('auto scale', width - right - 6, mid - halfHeight + 8);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b2c8d7';
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.fillText('RECORDING TIME (SECONDS)', left + plotWidth / 2, height - 18);
}

export function EegExplorer() {
  const picker = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [recording, setRecording] = useState<EdfRecording | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState(0);
  const [windowSeconds, setWindowSeconds] = useState(10);
  const [channelPage, setChannelPage] = useState(0);
  const channels = recording?.channels.filter((c) => !c.annotation && c.samplesPerRecord > 0) ?? [];
  const span = recording ? Math.min(windowSeconds, recording.durationSeconds) : windowSeconds;
  const maxStart = recording ? Math.max(0, recording.durationSeconds - span) : 0;
  const currentStart = Math.min(start, maxStart);
  const pageCount = Math.max(1, Math.ceil(channels.length / PAGE_SIZE));
  const currentPage = Math.min(channelPage, pageCount - 1);
  const visible = channels.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    if (recording && canvas.current) drawWaveforms(canvas.current, recording, visible, currentStart, span);
  }, [recording, currentStart, span, currentPage]);

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const loaded = await readEdf(file);
      setRecording(loaded);
      setStart(0);
      setChannelPage(0);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not read the EDF recording.');
    } finally {
      setBusy(false);
    }
  }

  function exportReceipt() {
    if (!recording) return;
    const contents = JSON.stringify(edfReceipt(recording), null, 2);
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    link.href = url;
    link.download = 'MRIPHI-EDF-research-receipt.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className="eeg-explorer">
      <div className="section-heading">
        <div><span className="section-kicker">03 / ELECTROPHYSIOLOGY WORKSPACE</span>
          <h2>EEG explorer<span className="heading-period">.</span></h2></div>
        <span className="dataset-badge demo">R5 · EEG + BRAINWAVE LAB</span>
      </div>
      <div className="eeg-intro">
        <div>
          <h3>Bring real brainwave recordings into MRIΦ.</h3>
          <p>Open a continuous EDF or EDF+C recording to view original channels as scaled waveforms, then inspect a single-channel power spectrum in Brainwave Lab.
            Sample data stay in this browser tab. This is a waveform viewer, not a clinical
            EEG interpreter or a measurement of thoughts, telepathy, or consciousness.</p>
        </div>
        <div className="eeg-upload-actions">
          <button className="primary-action" type="button" disabled={busy} onClick={() => picker.current?.click()}>
            {busy ? 'READING EDF…' : '↑ OPEN AN EDF FILE'}
          </button>
          <input ref={picker} className="visually-hidden" type="file" accept=".edf" onChange={onImport} aria-label="Open local EDF recording" />
          <button className="secondary-action" type="button" disabled={busy}
            onClick={() => { setRecording(makeSyntheticEeg()); setError(''); setStart(0); setChannelPage(0); }}>
            ◎ SYNTHETIC EEG DEMO
          </button>
          {recording && <button className="secondary-action" type="button" onClick={() => { setRecording(null); setError(''); setStart(0); }}>CLEAR SESSION</button>}
        </div>
      </div>
      <p className="eeg-privacy">LOCAL PROCESSING · NO ACCOUNT · NO RAW SIGNAL UPLOAD · 128 MiB FILE LIMIT</p>
      {error && <div role="alert" className="error-bar"><strong>EDF import failed:</strong> {error}</div>}
      {!recording ? (
        <div className="eeg-empty">
          <strong>AWAITING AN EDF RECORDING</strong>
          <p>Choose a .edf file exported by compatible EEG acquisition software or an open research dataset.
            No demo data are presented as human measurements.</p>
          <p>EDF+D (discontinuous time) and BDF (24-bit) are not supported in R4.</p>
        </div>
      ) : (
        <>
          <div className="eeg-recording-details" role="status">
            <div><span>DATASET</span><strong title={recording.name}>{recording.name}</strong></div>
            <div><span>FORMAT / PROVENANCE</span><strong>{recording.source === 'synthetic' ? 'SYNTHETIC DEMO' : recording.format + ' · LOCAL FILE'}</strong></div>
            <div><span>TIME</span><strong>{recording.durationSeconds.toFixed(1)} s</strong></div>
            <div><span>SIGNAL CHANNELS</span><strong>{channels.length}</strong></div>
          </div>
          <div className="eeg-controls">
            <label htmlFor="eeg-window">WINDOW
              <select id="eeg-window" value={windowSeconds} onChange={(e) => setWindowSeconds(Number(e.target.value))}>
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={20}>20 seconds</option>
              </select>
            </label>
            <div className="eeg-stepper">
              <button type="button" disabled={currentStart <= 0} onClick={() => setStart(Math.max(0, currentStart - span / 2))}>← BACK</button>
              <span>{currentStart.toFixed(1)}–{(currentStart + span).toFixed(1)} s</span>
              <button type="button" disabled={currentStart >= maxStart} onClick={() => setStart(Math.min(maxStart, currentStart + span / 2))}>FORWARD →</button>
            </div>
            <div className="eeg-stepper">
              <button type="button" disabled={currentPage === 0} onClick={() => setChannelPage(currentPage - 1)}>← CH</button>
              <span>Channels {currentPage * PAGE_SIZE + 1}–{Math.min(channels.length, (currentPage + 1) * PAGE_SIZE)} of {channels.length}</span>
              <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setChannelPage(currentPage + 1)}>CH →</button>
            </div>
          </div>
          <label className="eeg-timeline-label" htmlFor="eeg-timeline">RECORDING NAVIGATION · {recording.durationSeconds.toFixed(1)} SECONDS</label>
          <input id="eeg-timeline" className="range eeg-timeline" type="range" min={0} max={maxStart}
            step="any" value={currentStart} disabled={maxStart === 0}
            onChange={(e) => setStart(Number(e.target.value))} />
          <div className="eeg-canvas-wrap">
            <canvas ref={canvas} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
              role="img" aria-label="Multichannel EDF EEG waveforms, each row independently auto-scaled" />
          </div>
          <div className="eeg-result-footer">
            <span>RAW EDF SAMPLES · DISPLAY CALIBRATION FROM FILE HEADER · INDEPENDENT ROW SCALING</span>
            <button className="secondary-action" type="button" onClick={exportReceipt}>↓ EXPORT METADATA RECEIPT</button>
          </div>
          <EegBrainwaveLab recording={recording} viewStartSeconds={currentStart} viewWindowSeconds={span} />
          <div className="eeg-warnings" role="note">
            <strong>INTERPRETATION AND DATA LIMITS</strong>
            <ul>{recording.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            <p>Filename and channel labels can contain identifying information. The exported receipt omits the
              filename, patient header and raw samples, but you should still review it before sharing.</p>
          </div>
        </>
      )}
    </section>
  );
}
