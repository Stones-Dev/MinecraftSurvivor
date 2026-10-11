#!/usr/bin/env python3
"""Pack the manifest entries marked "ship": true into power-of-two atlas pages.

Reads assets-src/manifest.json and the sliced frames in assets-work/, writes
public/atlas/atlas_<n>.png and public/atlas/atlas.json:

{ "version": 1,
  "pages": ["atlas_0.png"],
  "frames": { "<sheet>.<section>.<k>": {"page":0,"x":..,"y":..,"w":..,"h":..,"ox":..,"oy":..},
              "<key>@flash": {...} },              # white silhouette for hit flashes
  "anims":  { "<manifest id>": {"frames": ["<key>", ...], "fps": 10, "loop": false} } }

ox/oy = feet anchor relative to the packed frame's top-left. Frames are packed with 1 px padding
(transparent) on every side. Usage: python3 tools/build_atlas.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "assets-work"
OUT = ROOT / "public" / "atlas"
PAGE_W = 2048
MAX_H = 4096
PAD = 1
WARN_BYTES = 5 * 1024 * 1024


def next_pow2(n: int) -> int:
    p = 1
    while p < n:
        p *= 2
    return p


def flash_of(img: Image.Image) -> Image.Image:
    a = np.array(img)
    a[..., :3] = 255
    return Image.fromarray(a)


def main() -> None:
    manifest = json.loads((ROOT / "assets-src" / "manifest.json").read_text())
    geometry: dict[str, dict] = {}
    frames: dict[str, Image.Image] = {}
    meta: dict[str, tuple[float, float]] = {}
    anims: dict[str, dict] = {}
    for e in manifest["entries"]:
        if not e.get("ship"):
            continue
        sheet = e["sheet"]
        if sheet not in geometry:
            geometry[sheet] = {s["n"]: s for s in json.loads((WORK / sheet / "sections.json").read_text())["sections"]}
        sec = geometry[sheet][e["section"]]
        keys = []
        for k in e["frames"]:
            key = f"{sheet}.{e['section']}.{k}"
            if key not in frames:
                f = next(f for f in sec["frames"] if f["k"] == k)
                frames[key] = Image.open(WORK / sheet / "sections" / f"{e['section']:03d}" / f"frame_{k}.png").convert("RGBA")
                meta[key] = (f["ox"], f["oy"])
                frames[key + "@flash"] = flash_of(frames[key])
                meta[key + "@flash"] = meta[key]
            keys.append(key)
        anims[e["id"]] = {"frames": keys, "fps": e["fps"], "loop": e["loop"]}

    order = sorted(frames, key=lambda k: (-frames[k].height, k))
    pages: list[Image.Image] = []
    placed: dict[str, dict] = {}
    page = Image.new("RGBA", (PAGE_W, MAX_H), (0, 0, 0, 0))
    x = y = shelf = used = 0

    def finish() -> None:
        nonlocal page, x, y, shelf, used
        pages.append(page.crop((0, 0, PAGE_W, next_pow2(max(used, 1)))))
        page = Image.new("RGBA", (PAGE_W, MAX_H), (0, 0, 0, 0))
        x = y = shelf = used = 0

    for key in order:
        im = frames[key]
        w, h = im.width + 2 * PAD, im.height + 2 * PAD
        if x + w > PAGE_W:
            x, y, shelf = 0, y + shelf, 0
        if y + h > MAX_H:
            finish()
        page.paste(im, (x + PAD, y + PAD))
        ox, oy = meta[key]
        placed[key] = {"page": len(pages), "x": x + PAD, "y": y + PAD, "w": im.width, "h": im.height, "ox": ox, "oy": oy}
        x += w
        shelf = max(shelf, h)
        used = max(used, y + h)
    if used:
        finish()

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("atlas_*.png"):
        old.unlink()
    total = 0
    names = []
    for i, p in enumerate(pages):
        name = f"atlas_{i}.png"
        p.save(OUT / name, optimize=True)
        total += (OUT / name).stat().st_size
        names.append(name)
    (OUT / "atlas.json").write_text(json.dumps({"version": 1, "pages": names, "frames": placed, "anims": anims}, separators=(",", ":")))
    print(f"atlas: {len(frames) // 2} frames (+flash), {len(anims)} anims, {len(pages)} page(s), {total / 1024:.0f} KiB")
    if total > WARN_BYTES:
        print("WARNING: atlas exceeds 5 MB, ask the owner before committing it (BRIEF 0.5)")


if __name__ == "__main__":
    main()
