/**
 * Bounded, browser-local reader for continuous 16-bit EDF / EDF+C records.
 * No diagnosis, filtering, annotation decoding or signal-source inference.
 * Discontinuous EDF+D must not be presented on a continuous time axis.
 */
export type EdfChannel = {
  index: number;
  label: string;
  unit: string;
  sampleRate: number;
  samplesPerRecord: number;
  physicalMin: number;
  physicalMax: number;
  digitalMin: number;
  digitalMax: number;
  byteOffsetInRecord: number;
  annotation: boolean;
};

export type EdfRecording = {
  name: string;
  view: DataView;
  headerBytes: number;
  bytesPerRecord: number;
  records: number;
  recordDuration: number;
  durationSeconds: number;
  channels: EdfChannel[];
  warnings: string[];
  format: 'EDF' | 'EDF+C';
};

export type EnvelopeBucket = { min: number; max: number };
const MAX_EDF_BYTES = 128 * 1024 * 1024;
const MAX_CHANNELS = 256;
const MAX_RECORD_SAMPLES = 4_000_000;
const EDF_HEADER_BYTES = 256;
const textDecoder = new TextDecoder('ascii');

function field(buffer: Uint8Array, offset: number, length: number): string {
  return textDecoder.decode(buffer.subarray(offset, offset + length)).trim();
}

function integer(value: string, label: string): number {
  if (!/^[+-]?\d+$/.test(value)) throw new Error('Invalid EDF ' + label + '.');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Invalid EDF ' + label + '.');
  return number;
}

function decimal(value: string, label: string): number {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
    throw new Error('Invalid EDF ' + label + '.');
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid EDF ' + label + '.');
  return number;
}

export function parseEdf(buffer: ArrayBuffer, name = 'local recording.edf'): EdfRecording {
  if (buffer.byteLength > MAX_EDF_BYTES) {
    throw new Error('EDF exceeds the 128 MiB local safety limit.');
  }
  if (buffer.byteLength < EDF_HEADER_BYTES) throw new Error('EDF header is truncated.');
  const bytes = new Uint8Array(buffer);
  const version = field(bytes, 0, 8);
  if (version !== '0') throw new Error('Unsupported EDF version. This reader expects 16-bit EDF.');
  const headerBytes = integer(field(bytes, 184, 8), 'header byte count');
  const marker = field(bytes, 192, 44);
  const declaredRecords = integer(field(bytes, 236, 8), 'record count');
  const recordDuration = decimal(field(bytes, 244, 8), 'record duration');
  const count = integer(field(bytes, 252, 4), 'channel count');
  if (count < 1 || count > MAX_CHANNELS) throw new Error('EDF channel count is outside supported limits.');
  if (headerBytes !== EDF_HEADER_BYTES + count * 256 || headerBytes > buffer.byteLength) {
    throw new Error('EDF header length is invalid or truncated.');
  }
  if (!(recordDuration > 0) || recordDuration > 86400) {
    throw new Error('EDF record duration is invalid.');
  }
  if (declaredRecords < -1) throw new Error('EDF record count is invalid.');
  if (marker.startsWith('EDF+D')) {
    throw new Error('EDF+D has discontinuous timing and is not supported by this continuous waveform viewer.');
  }
  const format: EdfRecording['format'] = marker.startsWith('EDF+C') ? 'EDF+C' : 'EDF';
  let cursor = EDF_HEADER_BYTES;
  function columns(width: number): string[] {
    const fields = Array.from({ length: count }, (_, index) => field(bytes, cursor + index * width, width));
    cursor += count * width;
    return fields;
  }
  const labels = columns(16);
  columns(80); // transducer type
  const units = columns(8);
  const physicalMin = columns(8);
  const physicalMax = columns(8);
  const digitalMin = columns(8);
  const digitalMax = columns(8);
  columns(80); // prefilter information
  const samplesPerRecord = columns(8);
  columns(32); // per-channel reserved fields
  if (cursor !== headerBytes) throw new Error('EDF channel header is malformed.');

  let offset = 0;
  let samplesInRecord = 0;
  const channels: EdfChannel[] = labels.map((label, index) => {
    const samples = integer(samplesPerRecord[index], 'samples per record');
    const pMin = decimal(physicalMin[index], 'physical minimum');
    const pMax = decimal(physicalMax[index], 'physical maximum');
    const dMin = integer(digitalMin[index], 'digital minimum');
    const dMax = integer(digitalMax[index], 'digital maximum');
    if (samples < 0 || samples > MAX_RECORD_SAMPLES) {
      throw new Error('EDF sample count is outside supported limits.');
    }
    if (pMax <= pMin || dMax <= dMin || dMin < -32768 || dMax > 32767) {
      throw new Error('Invalid EDF channel calibration in channel ' + (index + 1) + '.');
    }
    const channel: EdfChannel = {
      index,
      label: label || 'Channel ' + (index + 1),
      unit: units[index] || 'unknown units',
      samplesPerRecord: samples,
      sampleRate: samples / recordDuration,
      physicalMin: pMin,
      physicalMax: pMax,
      digitalMin: dMin,
      digitalMax: dMax,
      byteOffsetInRecord: offset,
      annotation: label.toLowerCase().includes('edf annotations'),
    };
    offset += samples * 2;
    samplesInRecord += samples;
    return channel;
  });
  if (samplesInRecord < 1 || samplesInRecord > MAX_RECORD_SAMPLES || offset <= 0) {
    throw new Error('EDF record size is outside supported limits.');
  }
  const available = buffer.byteLength - headerBytes;
  if (available < 0 || available % offset !== 0) {
    throw new Error('EDF samples are truncated or record byte count is inconsistent.');
  }
  const actualRecords = available / offset;
  const records = declaredRecords === -1 ? actualRecords : declaredRecords;
  if (records <= 0 || records !== actualRecords || !Number.isSafeInteger(records)) {
    throw new Error('EDF record count does not match the file length.');
  }
  const durationSeconds = records * recordDuration;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('EDF duration is invalid.');
  }
  if (!channels.some((c) => !c.annotation && c.samplesPerRecord > 0)) {
    throw new Error('EDF contains no sample channels to display.');
  }
  const warnings = [
    'Channel labels do not establish that a signal is EEG rather than EOG, ECG or another modality.',
    'Amplitude is converted from digital counts using file-header calibration; calibration is not independently verified.',
    'Each waveform row is auto-scaled independently for display. Visual height is not comparable between channels.',
    'EDF+ annotations, events and patient identifiers are not interpreted or displayed.',
  ];
  if (declaredRecords === -1) warnings.push('The unspecified record count was inferred from the exact file length.');
  if (channels.some((c) => c.annotation)) warnings.push('EDF+ annotation channels are excluded from waveform display.');
  if (channels.some((c) => !c.annotation && c.unit.toLowerCase() !== 'uv' && c.unit !== 'µV' && c.unit !== 'μV')) {
    warnings.push('Some channels do not declare microvolt units; do not assume identical units.');
  }
  return {
    name, view: new DataView(buffer), headerBytes, bytesPerRecord: offset,
    records, recordDuration, durationSeconds, channels, warnings, format,
  };
}

