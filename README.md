# MRIΦ / MRIPHI

**Explore the brain. Question everything. Everybody gets a piece.**

MRIΦ is a **free, MIT-licensed, local-first neuroimaging explorer** built in React + Vite. It offers three synchronized orthogonal slice views, a deliberately synthetic demonstration volume, a separate illustrated brain-anatomy reference, and continuous EDF waveform exploration with an R5 single-channel Brainwave Lab.

> **Important:** MRIPHI is an educational/research exploration project, **not a medical device**. It does not diagnose disease, quantify regional brain volumes, segment anatomical structures, or assess cognition. The sample phantom is computer-generated and is not a human MRI.

## R6 capabilities: Reality Validation (cross-tool verification)

The **03 / EEG → Brainwave Lab → R6 Reality Validation** panel compares MRIΦ's browser-computed channel spectrum against an **independently calculated** MNE-Python reference from a selected EDF file. A matching JSON result is a **numerical cross-check**, not clinical validation, file-authenticity proof, or evidence of anomalous physical coupling.

1. Download an openly licensed compatible EDF recording, for example **PhysioNet EEG Motor Movement/Imagery Database v1.0.0**, baseline S001R01.edf: https://physionet.org/content/eegmmidb/1.0.0/ (PhysioNet license: ODC Attribution 1.0). This is a 64-channel, 160 Hz EEG+ dataset; **EDF annotation channels are excluded** by our reader and timing is treated as continuous. The event labels aren't interpreted. This real-data dataset has not yet been cross-verified by our build.
2. Open the local EDF in MRIΦ's **03 / EEG** workspace, choose a signal channel, and click **ANALYZE WINDOW**.
3. In the **R6 Independent Cross-Check** panel, click **EXPORT VERIFICATION REQUEST** to save the aggregates and exact sample window. The request contains no raw signals, patient identifiers, filenames or channel labels.
4. On your own computer, create a Python environment and install the reference dependencies:

   ```bash
   python -m venv .venv
   # Activate .venv as appropriate for your operating system
   python -m pip install -r scripts/requirements-reference.txt
   ```

5. From your local checkout of the MRIPHI repository, run this with the **same original EDF**:

   ```bash
   python scripts/mne_reference.py --edf /path/to/S001R01.edf --request MRIPHI-R6-validation-request.json --out MRIPHI-R6-mne-reference.json
   ```

6. Use **IMPORT MNE REFERENCE** in the browser to compare sampling rate, channel index, sample range, FFT method/segments, peak frequency, RMS, peak-to-peak and five band-power values. The comparison reports **MATCH** or **DIFFER**; before importing it is explicitly **UNVERIFIED**.
7. Document the outcome, original dataset citation/version, license, software versions and any mismatches. Neither request nor reference proves it came from a particular input file: confirm file identity manually.

### Why exactly these spectral settings?

MRIΦ R5 uses a **symmetric Hann window** (`N-1` denominator), per-segment mean subtraction, 50% overlapping segments, one-sided Welch PSD, binwise band integration, and an up-to-4-second analysis window. **MNE-Python's default window is Hamming** and SciPy's default Hann is often periodic, so the R6 script explicitly passes `numpy.hanning(n_fft)` to `mne.time_frequency.psd_array_welch`. This avoids silently validating different algorithms.

The comparison uses a **1% relative** tolerance for most numerical outputs (small absolute floors) and requires exact sample count, channel index, FFT size and segment count. It does not prove that identical EDF data were supplied to both tools. A synthetically altered or forged JSON could also match: **the input file and reference provenance are not cryptographically authenticated**.

### Local reference regression tests

```bash
python -m unittest discover -s scripts -p "test_*.py" -v
```

The test runner creates its own synthetic EDF in a temporary directory. No patient data, network download, or file upload is required. Both the R6 Python reference workflow and main JavaScript tests must be green before considering the method ready for real recording trials.

### What R6 does not do

No live brain scanning, brain-to-brain coherence test, EEG/MRI source registration, automated artifact suppression, emotional state detection, telepathy test or diagnostic finding. R6 builds the reproducibility layer that **future** validated multichannel methods will need.

## R5 capabilities: Brainwave Lab

The **03 / EEG** workspace includes a separate **Brainwave Lab** panel below the original R4 waveforms. Choose a signal channel and press **ANALYZE WINDOW** to run a locally computed, bounded four-second spectral analysis.

