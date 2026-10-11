#!/usr/bin/env python3
"""Check assets-src/manifest.json: required fields, unique ids, frames exist in the sliced sheets."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = {"id", "sheet", "section", "frames", "fps", "loop", "tags", "ship"}


def main() -> int:
    entries = json.loads((ROOT / "assets-src" / "manifest.json").read_text())["entries"]
    geometry: dict[str, dict] = {}
    errors, seen = [], set()
    for e in entries:
        missing = REQUIRED - e.keys()
        if missing:
            errors.append(f"{e.get('id')}: missing {sorted(missing)}")
            continue
        if e["id"] in seen:
            errors.append(f"{e['id']}: duplicate id")
        seen.add(e["id"])
        if e["sheet"] not in geometry:
            data = json.loads((ROOT / "assets-work" / e["sheet"] / "sections.json").read_text())
            geometry[e["sheet"]] = {s["n"]: s for s in data["sections"]}
        sec = geometry[e["sheet"]].get(e["section"])
        if sec is None:
            errors.append(f"{e['id']}: unknown section {e['section']}")
            continue
        ok = {f["k"] for f in sec["frames"] if not f["empty"]}
        if not e["frames"] or any(k not in ok for k in e["frames"]):
            errors.append(f"{e['id']}: bad frame list")
    for err in errors[:20]:
        print("ERROR", err)
    print(f"manifest: {len(entries)} entries, {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
