#!/usr/bin/env python3
"""Build the repo-native SOX skill pack zip."""

from __future__ import annotations

import argparse
import shutil
import tempfile
import zipfile
from pathlib import Path


PACK_NAME = "sox-codex-skills-pack"
SKILL_NAMES = [
    "sox-change-intake",
    "sox-risk-impact-assessment",
    "sox-implementation",
    "sox-doc-update",
    "sox-test-evidence",
    "sox-pr-review-readiness",
    "sox-release-deployment",
    "sox-audit-evidence-pack",
]


def copy_tree(src: Path, dest: Path) -> None:
    shutil.copytree(src, dest, dirs_exist_ok=True)


def build_pack(repo_root: Path, output_zip: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="sox-skill-pack-") as temp_dir_raw:
        temp_dir = Path(temp_dir_raw)
        pack_root = temp_dir / PACK_NAME
        pack_root.mkdir(parents=True, exist_ok=True)

        skills_root = pack_root / "skills"
        skills_root.mkdir()
        source_skills_root = repo_root / "skills"
        for skill_name in SKILL_NAMES:
            copy_tree(source_skills_root / skill_name, skills_root / skill_name)

        agents_template = (
            source_skills_root
            / "sox-audit-evidence-pack"
            / "assets"
            / "AGENTS.template.md"
        )
        shutil.copy2(agents_template, pack_root / "AGENTS.md")

        output_zip.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(pack_root.rglob("*")):
                archive.write(path, path.relative_to(temp_dir))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default=f"{PACK_NAME}.zip",
        help="Output zip file path",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    output_zip = Path(args.output).resolve()
    build_pack(repo_root, output_zip)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