- **Spectral estimator:** in-browser one-sided **Welch periodogram** with Hann window, per-segment mean removal, up to 4096-point radix-2 FFT, 50% overlap, calibrated physical signal units squared per Hz. The spectrum is plotted in dB **relative to its own peak** for visibility; absolute PSD values and integrated band powers are retained for calculations.
- **Band powers:** conventional delta (0.5–4 Hz), theta (4–8 Hz), alpha (8–13 Hz), beta (13–30 Hz), gamma (30–45 Hz). Relative percentages are fractions of 0.5–min(45 Hz, Nyquist) integrated power. Bands crossing Nyquist are **N/A**, not silently extrapolated.
- **Descriptive channel indicators:** mean, AC RMS, peak-to-peak amplitude, percent of samples close to the file's digital rails, and percent of identical adjacent ADC values. These are **not validated noise/quality grades**.
- **Bounded computation:** analyzes a maximum of four seconds / 131,072 samples, with an FFT of at most 4096 samples. The UI always declares the actual window, frequency resolution, sampling rate, and Welch segment count. Other channels are untouched.
- **Reproducibility:** deterministic synthetic multi-frequency sample, FFT and band-power regression tests, and downloadable **aggregate-only R5 receipts** without raw samples, original filename, patient headers, or channel labels. Aggregated results may still contain sensitive information.
- **Scientific limitations:** no device calibration verification, no automated artifact removal, no clinical EEG interpretation, no source localization, no claims of telepathy, nonlocal coupling, cognition, or consciousness state. Spectra from head movements, muscle signals, ECG/EOG and hardware noise may look rhythmic.

**Try it:** select **03 / EEG** → **SYNTHETIC EEG DEMO** → **ANALYZE WINDOW**. Choose SYN-FP2 to observe the artificial 9 Hz peak, which should appear predominantly in the alpha band; this is **not a recording of human brain activity**.

### Further R6–R7 roadmap (not yet implemented)

1. Better electrode metadata and carefully validated EEG/MRI coordinate registration, including known geometry and recording synchronization if simultaneous datasets are used.
2. Pre-registered coherence and information-flow analyses against shuffled, delayed, leakage, and held-out control datasets, with explicit provenance receipts and null outcomes reported.

## R4 capabilities: EEG Explorer (continuous EDF)

MRIΦ now has a separate **03 / EEG** workspace. Open a local 16-bit **EDF** or continuous **EDF+C** recording (.edf), or click **SYNTHETIC EEG DEMO** to explore clearly labeled mathematical sample waves. Navigate through time, page across eight signal channels at a time, and export a **metadata-only JSON research receipt**. The existing MRI explorer, 3D stage, and anatomy atlas are preserved.

- **Browser-local signal viewing:** file data stays in memory on your device, with no upload or telemetry. Maximum EDF file size is **128 MiB**.
- **Header-aware parser:** validates declared length, channel count, record durations/count, per-channel sample rates, record interleaving, and 16-bit little-endian sample ranges. Calibration converts ADC counts to the physical units declared in the file.
- **Waveform rendering:** min/max downsampling preserves short spikes better than naive sample skipping. Per-row auto-scaling aids visibility but **prevents comparing waveform height directly across rows**.
- **Safe scope:** EDF+ annotation channels are omitted; events and annotations are **not decoded**. **EDF+D** (discontinuous timing), **BDF** (24-bit), live hardware acquisition, EEG–MRI registration, filtering, clinical or consciousness inference are **not implemented**. R5 provides single-channel spectrum estimation.
- **Privacy:** EDF headers may contain real patient identifiers; the app does not display patient fields and the exported receipt excludes patient header, recording header, filename, and signal samples. Channel names can still be identifying: review the receipt before sharing.
- **Honest signal labels:** a channel marked EEG by the file header is not scientifically verified to be cortical EEG. ECG, EOG, EMG, electrical interference, and artifacts require specialist interpretation.
- **Tests:** deterministic EDF fixtures cover calibration, record layout, multi-rate channels, malformed/truncated files, continuous/discontinuous timing, annotations, and receipt exclusions.

Use: select **03 / EEG** and click **OPEN AN EDF FILE**. A public research dataset or a local acquisition-software export in supported EDF format works. MRIPHI does **not** capture EEG on its own, and the MRI scanner image viewer does not read EEG files.

