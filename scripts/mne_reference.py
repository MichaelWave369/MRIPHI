#!/usr/bin/env python3
"""MRIΦ R6: independently parse EDF samples, calculate reference Welch PSD with MNE.

Run this locally. No EDF is uploaded. Output is aggregate-only and should be
reviewed before sharing. This is a numerical reference, NOT a clinical check.
Requires numpy, scipy (transitive), and mne.

Usage:
    python scripts/mne_reference.py --edf /path/S001R01.edf \
        --request MRIPHI-R6-validation-request.json \
        --out MRIPHI-R6-mne-reference.json
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import struct
import sys

METHOD = "mriphi-r5-hann-symmetric-welch-v1"
BANDS = [
    ("delta", 0.5, 4.0),
    ("theta", 4.0, 8.0),
    ("alpha", 8.0, 13.0),
    ("beta", 13.0, 30.0),
    ("gamma", 30.0, 45.0),
]
MAX_FILE = 128 * 1024 * 1024
MAX_REQUEST = 100_000
MAX_SAMPLES = 131072


def field(header: bytes, offset: int, length: int) -> str:
    return header[offset:offset + length].decode("ascii").strip()


def numeric(text: str, key: str, integer: bool = False):
    try:
        if not text or any(char.isspace() for char in text):
            raise ValueError()
        value = int(text) if integer else float(text)
        if not math.isfinite(value) or (integer and abs(value) >= 2**53):
            raise ValueError()
        return value
    except ValueError as exc:
        raise ValueError(f"Invalid EDF {key}") from exc


def load_samples(path: Path, request: dict):
    """Bounded 16-bit continuous EDF read, independent of MRIΦ TypeScript parser."""
    import numpy as np

    file_size = path.stat().st_size
    if not (256 <= file_size <= MAX_FILE):
        raise ValueError("EDF file size outside supported 256 B–128 MiB range")
    with path.open("rb") as handle:
        fixed = handle.read(256)
        if field(fixed, 0, 8) != "0":
            raise ValueError("Only EDF 16-bit format is supported")
        if field(fixed, 192, 44).startswith("EDF+D"):
            raise ValueError("EDF+D discontinuous recordings are not supported")
        count = numeric(field(fixed, 252, 4), "channel count", True)
        header_len = numeric(field(fixed, 184, 8), "header bytes", True)
        records = numeric(field(fixed, 236, 8), "records", True)
        record_seconds = numeric(field(fixed, 244, 8), "record duration")
        if not (1 <= count <= 256 and header_len == 256 + count * 256):
            raise ValueError("EDF header layout invalid")
        if not (0 < record_seconds <= 86400):
            raise ValueError("EDF record duration invalid")
        header = fixed + handle.read(header_len - 256)
        if len(header) != header_len:
            raise ValueError("Truncated EDF signal header")
        cursor = 256
        def columns(size: int):
            nonlocal cursor
            values = [field(header, cursor + index * size, size) for index in range(count)]
            cursor += size * count
            return values
        labels = columns(16)
        columns(80)
        units = columns(8)
        physical_min = [numeric(value, "physical min") for value in columns(8)]
        physical_max = [numeric(value, "physical max") for value in columns(8)]
        digital_min = [numeric(value, "digital min", True) for value in columns(8)]
        digital_max = [numeric(value, "digital max", True) for value in columns(8)]
        columns(80)
        samples_per_record = [numeric(value, "samples/record", True) for value in columns(8)]
        columns(32)
        if cursor != header_len or any(not 0 <= n <= 4_000_000 for n in samples_per_record):
            raise ValueError("Invalid channel layout")
        bytes_per_record = 2 * sum(samples_per_record)
        if bytes_per_record < 1 or (file_size - header_len) % bytes_per_record:
            raise ValueError("Truncated or invalid EDF records")
        actual_records = (file_size - header_len) // bytes_per_record
        if records == -1:
            records = actual_records
        if not records or records != actual_records:
            raise ValueError("EDF record count does not match file length")

        channel_index = request["channelIndex"]
        if not isinstance(channel_index, int) or not 0 <= channel_index < count:
            raise ValueError("Channel index outside file")
        if "edf annotations" in labels[channel_index].lower():
            raise ValueError("EDF annotation channels are not signal channels")
        channel_samples = samples_per_record[channel_index]
        if channel_samples <= 0:
            raise ValueError("Channel has zero samples")
        physical_range = physical_max[channel_index] - physical_min[channel_index]
        digital_range = digital_max[channel_index] - digital_min[channel_index]
        if physical_range <= 0 or digital_range <= 0 or digital_min[channel_index] < -32768 or digital_max[channel_index] > 32767:
            raise ValueError("Channel calibration invalid")
        fs = channel_samples / record_seconds
        if not math.isclose(fs, request["sampleRateHz"], abs_tol=1e-9, rel_tol=1e-9):
            raise ValueError("Reference sample rate differs from browser request")

        first = request["startSample"]
        n = request["sampleCount"]
        if not all(isinstance(value, int) for value in (first, n)) or first < 0 or not 64 <= n <= MAX_SAMPLES:
            raise ValueError("Invalid sample window")
        if first + n > records * channel_samples:
            raise ValueError("Requested sample window runs beyond EDF data")
        offsets = [sum(samples_per_record[:channel_index]) * 2]
        first_record, sample_within = divmod(first, channel_samples)
        remaining = n
        pieces = []
        while remaining > 0:
            take = min(remaining, channel_samples - sample_within)
            position = header_len + first_record * bytes_per_record + offsets[0] + 2 * sample_within
            handle.seek(position)
            encoded = handle.read(take * 2)
            if len(encoded) != take * 2:
                raise ValueError("EDF samples truncated while reading")
            pieces.append(np.frombuffer(encoded, dtype="<i2").astype(np.float64))
            remaining -= take
            first_record += 1
            sample_within = 0

    digital = np.concatenate(pieces)
    physical = physical_min[channel_index] + (
        digital - digital_min[channel_index]
    ) * (physical_range / digital_range)
    if not np.isfinite(physical).all():
        raise ValueError("Nonfinite channel samples")
    return physical, fs, units[channel_index]


def reference_from_file(path: Path, request: dict):
    import numpy as np
    import mne
    from mne.time_frequency import psd_array_welch

    if request.get("schema") != "mriphi-r6-verification-request-v1" or request.get("method") != METHOD:
        raise ValueError("Expected an MRIΦ R6 verification request")
    for key in ("channelIndex","startSample","sampleCount","fftSize","welchSegments"):
        if not isinstance(request.get(key), int):
            raise ValueError(f"Invalid request {key}")
    for key in ("sampleRateHz","peakFrequencyHz","acRms","peakToPeak"):
        value = request.get(key)
        if not isinstance(value, (float, int)) or not math.isfinite(value):
            raise ValueError(f"Invalid request {key}")

    samples, fs, unit = load_samples(path, request)
    size = request["fftSize"]
    if not (64 <= size <= 4096 and size & (size - 1) == 0 and size <= len(samples)):
        raise ValueError("Requested FFT length is invalid")
    if not math.isclose(fs, request["sampleRateHz"], abs_tol=1e-9, rel_tol=1e-9):
        raise ValueError("Mismatched sample frequency")
    expected_segments = 1 + (len(samples) - size) // (size // 2)
    if expected_segments != request["welchSegments"]:
        raise ValueError("Requested Welch segment count differs from the actual window")

    # np.hanning gives a symmetric (N-1 denominator) Hann window just as
    # R5's browser FFT does. MNE default 'hamming' or SciPy's periodic 'hann'
    # would produce different PSD estimates. Explicitly match both.
    psd, frequencies = psd_array_welch(
        samples, sfreq=fs, n_fft=size, n_per_seg=size, n_overlap=size // 2,
        window=np.hanning(size), remove_dc=True, average="mean",
        fmin=0, fmax=fs / 2, verbose=False,
    )
    df = fs / size
    upper = min(45, fs / 2)
    denom = float(np.sum(psd[(frequencies >= 0.5) & (frequencies < upper)]) * df)
    bands = []
    for key, lo, hi in BANDS:
        if fs / 2 < hi:
            bands.append({"key": key, "power": None, "relativePercent": None})
        else:
            power = float(np.sum(psd[(frequencies >= lo) & (frequencies < hi)]) * df)
            bands.append({
                "key": key,
                "power": power,
                "relativePercent": power / denom * 100 if denom > 0 else None,
            })
    # Include DC in the baseline candidate: matches the browser R5 selector.
    mask = frequencies <= min(45, fs / 2)
    peak_bin = int(np.argmax(psd[mask]))
    peak_frequency = float(frequencies[mask][peak_bin])
    mean = float(np.mean(samples))
    rms = float(np.sqrt(np.maximum(0.0, np.mean(samples * samples) - mean * mean)))
    p2p = float(np.ptp(samples))
    reference = {
        "schema": "mriphi-r6-mne-reference-v1",
        "method": METHOD,
        "channelIndex": request["channelIndex"],
        "sampleRateHz": float(fs),
        "startSample": request["startSample"],
        "sampleCount": request["sampleCount"],
        "fftSize": size,
        "welchSegments": expected_segments,
        "bands": bands,
        "peakFrequencyHz": peak_frequency,
        "acRms": rms,
        "peakToPeak": p2p,
        "engine": f"MNE-Python {mne.__version__}",
        "sourceVerification": "USER_MUST_CONFIRM_SAME_FILE",
        "description": "Numerical spectral reference for one EDF channel; not clinical or proof of data provenance.",
        "unit": unit,
    }
    if not all(
        math.isfinite(v) for v in (reference["acRms"], reference["peakToPeak"], reference["peakFrequencyHz"])
    ):
        raise ValueError("Nonfinite reference metrics")
    return reference


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline EDF spectral reference for MRIΦ R6")
    parser.add_argument("--edf", required=True, type=Path, help="Locally stored EDF recording")
    parser.add_argument("--request", required=True, type=Path, help="Browser-exported R6 request JSON")
    parser.add_argument("--out", required=True, type=Path, help="Reference JSON destination (existing files refused)")
    args = parser.parse_args()
    try:
        if args.request.stat().st_size > MAX_REQUEST:
            raise ValueError("Reference request exceeds 100 KB")
        with args.request.open("r", encoding="utf-8") as stream:
            request = json.load(stream, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
        if not isinstance(request, dict):
            raise ValueError("Request must be a JSON object")
        result = reference_from_file(args.edf, request)
        # Exclusive create. Never silently overwrite earlier provenance.
        with args.out.open("x", encoding="utf-8") as stream:
            json.dump(result, stream, indent=2, allow_nan=False)
            stream.write("\n")
        print("Wrote aggregate-only MNE reference JSON:", args.out)
        print("Identity of the original EDF is NOT authenticated by this process.")
        return 0
    except (OSError, ValueError, TypeError, IndexError) as exc:
        print("R6 reference generation FAILED:", str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
