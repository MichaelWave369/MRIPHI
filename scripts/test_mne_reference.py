"""Offline, deterministic fixture tests for R6's independent MNE reference path.

Run: python -m unittest discover -s scripts -p 'test_*.py'
No downloading patient datasets, no network or clinical data in CI.
"""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from mne_reference import METHOD, reference_from_file


def sample_edf(path: Path, *, fs: int = 128, records: int = 8):
    labels = ["C3", "C4"]
    count = len(labels)
    header_bytes = 256 + 256 * count
    header = bytearray(b" " * header_bytes)

    def write(start, width, value):
        encoded = str(value).encode("ascii")
        if len(encoded) > width:
            raise ValueError("EDf test string too wide")
        header[start:start + len(encoded)] = encoded

    write(0, 8, 0)
    write(8, 80, "SYNTHETIC TEST ONLY")
    write(184, 8, header_bytes)
    write(236, 8, records)
    write(244, 8, 1)
    write(252, 4, count)
    cursor = 256
    def fields(width, values):
        nonlocal cursor
        for index, value in enumerate(values):
            write(cursor + index * width, width, value)
        cursor += width * count
    fields(16, labels)
    fields(80, ["fixture", "fixture"])
    fields(8, ["uV", "uV"])
    fields(8, [-100, -100])
    fields(8, [100, 100])
    fields(8, [-32768, -32768])
    fields(8, [32767, 32767])
    fields(80, ["", ""])
    fields(8, [fs, fs])
    fields(32, ["", ""])
    assert cursor == header_bytes
    with path.open("wb") as file:
        file.write(header)
        for record in range(records):
            for channel in range(count):
                t = record + np.arange(fs) / fs
                hz = 9 if channel == 0 else 6
                signal = 20 * np.sin(2 * np.pi * hz * t)
                digital = np.rint((signal + 100) * (65535 / 200) - 32768).astype("<i2")
                file.write(digital.tobytes())


class MneReferenceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "SYNTHETIC-fixture.edf"
        sample_edf(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def request(self, channel=0):
        return {
            "schema": "mriphi-r6-verification-request-v1",
            "method": METHOD,
            "channelIndex": channel,
            "sampleRateHz": 128,
            "startSample": 0,
            "sampleCount": 512,
            "fftSize": 256,
            "welchSegments": 3,
            "peakFrequencyHz": 9,
            "acRms": 14.1,
            "peakToPeak": 40,
        }

    def test_known_synthetic_signal_returns_9_hz_alpha_peak(self):
        reference = reference_from_file(self.path, self.request())
        self.assertEqual(reference["engine"].split()[0], "MNE-Python")
        self.assertAlmostEqual(reference["peakFrequencyHz"], 9.0, places=7)
        powers = {b["key"]: b["power"] for b in reference["bands"]}
        self.assertGreater(powers["alpha"], powers["theta"])
        self.assertEqual(reference["sampleCount"], 512)
        self.assertEqual(reference["welchSegments"], 3)

    def test_second_channel_6_hz_theta_peak(self):
        reference = reference_from_file(self.path, self.request(channel=1))
        self.assertEqual(reference["peakFrequencyHz"], 6)
        powers = {b["key"]: b["power"] for b in reference["bands"]}
        self.assertGreater(powers["theta"], powers["alpha"])

    def test_mismatched_sample_rate_is_rejected(self):
        req = self.request()
        req["sampleRateHz"] = 256
        with self.assertRaisesRegex(ValueError, "sample rate"):
            reference_from_file(self.path, req)

    def test_mismatched_segment_count_is_rejected(self):
        req = self.request()
        req["welchSegments"] = 5
        with self.assertRaisesRegex(ValueError, "segment count"):
            reference_from_file(self.path, req)

    def test_payload_never_includes_file_path_or_patient_header(self):
        output = json.dumps(reference_from_file(self.path, self.request()))
        self.assertNotIn("SYNTHETIC-fixture.edf", output)
        self.assertNotIn("SYNTHETIC TEST ONLY", output)
        self.assertNotIn("samples", output.lower().replace("samplecount", "").replace("sampleratehz", ""))


if __name__ == "__main__":
    unittest.main()