### R4 original proposed research roadmap (R5 spectral stage now implemented)

1. R5 implemented bounded Welch PSD, descriptive band power and signal indicators; not clinical quality judgments.
2. Future: map EEG sensor layouts onto anatomy using actual electrode-coordinate data and a justified registration procedure.
3. Future: compare synchronization, time-varying networks and NBG/DCF graph-closure metrics against prespecified shuffled, shift-control, and held-out baselines. **No nonlocal coupling or consciousness claim is supported by the viewer.**

## R3 capabilities: Scan Inspector

- **Live crosshair probing:** View the world coordinate, continuous voxel index, nearest voxel index, raw scanner intensity, and tri-linearly interpolated intensity at the cursor. Values use the original R1 transform and R2 shared position, without touching the source image.
- **64-bin intensity histogram:** A bounded deterministic sample of the loaded voxels across the existing display intensity window (approximate 1st–99th percentile). Outliers and invalid samples are counted separately. The visualization uses a square-root scale; histogram counts are not tissue-class estimates.
- **Point A / Point B ledger:** Capture the current shared crosshair at two positions, preserve each mark while scrolling through the scan, then compare Euclidean world-coordinate distance.
- **Honest spatial units:** Only a valid NIfTI sform/qform **with explicit physical length units** can display **mm (header-reported)**. Missing units, unreliable orientation, and the synthetic demo show **unverified** or **synthetic** units rather than inventing millimeters. MRIPHI still cannot independently verify the correctness of even a valid header.
- **Portable JSON research receipt:** Export a human-readable, locally generated receipt containing the dataset filename, synthetic/real provenance, orientation source, affine, captured points, probe values, uncertainty, and warnings. No raw image array or diagnostic interpretation is exported.
- All state is local to the tab. Importing a new volume or resetting the demo **clears old point markers** to avoid cross-dataset contamination.

These features are for education and reproducible exploration, not medical measurement or automated diagnostic analysis. Scanner intensity values cannot automatically identify tissue, damage, or disease. The JSON includes a filename which **may identify a person**; always review it before sharing.

## R2 capabilities

- **Interactive 3D tri-plane stage:** a rotatable, browser-only display of the three intersecting axial/coronal/sagittal slices in a shared RAS+ world space (or visibly labeled synthetic/unverified space).
- **Synchronizes with 2D slice sliders** and window/contrast settings, because both views use the same R1 world-aligned slice sampler.
- **Display controls:** drag/touch to orbit, arrow-key rotation, named front/top/isometric camera presets, zoom slider, and toggles for each plane (with at least one remaining visible).
- **Physical geometry:** plane dimensions reflect world-space scan bounds and non-isotropic voxel spacing. The 3D scene transforms RAS+ coordinates to CSS 3D axes without changing source data.
- **Regression tests** cover plane proportions, crosshair placement, clipping, and oblique data.
- **No dependencies or network calls** beyond the existing React/Vite application.

This is an **orthogonal multiplanar slice display**, not a volumetric 3D tissue reconstruction, brain surface model, tumor segmentation, or measurement tool. Overlapping planes can obscure one another, and the synthetic brain phantom remains explicitly nonhuman.

## R1 capabilities

- **RAS+ world-aligned reslicing** from valid NIfTI-1 sform (preferred) or qform, including rotated, flipped, and oblique volumes.
- Millimeter-coordinate navigation with original voxel data retained; on-demand trilinear interpolation for display only.
- Orientation-source provenance and uncertainty badges; a missing, singular, or otherwise invalid affine is flagged as **UNVERIFIED**, with no patient-direction labels.
- Visible patient-side labels for source-affine images in a **neurological** view (patient right at image right).
- Tests for sform priority, qform quaternion/qfac handling, left-right flips, oblique interpolation, unit conversion, and invalid transforms.

## R0 capabilities

- Interactive **axial**, **coronal**, and **sagittal** slice viewers with synchronized crosshairs.
- Click to position the cursor in the other two planes; drag the position sliders to navigate.
- Local **NIfTI-1** single-file `.nii` and gzip `.nii.gz` import, with common scalar integer and floating-point datatypes.
- Brightness/window contrast controls and download of the displayed slice as PNG.
- Clickable illustrated anatomy entries for the **hippocampus**, **amygdala**, **caudate**, and **putamen**.
- Synthetic demo with explicit provenance, no user account, no backend upload, and responsive layout.

