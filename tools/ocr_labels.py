#!/usr/bin/env python3
"""Decode the pixel-font labels of the sliced sheets (no real OCR: exact glyph matching).

The sheets use one small bitmap font (black pixels on the label background). Glyphs are cut at
empty columns and matched by exact bitmap against tools/font_glyphs.json
({"<bitmap key>": "<char>"}). Unknown glyphs are reported (and dumped to a PNG alphabet so a human,
or Claude reading the image, can add them once).

Usage:
  python3 tools/ocr_labels.py dump            # write assets-work/alphabet.png of unknown glyphs
  python3 tools/ocr_labels.py decode [sheet]  # write assets-work/<sheet>/labels.json
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "assets-work"
GLYPHS = Path(__file__).resolve().parent / "font_glyphs.json"
SPACE_GAP = 3  # empty columns that mean a word break (measured in dump mode)


def glyphs_of(crop: Image.Image) -> list[tuple[str, int, int]]:
    """[(glyph key, empty columns before it)] for one label/title crop."""
    a = np.array(crop.convert("RGB"))
    black = (a[..., 0] == 0) & (a[..., 1] == 0) & (a[..., 2] == 0)
    rows = np.flatnonzero(black.any(axis=1))
    if not len(rows):
        return []
    colhas = black.any(axis=0)
    blocks: list[tuple[int, int, int, int, int]] = []  # (gap, top, bottom, x0, x1)
    x, gap, w = 0, 0, black.shape[1]
    while x < w:
        if not colhas[x]:
            gap += 1
            x += 1
            continue
        x1 = x
        while x1 < w and colhas[x1]:
            x1 += 1
        r = np.flatnonzero(black[:, x:x1].any(axis=1))
        blocks.append((0 if not blocks else gap, int(r.min()), int(r.max()) + 1, x, x1))
        gap = 0
        x = x1
    # Text band top = highest top among tall glyphs, so small glyphs (. - ') keep their vertical slot.
    tall = [b[1] for b in blocks if b[2] - b[1] >= 4]
    band_top = min(tall) if tall else 0
    out: list[tuple[str, int, int]] = []
    for gap, top, bottom, x0, x1 in blocks:
        key = "/".join("".join("#" if v else "." for v in row) for row in black[top:bottom, x0:x1])
        if bottom - top <= 2:
            key += f"@{top - band_top}"
        out.append((key, gap, x0))
    return out


def all_crops(sheet: str):
    base = WORK / sheet
    meta = json.loads((base / "sections.json").read_text())
    for s in meta["sections"]:
        p = base / "sections" / f"{s['n']:03d}" / "label.png"
        if p.exists():
            yield ("section", s["n"]), Image.open(p)
    for i in range(len(meta.get("titles", []))):
        yield ("title", i), Image.open(base / "titles" / f"{i:03d}.png")


def sheets() -> list[str]:
    return sorted(p.parent.name for p in WORK.glob("*/sections.json"))


def dump() -> None:
    known = json.loads(GLYPHS.read_text()) if GLYPHS.exists() else {}
    counts: Counter[str] = Counter()
    gaps: Counter[int] = Counter()
    for sh in sheets():
        for _id, crop in all_crops(sh):
            for key, gap, _x in glyphs_of(crop):
                counts[key] += 1
                gaps[gap] += 1
    unknown = [(k, c) for k, c in counts.most_common() if k not in known]
    print(f"{len(counts)} distinct glyphs, {len(unknown)} unknown; gap histogram {sorted(gaps.items())}")
    scale, cell = 8, 0
    tiles = []
    for i, (k, c) in enumerate(unknown):
        cols = k.split("/")
        h, w = len(cols[0]), len(cols)
        im = Image.new("RGB", (w * scale + 4, h * scale + 4), (255, 255, 255))
        d = ImageDraw.Draw(im)
        for x, col in enumerate(cols):
            for y, ch in enumerate(col):
                if ch == "#":
                    d.rectangle([2 + x * scale, 2 + y * scale, 2 + (x + 1) * scale - 2, 2 + (y + 1) * scale - 2], fill=(0, 0, 0))
        tiles.append((i, c, im))
        cell = max(cell, im.width)
    per_row = 12
    cw, chh = cell + 8, 8 * 9 + 40
    img = Image.new("RGB", (per_row * cw, ((len(tiles) + per_row - 1) // per_row) * chh), (200, 200, 220))
    d = ImageDraw.Draw(img)
    for i, c, im in tiles:
        x, y = (i % per_row) * cw, (i // per_row) * chh
        d.text((x + 2, y + 2), f"{i}  n={c}", fill=(160, 0, 0))
        img.paste(im, (x + 2, y + 16))
    img.save(WORK / "alphabet.png")
    (WORK / "unknown_glyphs.json").write_text(json.dumps([k for k, _ in unknown]))


def decode(sheet: str, known: dict[str, str]) -> dict:
    out: dict[str, dict[str, str]] = {"sections": {}, "titles": {}}
    missing = 0
    for (kind, n), crop in all_crops(sheet):
        text = ""
        for key, gap, _x in glyphs_of(crop):
            if gap >= SPACE_GAP and text:
                text += " "
            ch = known.get(key)
            if ch is None:
                ch = "?"
                missing += 1
            text += ch
        out["sections" if kind == "section" else "titles"][str(n)] = text
    (WORK / sheet / "labels.json").write_text(json.dumps(out, indent=0))
    print(f"[{sheet}] decoded {len(out['sections'])} section labels, {len(out['titles'])} titles, {missing} unknown glyphs")
    return out


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "dump"
    if mode == "dump":
        dump()
    else:
        known = json.loads(GLYPHS.read_text())
        for sh in sys.argv[2:] or sheets():
            decode(sh, known)


if __name__ == "__main__":
    main()


def text_clusters(crop: Image.Image, known: dict[str, str], split_gap: int = 7) -> list[tuple[int, str]]:
    """Text clusters of a header row crop as [(x offset, text)]; clusters split at gaps >= split_gap."""
    out: list[tuple[int, str]] = []
    cur, start = "", 0
    for key, gap, x in glyphs_of(crop):
        ch = known.get(key, "?")
        if cur and gap >= split_gap:
            out.append((start, cur))
            cur = ""
        if not cur:
            start = x
        elif gap >= SPACE_GAP:
            cur += " "
        cur += ch
    if cur:
        out.append((start, cur))
    return out
