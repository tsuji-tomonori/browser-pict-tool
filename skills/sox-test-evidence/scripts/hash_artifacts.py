#!/usr/bin/env python3
"""Hash files or directories into a sha256 manifest."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def iter_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_file():
            files.append(path)
            continue
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file():
                    files.append(child)
    return files


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", help="Files or directories to hash")
    parser.add_argument(
        "--output",
        default="artifact-hashes.sha256",
        help="Output manifest path",
    )
    args = parser.parse_args()

    inputs = [Path(raw).resolve() for raw in args.paths]
    files = iter_files(inputs)
    if not files:
        raise SystemExit("No files found to hash.")

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    lines = []
    for path in files:
        digest = sha256_file(path)
        lines.append(f"{digest}  {path}")

    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
