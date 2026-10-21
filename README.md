# MRIΦ / MRIPHI

**Explore the brain. Question everything. Everybody gets a piece.**

MRIΦ is a **free, MIT-licensed, local-first neuroimaging explorer** built in React + Vite. It offers three synchronized orthogonal slice views, a deliberately synthetic demonstration volume, and a separate illustrated brain-anatomy reference.

> **Important:** MRIPHI is an educational/research exploration project, **not a medical device**. It does not diagnose disease, quantify regional brain volumes, segment anatomical structures, or assess cognition. The sample phantom is computer-generated and is not a human MRI.

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
2. Explore the **SYNTHETIC DEMO** by moving sliders or clicking any image.
3. Choose **Open an MRI file** to load a NIfTI-1 single-volume scan from your computer. Files remain in your current browser tab. No files are uploaded by the application.
4. Save any displayed image with the download control on the slice card.

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
- **Resampling:** Original voxel data are preserved. Resampled slices are generated on demand, at no more than 384 points per axis for browser performance; rendered images are not intended for quantitative measurement.
- **Formats:** Single-file NIfTI-1, one 3D scalar volume. No DICOM, NIfTI-2, multichannel RGB images, or 4D/time-series yet.
- **Size:** Maximum 180 MB input, 220 MB decompressed data, and 25 million voxels, to protect browser memory.
- **Contrast:** The UI uses a sampled 1st/99th percentile intensity range; window controls modify only the rendered grayscale display. The underlying volume is unchanged.
- **Atlas:** The brain drawing is an *illustration*, not a voxel-space anatomical overlay or segmentation result.
- **Privacy:** Local file selection is browser-side only. MRIPHI does not include any network upload, telemetry, or storage service. Avoid sharing screenshots that might contain identifying scan information.
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
