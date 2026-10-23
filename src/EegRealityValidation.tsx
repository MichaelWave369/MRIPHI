import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { EegAnalysis } from './lib/eeg-analysis';
import { compareR6, createR6Request, parseR6Reference } from './lib/eeg-validation';
import type { R6Comparison } from './lib/eeg-validation';
import './reality-validation.css';

type Props = { analysis: EegAnalysis };

function saveJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const CLI = 'python scripts/mne_reference.py --edf /path/to/recording.edf --request MRIPHI-R6-validation-request.json --out MRIPHI-R6-mne-reference.json';

export function EegRealityValidation({ analysis }: Props) {
  const request = createR6Request(analysis);
  const [comparison, setComparison] = useState<R6Comparison | null>(null);
  const [error, setError] = useState('');
  const [importedEngine, setImportedEngine] = useState('');

  async function onReferenceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setComparison(null);
    setImportedEngine('');
    try {
      if (file.size > 100_000) throw Error('Reference file exceeds 100 KB.');
      const reference = parseR6Reference(await file.text());
      setComparison(compareR6(request, reference));
      setImportedEngine(reference.engine);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not read reference JSON.');
    }
  }

  return (
    <section className="r6-validation" aria-label="R6 Reality Validation">
      <div className="r6-heading">
        <div>
          <span className="section-kicker">R6 / REALITY VALIDATION</span>
          <h3>Independent cross-check<span className="heading-period">.</span></h3>
          <p>Compare MRIΦ's browser spectrum against the same EDF window analyzed separately with MNE-Python. The browser never uploads data.</p>
        </div>
        <strong className="r6-status">{comparison ? comparison.result : 'UNVERIFIED'}</strong>
      </div>

      <div className="r6-steps">
        <div>
          <span>01 / EXPORT</span>
          <p>Save the current channel, window, parameters and aggregated results. No raw EEG, filename or patient header is exported.</p>
          <button className="secondary-action" type="button"
            onClick={() => saveJson('MRIPHI-R6-validation-request.json', request)}>↓ EXPORT VERIFICATION REQUEST</button>
        </div>
        <div>
          <span>02 / COMPUTE</span>
          <p>Run our independent local reference script on the <b>same EDF recording</b>, selecting the file yourself.</p>
          <code className="r6-command">{CLI}</code>
          <a href="https://github.com/MichaelWave369/MRIPHI/blob/main/scripts/mne_reference.py"
            target="_blank" rel="noreferrer" className="r6-repo-link">MNE reference script on GitHub ↗</a>
          <p className="r6-install">Install in a local Python virtual environment: <code>python -m pip install -r scripts/requirements-reference.txt</code></p>
        </div>
        <div>
          <span>03 / COMPARE</span>
          <p>Import the JSON created by MNE. Metadata identity and aggregate measurements are checked with documented numerical tolerances.</p>
          <label className="secondary-action r6-import">
            ↑ IMPORT MNE REFERENCE
            <input className="visually-hidden" type="file" accept=".json,application/json" onChange={onReferenceFile} />
          </label>
        </div>
      </div>
      {analysis.provenance === 'synthetic' && <p className="r6-alert">
        <strong>SYNTHETIC SOURCE:</strong> the browser demo has no local EDF file. You can use the R6 protocol
        with a separately generated EDF fixture or an actual downloaded public dataset, not the browser-only synthetic demo.
      </p>}
      <div className="r6-dataset">
        <strong>PUBLIC REAL-DATA VALIDATION CANDIDATE</strong>
        <p>PhysioNet EEG Motor Movement/Imagery Database, version 1.0.0, subject S001 run R01. The recording is publicly accessible, but MRIΦ has not yet verified this file against MNE on your computer.</p>
        <a href="https://physionet.org/content/eegmmidb/1.0.0/S001/" target="_blank" rel="noreferrer">View PhysioNet dataset and license ↗</a>
      </div>
      {error && <div role="alert" className="error-bar"><strong>Validation import failed:</strong> {error}</div>}
      {comparison && (
        <div className="r6-results" role="status">
          <h4>{comparison.result === 'MATCH' ? 'Numerical agreement' : 'Mismatch detected'}</h4>
          <p>{comparison.summary}</p>
          <p>Reference engine (declared by the imported file): <strong>{importedEngine}</strong></p>
          <div className="r6-checks">
            {comparison.checks.map((check) =>
              <div className="r6-check" key={check.name}>
                <span className={check.outcome === 'PASS' ? 'r6-pass' : 'r6-fail'}>{check.outcome}</span>
                <strong>{check.name}</strong>
                <code>{check.observed}</code>
                <code>{check.reference}</code>
              </div>,
            )}
          </div>
          <p><b>Comparison settings:</b> 1% relative numerical tolerance (with small absolute floors), peak frequency within 1% of a frequency bin, and exact core metadata agreement.</p>
          <p><b>Provenance boundary:</b> {comparison.caveat}</p>
        </div>
      )}
      <p className="r6-disclaimer">Neither numerical agreement nor a real research recording demonstrates brain-to-brain telepathy, anomalous coupling, diagnostic validity, or consciousness state. Report mismatches and negative results in the research ledger.</p>
    </section>
  );
}
