#!/usr/bin/env python3
"""Build JSON and sha256 manifests for an evidence directory."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def collect_files(root: Path) -> list[Path]:
    files = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.name in {"manifest.json", "manifest.sha256"}:
            continue
        files.append(path)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--change-id", required=True, help="Change identifier")
    parser.add_argument(
        "--evidence-root",
        default="evidence",
        help="Evidence root directory",
    )
    args = parser.parse_args()

    evidence_dir = Path(args.evidence_root).resolve() / args.change_id
    if not evidence_dir.is_dir():
        raise SystemExit(f"Evidence directory not found: {evidence_dir}")

    files = collect_files(evidence_dir)
    manifest = []
    sha_lines = []

    for path in files:
        rel = path.relative_to(evidence_dir)
        file_digest = digest(path)
        size = path.stat().st_size
        manifest.append(
            {
                "path": str(rel),
                "sha256": file_digest,
                "size_bytes": size,
            }
        )
        sha_lines.append(f"{file_digest}  {rel}")

    (evidence_dir / "manifest.json").write_text(
        json.dumps(
            {
                "change_id": args.change_id,
                "root": str(evidence_dir),
                "files": manifest,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (evidence_dir / "manifest.sha256").write_text(
        "\n".join(sha_lines) + ("\n" if sha_lines else ""),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