export async function readEdf(file: File): Promise<EdfRecording> {
  if (file.size > MAX_EDF_BYTES) throw new Error('EDF exceeds the 128 MiB local safety limit.');
  const buffer = await file.arrayBuffer();
  return parseEdf(buffer, file.name);
}

export function physicalSample(recording: EdfRecording, channel: EdfChannel, sampleIndex: number): number {
  const count = recording.records * channel.samplesPerRecord;
  if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 0 || sampleIndex >= count || channel.samplesPerRecord === 0) {
    throw new RangeError('EDF sample index outside channel bounds.');
  }
  const record = Math.floor(sampleIndex / channel.samplesPerRecord);
  const withinRecord = sampleIndex % channel.samplesPerRecord;
  const offset = recording.headerBytes + record * recording.bytesPerRecord +
    channel.byteOffsetInRecord + withinRecord * 2;
  const digital = recording.view.getInt16(offset, true);
  return channel.physicalMin + (digital - channel.digitalMin) *
    (channel.physicalMax - channel.physicalMin) / (channel.digitalMax - channel.digitalMin);
}

/** Min/max bucket aggregation avoids aliasing spikes away when zoomed out. */
export function waveformEnvelope(
  recording: EdfRecording,
  channel: EdfChannel,
  startSeconds: number,
  spanSeconds: number,
  bucketCount: number,
): EnvelopeBucket[] {
  if (channel.annotation || channel.samplesPerRecord <= 0) return [];
  if (!Number.isFinite(startSeconds) || !Number.isFinite(spanSeconds) ||
      spanSeconds <= 0 || !Number.isInteger(bucketCount) || bucketCount < 1 || bucketCount > 2000) {
    throw new RangeError('Invalid EDF viewing range.');
  }
  const start = Math.max(0, Math.min(recording.durationSeconds, startSeconds));
  const stop = Math.max(start, Math.min(recording.durationSeconds, start + spanSeconds));
  const totalSamples = recording.records * channel.samplesPerRecord;
  const rate = channel.sampleRate;
  const buckets: EnvelopeBucket[] = [];
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const first = Math.max(0, Math.min(totalSamples, Math.floor((start + bucket / bucketCount * (stop - start)) * rate)));
    const last = Math.max(first, Math.min(totalSamples, Math.ceil((start + (bucket + 1) / bucketCount * (stop - start)) * rate)));
    if (first === last) {
      buckets.push({ min: Number.NaN, max: Number.NaN });
      continue;
    }
    let min = Infinity;
    let max = -Infinity;
    for (let sample = first; sample < last; sample++) {
      const value = physicalSample(recording, channel, sample);
      if (value < min) min = value;
      if (value > max) max = value;
    }
    buckets.push({ min, max });
  }
  return buckets;
}

/** Metadata-only, intentionally excludes patient/recording fields and sample data. */
export function edfReceipt(recording: EdfRecording) {
  return {
    schema: 'mriphi-edf-r4-v1',
    provenance: 'locally imported EDF header; not independently verified',
    format: recording.format,
    durationSeconds: recording.durationSeconds,
    records: recording.records,
    recordDurationSeconds: recording.recordDuration,
    channels: recording.channels.map((c) => ({
      index: c.index, label: c.label, unit: c.unit,
      samplingRateHz: c.sampleRate, annotation: c.annotation,
    })),
    warnings: recording.warnings,
    caution: 'Non-diagnostic exploration. Receipt omits filename, patient header and signal samples.',
  };
}
