#!/usr/bin/env python3
"""Regression tests for withholding, signed metadata hashes, and real APT policy."""

import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from ppa_index import filter_index, paragraphs, verify_apt_candidates, verify_release, withheld_versions


DIGEST = "f" * 64


def record(version, package="floorp"):
    return (
        f"Package: {package}\nVersion: {version}\nArchitecture: amd64\n"
        f"Filename: ./floorp-{version}.deb\nSize: 113309570\nSHA256: {DIGEST}\n"
        "Description: Test metadata\n continuation retained\n\n"
    ).encode()


class PpaIndexTests(unittest.TestCase):
    def test_only_withheld_floorp_record_is_removed(self):
        before = record("12.18.1") + record("12.19.0") + record("12.20.0") + record("12.20.0", "other-package")
        after, removed = filter_index(before, {"12.20.0"}, "12.19.0", DIGEST)
        self.assertEqual(after, record("12.18.1") + record("12.19.0") + record("12.20.0", "other-package"))
        self.assertEqual(removed, ["floorp-12.20.0.deb"])

    def test_repeated_withholding_is_idempotent(self):
        after, _ = filter_index(record("12.19.0") + record("12.20.0"), {"12.20.0"})
        self.assertEqual(filter_index(after, {"12.20.0"}), (after, []))

    def test_future_release_preserves_hold(self):
        after, _ = filter_index(record("12.19.0") + record("12.20.0") + record("12.21.0"), {"12.20.0"})
        self.assertEqual(after, record("12.19.0") + record("12.21.0"))

    def test_newer_candidate_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "newer"):
            filter_index(record("12.19.0") + record("12.21.0"), {"12.20.0"}, "12.19.0", DIGEST)

    def test_missing_or_duplicate_candidate_is_rejected(self):
        for before in [record("12.18.1"), record("12.19.0") * 2]:
            with self.assertRaisesRegex(ValueError, "exactly once"):
                filter_index(before, set(), "12.19.0", DIGEST)

    def test_release_asset_digest_must_match(self):
        with self.assertRaisesRegex(ValueError, "verified Release"):
            filter_index(record("12.19.0"), set(), "12.19.0", "0" * 64)

    def test_all_candidates_cannot_be_removed(self):
        with self.assertRaisesRegex(ValueError, "all Floorp"):
            filter_index(record("12.20.0"), {"12.20.0"})

    def test_record_validation(self):
        for before in [record("12.19.0").replace(b"floorp-12.19.0.deb", b"../escape.deb"),
                       record("12.19.0").replace(b"Architecture: amd64", b"Architecture: arm64"),
                       record("12.19.0").replace(DIGEST.encode(), b"invalid"),
                       record("12.19.0").replace(b"Version: 12.19.0", b"Version: 12.19.0\nVersion: duplicate")]:
            with self.assertRaises(ValueError):
                filter_index(before, set())

    def test_policy_validation(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary).joinpath("policy.json")
            for policy in [{"schemaVersion": 1, "versions": ["../escape"]},
                           {"schemaVersion": 1, "versions": ["12.20.0", "12.20.0"]},
                           {"schemaVersion": 2, "versions": []}]:
                path.write_text(json.dumps(policy))
                with self.assertRaises(ValueError):
                    withheld_versions(path)
            path.write_text(json.dumps({"schemaVersion": 1, "versions": ["12.20.0"]}))
            self.assertEqual(withheld_versions(path), {"12.20.0"})

    def test_signed_release_checksums_and_compression(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = record("12.19.0")
            root.joinpath("Packages").write_bytes(data)
            root.joinpath("Packages.gz").write_bytes(gzip.compress(data, mtime=0))
            release = "SHA256:\n"
            for name in ["Packages", "Packages.gz"]:
                content = root.joinpath(name).read_bytes()
                release += f" {hashlib.sha256(content).hexdigest()} {len(content)} {name}\n"
            root.joinpath("Release").write_text(release)
            verify_release(root)
            root.joinpath("Packages").write_bytes(data + b"\n")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                verify_release(root)

    def test_actual_apt_new_install_and_existing_12_20(self):
        after, _ = filter_index(record("12.18.1") + record("12.19.0") + record("12.20.0"), {"12.20.0"})
        verify_apt_candidates(after, "12.19.0", "12.20.0")
        self.assertEqual(len(paragraphs(after)), 2)


if __name__ == "__main__":
    unittest.main()
