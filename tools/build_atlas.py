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

Layered hero frames (steve / alex / rana sheets) also carry their feet, measured here from the pixels so the
game does not scan them at run time (same rule as the old `core/feet.ts`, which now only holds the shift maths):
  fx  horizontal centre of the first foot relative to the anchor (frame px, unflipped)
  fy  px from the bottom of the feet up to the anchor (0 = feet exactly on the anchor row)
  bx  horizontal centre of the whole foot band (both shoes) relative to the anchor: the body centre
Weapon overlays for the walk cycle are cut out of the sword idle frames: anim `hero.<name>.none.sword_<tier>.held`
(frames `held.<name>.<tier>` + `@flash`), anchored at the fist so the game can put the grip on the walking hero's hand.
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
HEROES = ("steve", "alex", "rana")
SWORD_TIERS = ("wood", "stone", "gold", "iron", "diamond", "netherite", "enchanted")
MIN_FOOT_RUN = 4  # narrowest run of equally low columns that counts as a foot (shoes are 5-6 px wide)
ALPHA_MIN = 20


def next_pow2(n: int) -> int:
    p = 1
    while p < n:
        p *= 2
    return p


def flash_of(img: Image.Image) -> Image.Image:
    a = np.array(img)
    a[..., :3] = 255
    return Image.fromarray(a)


def column_bottoms(img: Image.Image) -> list[int]:
    """Lowest opaque row of every column (-1 for an empty column)."""
    a = np.array(img)[..., 3] > ALPHA_MIN
    out = []
    for x in range(a.shape[1]):
        ys = np.flatnonzero(a[:, x])
        out.append(int(ys[-1]) if len(ys) else -1)
    return out


def measure_feet(img: Image.Image, ox: float, oy: float) -> dict | None:
    """Feet of a hero frame: the leftmost run of >= MIN_FOOT_RUN columns that end on the same row (a weapon or a
    cape to the right may reach lower, so the first run wins, not the lowest), plus the centre of the whole band."""
    bottoms = column_bottoms(img)
    n = len(bottoms)
    i = 0
    while i < n:
        b = bottoms[i]
        j = i
        while j + 1 < n and b >= 0 and bottoms[j + 1] == b:
            j += 1
        if b >= 0 and j - i + 1 >= MIN_FOOT_RUN:
            band = [x for x in range(n) if b - 1 <= bottoms[x] <= b + 1]
            return {"fx": (i + j + 1) / 2 - ox, "fy": oy - (b + 1), "bx": (min(band) + max(band) + 1) / 2 - ox}
        i = j + 1
    return None


def components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """8-connected components of a bool mask as lists of (y, x)."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            seen[y, x] = True
            stack, pts = [(y, x)], []
            while stack:
                cy, cx = stack.pop()
                pts.append((cy, cx))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            out.append(pts)
    return out


def cut_sword(armed: Image.Image, bare: Image.Image) -> tuple[Image.Image, tuple[float, float]]:
    """Cut the sword out of a sword idle frame: pixels whose colour is not in the unarmed idle frame of the same hero
    (plus colours the bare hero only has down at the shoes, a sword may share one), largest connected piece.
    Returns the trimmed sword and the fist centre in its pixel coordinates (the grip)."""
    a, b = np.array(armed), np.array(bare)
    h = a.shape[0]
    opaque_a, opaque_b = a[..., 3] > ALPHA_MIN, b[..., 3] > ALPHA_MIN
    bare_pal = {tuple(p[:3]) for p in b[opaque_b]}
    high_pal = {tuple(b[y, x, :3]) for y, x in zip(*np.nonzero(opaque_b)) if y < h * 0.7}
    foot_only = bare_pal - high_pal
    own = np.zeros(opaque_a.shape, dtype=bool)
    for y, x in zip(*np.nonzero(opaque_a)):
        c = tuple(a[y, x, :3])
        own[y, x] = c not in bare_pal or (c in foot_only and y < h * 0.7)
    pieces = sorted(components(own), key=len, reverse=True)
    keep = np.zeros(own.shape, dtype=bool)
    for y, x in pieces[0]:
        keep[y, x] = True
    ys, xs = np.nonzero(keep)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    out = np.zeros_like(a)
    out[keep] = a[keep]
    # The fist: opaque pixels that are not the sword but touch it (the hand around the handle).
    near = np.zeros_like(keep)
    for y, x in zip(ys, xs):
        near[max(0, y - 1):y + 2, max(0, x - 1):x + 2] = True
    fist = near & opaque_a & ~keep
    fy, fx = np.nonzero(fist)
    if len(fx):
        gx, gy = float(fx.mean()) + 0.5 - x0, float(fy.mean()) + 0.5 - y0
    else:
        gx, gy = 1.0, float(y1 - y0 - 1)
    return Image.fromarray(out[y0:y1, x0:x1]), (round(gx * 2) / 2, round(gy * 2) / 2)


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

    # Feet of the layered hero frames (measured once here, read by the game from atlas.json).
    feet: dict[str, dict] = {}
    for key, im in list(frames.items()):
        if key.split(".")[0] in HEROES and not key.endswith("@flash"):
            m = measure_feet(im, *meta[key])
            if m:
                feet[key] = {k: round(v * 2) / 2 for k, v in m.items()}

    # Sword overlays for the unarmed walk frames.
    for h in HEROES:
        bare_id = f"hero.{h}.none.none.idle"
        if bare_id not in anims:
            continue
        bare = frames[anims[bare_id]["frames"][0]]
        for tier in SWORD_TIERS:
            sid = f"hero.{h}.none.sword_{tier}.idle"
            if sid not in anims:
                continue
            sword, grip = cut_sword(frames[anims[sid]["frames"][0]], bare)
            key = f"held.{h}.{tier}"
            frames[key] = sword
            meta[key] = grip
            frames[key + "@flash"] = flash_of(sword)
            meta[key + "@flash"] = grip
            anims[f"hero.{h}.none.sword_{tier}.held"] = {"frames": [key], "fps": 1, "loop": False}

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
        placed[key].update(feet.get(key, {}))
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
