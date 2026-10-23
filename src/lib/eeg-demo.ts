import { parseEdf } from './edf';
import type { EdfRecording } from './edf';

/** Deterministic, obviously synthetic illustration to exercise the EDF viewer. */
export function makeSyntheticEeg(): EdfRecording {
  const channelCount = 4;
  const seconds = 12;
  const sampleRate = 128;
  const headerBytes = 256 + channelCount * 256;
  const recordBytes = channelCount * sampleRate * 2;
  const buffer = new ArrayBuffer(headerBytes + seconds * recordBytes);
  const bytes = new Uint8Array(buffer);
  bytes.fill(32, 0, headerBytes);
  const put = (offset: number, width: number, value: string) => {
    for (let i = 0; i < value.length && i < width; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  put(0, 8, '0');
  put(8, 80, 'SYNTHETIC DEMO - NOT A HUMAN');
  put(88, 80, 'MRIPHI ILLUSTRATIVE DATA');
  put(184, 8, String(headerBytes));
  put(192, 44, 'EDF+C');
  put(236, 8, String(seconds));
  put(244, 8, '1');
  put(252, 4, String(channelCount));
  let cursor = 256;
  function columns(width: number, values: string[]) {
    values.forEach((value, index) => put(cursor + index * width, width, value));
    cursor += channelCount * width;
  }
  columns(16, ['SYN-FP1', 'SYN-FP2', 'SYN-C3', 'SYN-C4']);
  columns(80, Array(channelCount).fill('SYNTHETIC SIGNAL'));
  columns(8, Array(channelCount).fill('uV'));
  columns(8, Array(channelCount).fill('-200'));
  columns(8, Array(channelCount).fill('200'));
  columns(8, Array(channelCount).fill('-32768'));
  columns(8, Array(channelCount).fill('32767'));
  columns(80, Array(channelCount).fill('NONE'));
  columns(8, Array(channelCount).fill(String(sampleRate)));
  columns(32, Array(channelCount).fill(''));
  const view = new DataView(buffer);
  for (let record = 0; record < seconds; record++) {
    for (let channel = 0; channel < channelCount; channel++) {
      for (let index = 0; index < sampleRate; index++) {
        const t = record + index / sampleRate;
        const periodic = 18 * Math.sin(2 * Math.PI * (7 + channel * 2) * t + channel * 0.5);
        const slow = 9 * Math.sin(2 * Math.PI * (1 + channel * 0.25) * t);
        const deterministicTexture = 3.5 * Math.sin(2 * Math.PI * 23.5 * t + channel * 1.17);
        const value = periodic + slow + deterministicTexture;
        const digital = Math.round(value / 400 * 65535);
        const offset = headerBytes + record * recordBytes + (channel * sampleRate + index) * 2;
        view.setInt16(offset, Math.max(-32768, Math.min(32767, digital)), true);
      }
    }
  }
  const recording = parseEdf(buffer, 'SYNTHETIC EEG DEMO (not human).edf', 'synthetic');
  recording.warnings.unshift('SYNTHETIC DEMO: all signals are mathematical waveforms, not human brain activity.');
  return recording;
}
