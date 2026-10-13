#!/usr/bin/env python3
"""Slice the labelled sprite sheets in assets-src/ into sections and frames.

Usage: python3 tools/slice_sheets.py [sheet ...]      (default: all seven sheets)

For every sheet it writes, under assets-work/<sheet>/:
  sections.json              raw geometry (sections, label bars, cells, frames)
  sections/<nnn>/label.png   the label bar crop (read by a human / Claude, no OCR)
  sections/<nnn>/frame_<k>.png   trimmed sprite, transparent background
  contact_<page>.png         contact sheets (x2) for review

Sheet colours (measured): sheet bg (39,116,119), cell bg (121,230,234),
cell separator (55,177,182), label bar (20,58,60).

Frame geometry in sections.json: x,y,w,h = trimmed sprite bounds in sheet pixels,
ox,oy = feet anchor relative to the trimmed sprite's top-left
(horizontal centre of the cell, bottom of the cell), so every frame of a
section shares the same anchor and animations do not jitter.

Needs Python 3, Pillow and numpy (tool-only dependencies, never shipped).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src"
WORK = ROOT / "assets-work"

SHEET_BG = (39, 116, 119)
CELL_BG = (121, 230, 234)
SEP = (55, 177, 182)
BAR = (20, 58, 60)

SHEETS = ["steve", "alex", "rana", "enemies", "allies", "animals", "villagers"]

MIN_SECTION_AREA = 64
SEP_FRACTION = 0.9
# Hero sheets only: WALKING blocks (4 facing rows x 4 walk frames) whose rows do not share column dividers
# (front/back cells are 20 px wide, side cells 18 px) collapse to one column with the global divider test,
# so their columns are measured per row instead (see `row_col_spans`). Everything else is sliced as before.
HERO_SHEETS = {"steve", "alex", "rana"}
WALK_MIN_AREA = 1000
WALK_ROWS = 4  # facing rows (front, left, right, back)
WALK_COLS = 4  # walk frames per facing
PAGE_W = 2400
PAGE_H = 3200


def color_mask(a: np.ndarray, rgb: tuple[int, int, int]) -> np.ndarray:
    return (a[..., 0] == rgb[0]) & (a[..., 1] == rgb[1]) & (a[..., 2] == rgb[2])


def runs(row: np.ndarray) -> list[tuple[int, int]]:
    """[start, end) of the True runs in a 1-D bool array."""
    padded = np.concatenate(([False], row, [False]))
    d = np.diff(padded.astype(np.int8))
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def components(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    """4-connected components via run labelling. Returns (x0, y0, x1, y1, area), x1/y1 exclusive."""
    parent: list[int] = []

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[max(ri, rj)] = min(ri, rj)

    all_runs: list[tuple[int, int, int]] = []  # (y, x0, x1)
    prev: list[tuple[int, int, int]] = []  # (id, x0, x1)
    for y in range(mask.shape[0]):
        cur: list[tuple[int, int, int]] = []
        for x0, x1 in runs(mask[y]):
            rid = len(parent)
            parent.append(rid)
            all_runs.append((y, int(x0), int(x1)))
            cur.append((rid, int(x0), int(x1)))
        i = j = 0
        while i < len(prev) and j < len(cur):
            if prev[i][1] < cur[j][2] and cur[j][1] < prev[i][2]:
                union(prev[i][0], cur[j][0])
            if prev[i][2] < cur[j][2]:
                i += 1
            else:
                j += 1
        prev = cur
    boxes: dict[int, list[int]] = {}
    for rid, (y, x0, x1) in enumerate(all_runs):
        r = find(rid)
        b = boxes.get(r)
        if b is None:
            boxes[r] = [x0, y, x1, y + 1, x1 - x0]
        else:
            b[0] = min(b[0], x0)
            b[1] = min(b[1], y)
            b[2] = max(b[2], x1)
            b[3] = max(b[3], y + 1)
            b[4] += x1 - x0
    return [tuple(b) for b in boxes.values()]  # type: ignore[misc]


LABEL_MAX_H = 16  # stand-alone title boxes are ~10 px tall; real sections (header + cells) are taller
HEADER_MAX_H = 12  # the first row of a section is its label header when it is this short
LABEL_PAD = 1


def padded_label(label, shape) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = label
    return (max(0, x0 - LABEL_PAD), max(0, y0 - LABEL_PAD), min(shape[1], x1 + LABEL_PAD), min(shape[0], y1 + LABEL_PAD))


def split_cells(sec: np.ndarray) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    """Return (column spans, row spans) of cells inside a section crop.

    The header row (label box) is a row span too; vertical separators are measured below it,
    because a wide label box interrupts the separator colour in the header rows.
    """
    sep = color_mask(sec, SEP)

    def spans(is_sep: np.ndarray) -> list[tuple[int, int]]:
        return [(int(s), int(e)) for s, e in runs(~is_sep)]

    rows = spans(sep.mean(axis=1) >= SEP_FRACTION)
    k = 0
    while k + 1 < len(rows) and rows[k][1] - rows[k][0] <= HEADER_MAX_H:
        k += 1
    grid_top = rows[k][0] if k else 0
    cols = spans(sep[grid_top:].mean(axis=0) >= SEP_FRACTION)
    return cols, rows


def row_col_spans(sec: np.ndarray, rows: list[tuple[int, int]]) -> list[list[tuple[int, int]]] | None:
    """Per-row column spans for a block whose rows have their own dividers (hero WALKING blocks).

    Boots and hair cross the 1 px dividers of the full block, so the usual whole-block test finds none; inside one
    row band the dividers are intact (every pixel of the divider column is separator colour). Returns None unless
    every row has exactly WALK_COLS cells (other multi-row blocks, e.g. TALKING, keep their old slicing).
    """
    sep = color_mask(sec, SEP)
    out = []
    for ry0, ry1 in rows:
        spans = [(int(s), int(e)) for s, e in runs(~(sep[ry0:ry1].mean(axis=0) >= SEP_FRACTION))]
        if len(spans) != WALK_COLS:
            return None
        out.append(spans)
    return out


def slice_sheet(name: str) -> None:
    img = Image.open(SRC / f"{name}.png").convert("RGBA")
    a = np.array(img)
    out_dir = WORK / name
    (out_dir / "sections").mkdir(parents=True, exist_ok=True)
    print(f"[{name}] {img.size[0]}x{img.size[1]}: segmenting...", flush=True)

    mask = color_mask(a, CELL_BG) | color_mask(a, SEP)
    allc = [c for c in components(mask) if c[4] >= MIN_SECTION_AREA and c[2] - c[0] >= 8]
    titles = sorted((c[:4] for c in allc if c[3] - c[1] < LABEL_MAX_H), key=lambda c: (c[1], c[0]))
    comps = sorted((c for c in allc if c[3] - c[1] >= LABEL_MAX_H), key=lambda c: (c[1], c[0]))
    (out_dir / "titles").mkdir(exist_ok=True)
    for i, (tx0, ty0, tx1, ty1) in enumerate(titles):
        Image.fromarray(a[ty0:ty1, tx0:tx1]).save(out_dir / "titles" / f"{i:03d}.png")

    sections = []
    for n, (x0, y0, x1, y1, _area) in enumerate(comps):
        sec = a[y0:y1, x0:x1]
        cols, rows = split_cells(sec)
        label = None
        header_rows: list[tuple[int, int]] = []
        while len(rows) > 1 and rows[0][1] - rows[0][0] <= HEADER_MAX_H:
            header_rows.append(rows.pop(0))
        if header_rows:
            hy0, hy1 = header_rows[0]
            xs = np.flatnonzero((~color_mask(sec[hy0:hy1], SEP)).any(axis=0))
            if len(xs):
                label = (x0 + int(xs.min()), y0 + hy0, x0 + int(xs.max()) + 1, y0 + hy1)
        per_row = None
        if name in HERO_SHEETS and len(cols) <= 1 and len(rows) == WALK_ROWS and (x1 - x0) * (y1 - y0) >= WALK_MIN_AREA:
            per_row = row_col_spans(sec, rows)
        sdir = out_dir / "sections" / f"{n:03d}"
        sdir.mkdir(parents=True, exist_ok=True)
        for old in sdir.glob("frame_*.png"):
            old.unlink()
        if label:
            lx0, ly0, lx1, ly1 = padded_label(label, a.shape)
            Image.fromarray(a[ly0:ly1, lx0:lx1]).save(sdir / "label.png")
        frames = []
        k = 0
        for r, (ry0, ry1) in enumerate(rows):
            for c, (cx0, cx1) in enumerate(per_row[r] if per_row else cols):
                cell = sec[ry0:ry1, cx0:cx1]
                sprite = ~(color_mask(cell, CELL_BG) | color_mask(cell, SEP) | color_mask(cell, SHEET_BG))
                ys, xs = np.nonzero(sprite)
                entry = {"k": k, "row": r, "col": c}
                if len(xs):
                    fx0, fx1, fy0, fy1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
                    rgba = cell[fy0:fy1, fx0:fx1].copy()
                    rgba[~sprite[fy0:fy1, fx0:fx1]] = (0, 0, 0, 0)
                    Image.fromarray(rgba).save(sdir / f"frame_{k}.png")
                    cell_cx = (cx1 - cx0) / 2.0
                    entry.update(
                        x=x0 + cx0 + fx0, y=y0 + ry0 + fy0, w=fx1 - fx0, h=fy1 - fy0,
                        ox=round(cell_cx - fx0, 1), oy=(ry1 - ry0) - fy0, empty=False,
                    )
                else:
                    entry.update(empty=True)
                frames.append(entry)
                k += 1
        sections.append({
            "n": n, "bbox": [x0, y0, x1, y1],
            "label": list(label) if label else None,
            "header_rows": [list(h) for h in header_rows],
            "col_spans": [list(c) for c in cols],
            "cols": max(len(r) for r in per_row) if per_row else len(cols), "rows": len(rows),
            "cell_w": (per_row[0][0][1] - per_row[0][0][0]) if per_row else ((cols[0][1] - cols[0][0]) if cols else 0),
            "cell_h": (rows[0][1] - rows[0][0]) if rows else 0,
            **({"row_col_spans": [[list(c) for c in r] for r in per_row]} if per_row else {}),
            "frames": frames,
        })
    (out_dir / "sections.json").write_text(json.dumps({"sheet": name, "size": list(img.size), "titles": [list(t) for t in titles], "sections": sections}))
    nframes = sum(1 for s in sections for f in s["frames"] if not f["empty"])
    print(f"[{name}] {len(sections)} sections, {nframes} frames; building contact sheets...", flush=True)
    contact_sheets(name, img, sections, out_dir)


def contact_sheets(name: str, img: Image.Image, sections: list[dict], out_dir: Path) -> None:
    for old in out_dir.glob("contact_*.png"):
        old.unlink()
    blocks = []
    for s in sections:
        x0, y0, x1, y1 = s["bbox"]
        body = img.crop((x0, y0, x1, y1)).resize(((x1 - x0) * 2, (y1 - y0) * 2), Image.NEAREST)
        parts = []
        if s["label"]:
            lx0, ly0, lx1, ly1 = padded_label(tuple(s["label"]), (img.size[1], img.size[0]))
            parts.append(img.crop((lx0, ly0, lx1, ly1)).resize(((lx1 - lx0) * 2, (ly1 - ly0) * 2), Image.NEAREST))
        w = max([body.width] + [p.width for p in parts]) + 8
        head_h = 14
        h = head_h + sum(p.height for p in parts) + body.height + 8
        blk = Image.new("RGB", (max(w, 120), h), (30, 30, 30))
        d = ImageDraw.Draw(blk)
        nf = sum(1 for f in s["frames"] if not f["empty"])
        d.text((2, 1), f"#{s['n']:03d} {nf}f {s['cols']}x{s['rows']}", fill=(255, 255, 0))
        y = head_h
        for p in parts:
            blk.paste(p.convert("RGB"), (4, y))
            y += p.height
        blk.paste(body.convert("RGB"), (4, y))
        blocks.append(blk)
    page = 0
    x = y = shelf_h = 0
    canvas = Image.new("RGB", (PAGE_W, PAGE_H), (30, 30, 30))
    used_h = 0

    def flush() -> None:
        nonlocal canvas, page, used_h
        if used_h:
            canvas.crop((0, 0, PAGE_W, used_h)).save(out_dir / f"contact_{page}.png")
            page += 1
        canvas = Image.new("RGB", (PAGE_W, PAGE_H), (30, 30, 30))
        used_h = 0

    for blk in blocks:
        if x + blk.width > PAGE_W and x > 0:
            x, y, shelf_h = 0, y + shelf_h + 4, 0
        if y + blk.height > PAGE_H and y > 0:
            flush()
            x = y = shelf_h = 0
        canvas.paste(blk, (x, y))
        used_h = max(used_h, y + blk.height)
        x += blk.width + 4
        shelf_h = max(shelf_h, blk.height)
    flush()


def main() -> None:
    names = sys.argv[1:] or SHEETS
    for n in names:
        slice_sheet(n)


if __name__ == "__main__":
    main()