## Use

1. Open the GitHub Pages site once deployed, or start the development server.
2. Explore the **SYNTHETIC DEMO** by moving sliders or clicking any image; drag the 3D stage to orbit the three shared slice planes. Inspect live voxel intensities and the histogram beneath the slice views.
3. Choose **Open an MRI file** to load a NIfTI-1 single-volume scan from your computer. Files remain in your current browser tab. No files are uploaded by the application.
4. Save any displayed image with the download control on the slice card. Move the cursor to two distinct positions and choose **Capture Point A** / **Capture Point B** in the Scan Inspector. Export the **JSON receipt** when finished.

## Develop

Requires Node.js 22+.

```bash
npm install
npm run dev
npm test
npm run build
```

The production build uses the `/MRIPHI/` base path for GitHub Pages. The included workflow deploys `dist/` on pushes to `main`, **after** you set **Settings → Pages → Source: GitHub Actions** in the repository.

## Scientific and technical boundaries

- **Orientation:** Valid NIfTI-1 **sform** takes precedence over **qform**. A qform quaternion is used if sform is absent or unusable. Both map voxel coordinates to RAS+ world coordinates. The three views are rendered on RAS+ world-aligned planes (including oblique volumes), using trilinear interpolation. Patient-direction labels use the **neurological display convention**: image right is patient right. Incorrect metadata will produce incorrect orientation: MRIPHI cannot independently check scanner metadata or patient orientation. Missing/invalid transforms are shown as **UNVERIFIED** voxel axes with no anatomical direction labels.
- **Physical units:** Header meter, millimeter, and micrometer flags are converted to mm. If the spatial unit is unspecified, screen coordinates are flagged **assumed mm**, not independently validated.
- **3D stage:** An exploratory 3D display of three 2D resampled MRI slices. There is no 3D surface extraction, volumetric ray-casting, or image interpretation; the chosen camera angle never changes scientific voxel coordinates.
- **Resampling:** Original voxel data are preserved. Resampled slices are generated on demand, at no more than 384 points per axis for browser performance; rendered images are not intended for quantitative measurement.
- **MRI formats:** Single-file NIfTI-1, one 3D scalar volume. No DICOM, NIfTI-2, multichannel RGB images, or 4D/time-series yet. The separate EEG workspace supports bounded continuous 16-bit EDF/EDF+C recordings, not EDF+D or BDF.
- **Size:** Maximum 180 MB input, 220 MB decompressed data, and 25 million voxels, to protect browser memory.
- **Contrast:** The UI uses a sampled 1st/99th percentile intensity range; window controls modify only the rendered grayscale display. The underlying volume is unchanged.
- **Atlas:** The brain drawing is an *illustration*, not a voxel-space anatomical overlay or segmentation result.
- **Privacy:** Local file selection is browser-side only. MRIPHI does not include any network upload, telemetry, or storage service. Avoid sharing screenshots that might contain identifying scan information.
- **Scan Inspector limitations:** Point-to-point distances are between user-selected world coordinates, not boundaries of anatomical structures, and are not validated clinical measurements. Local scanner intensities are not tissue biomarkers. Export receipts contain the original image filename; review it before sharing.
- **Clinical safety:** Never use these images for patient-specific medical judgments. A qualified clinician should interpret medical imaging in validated tools.
- **Research literacy:** Correlations between cannabis use, brain volumes, and cognition cannot establish causation. MRIPHI is built to encourage careful exploration, not to substantiate those claims with visual approximations.

## Resources

- [OpenNeuro](https://openneuro.org/) for publicly shared neuroimaging research datasets (check licenses and participant privacy).
- [NIfTI specification](https://nifti.nimh.nih.gov/) for format details.
- [3D Slicer](https://www.slicer.org/) for sophisticated medical-image analysis workflows. MRIPHI is *not* a replacement.

## Contributing

Issues and pull requests are welcome. Useful next milestones: test fixtures across datatypes/endian modes and real-world orientation edge cases, multi-volume datasets, optional crosshair display in native voxel coordinates alongside RAS+, approved public demo data with clear license/provenance, and accessibility improvements.

## License

[MIT](./LICENSE) © 2026 Michael Hughes and contributors.

*Born from a joke about open-sourcing an MRI machine. Built into something real, without pretending browser software is an MRI scanner.*
