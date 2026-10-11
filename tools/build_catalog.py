#!/usr/bin/env python3
"""Build assets-src/manifest.json and docs/ASSET_CATALOG.md from the sliced sheets.

Run after tools/slice_sheets.py and tools/ocr_labels.py decode. Everything is derived from the
decoded pixel-font labels, so ids are reproducible. Hand overrides live in tools/manifest_overrides.json
({"ship": [id prefixes to ship], "unship": [...]}).

Hero sheets (steve/alex/rana): armor tier comes from the title above each column group, the
rest from the section label ("IDLE (SWORD) (WOOD)" ...).
Mob sheets (enemies/allies/animals/villagers): one block holds a name row plus animation label
clusters; each animation owns the cell columns from its label to the next label.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from PIL import Image

from ocr_labels import text_clusters

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "assets-work"
SRC = ROOT / "assets-src"
KNOWN = json.loads((Path(__file__).resolve().parent / "font_glyphs.json").read_text())
OVR_PATH = Path(__file__).resolve().parent / "manifest_overrides.json"
OVR = json.loads(OVR_PATH.read_text()) if OVR_PATH.exists() else {"ship": [], "unship": []}

HEROES = ["steve", "alex", "rana"]
MOB_SHEETS = {"enemies": "mob", "allies": "ally", "animals": "pet", "villagers": "npc"}
ARMOR = {"NO ARMOR": "none", "LEATHER ARMOR": "leather", "CHAINMAIL ARMOR": "chainmail", "GOLD ARMOR": "gold",
         "IRON ARMOR": "iron", "DIAMOND ARMOR": "diamond", "NETHERITE ARMOR": "netherite", "ENCHANTED ARMOR": "enchanted"}
ANIM_SYN = {"walking": "walk", "running": "walk", "swimming": "swim", "bite": "attack", "scratch": "attack",
            "swing": "attack", "peck": "attack", "talking": "talk"}
FPS = {"idle": 6, "walk": 8, "swim": 8, "attack": 10, "hurt": 10, "death": 8, "talk": 6, "punch": 10, "swing": 12}
LOOPING = {"idle", "walk", "swim", "talk"}


def slug(text: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", text.lower())).strip("_")


def anim_name(raw: str) -> str:
    s = slug(raw)
    return ANIM_SYN.get(s, s)


def entry(eid: str, sheet: str, section: int, frames: list[int], tags: list[str]) -> dict:
    anim = next((t[5:] for t in tags if t.startswith("anim:")), "idle")
    return {"id": eid, "sheet": sheet, "section": section, "frames": frames,
            "fps": FPS.get(anim, 8), "loop": anim in LOOPING, "tags": tags}


def real_frames(sec: dict, cols: range | None = None) -> list[int]:
    return [f["k"] for f in sec["frames"] if not f["empty"] and (cols is None or f["col"] in cols)]


def hero_entries(sheet: str, catalog: list[dict]) -> list[dict]:
    meta = json.loads((WORK / sheet / "sections.json").read_text())
    labels = json.loads((WORK / sheet / "labels.json").read_text())
    titles = [(t[0], labels["titles"].get(str(i), "")) for i, t in enumerate(meta["titles"])]
    armor_titles = sorted((x, ARMOR[t]) for x, t in titles if t in ARMOR)
    out = []
    for sec in meta["sections"]:
        text = labels["sections"].get(str(sec["n"]), "")
        x0 = sec["bbox"][0]
        armor = next((a for x, a in reversed(armor_titles) if x <= x0 + 2), "none")
        m = re.match(r"^(IDLE TALKING|IDLE|PUNCH|SWORD SWING)(?: \(SWORD\))? ?(?:\((\w+)\))?$", text)
        frames = real_frames(sec)
        if not frames:
            continue
        if m:
            head, tier = m.group(1), (m.group(2) or "").lower()
            anim = {"IDLE TALKING": "talk", "IDLE": "idle", "PUNCH": "punch", "SWORD SWING": "swing"}[head]
            weapon = f"sword_{tier}" if tier else "none"
            eid = f"hero.{sheet}.{armor}.{weapon}.{anim}"
            tags = ["hero", sheet, f"armor:{armor}", f"weapon:{weapon}", f"anim:{anim}"]
            e = entry(eid, sheet, sec["n"], frames, tags)
            e["ship"] = anim in ("idle", "punch", "swing")
            out.append(e)
        catalog.append({"sheet": sheet, "n": sec["n"], "armor": armor, "label": text, "frames": len(frames)})
    # duplicate ids (same label twice) keep the first
    seen, uniq = set(), []
    for e in out:
        if e["id"] not in seen:
            seen.add(e["id"])
            uniq.append(e)
    return uniq


def mob_entries(sheet: str, prefix: str, catalog: list[dict]) -> list[dict]:
    meta = json.loads((WORK / sheet / "sections.json").read_text())
    img = Image.open(SRC / f"{sheet}.png").convert("RGB")
    blocks = []
    for sec in meta["sections"]:
        x0, y0, x1, y1 = sec["bbox"]
        per_row = [text_clusters(img.crop((x0, y0 + hy0, x1, y0 + hy1)), KNOWN) for hy0, hy1 in sec.get("header_rows", [])]
        clusters = [c for row in per_row for c in row]
        blocks.append((sec, [], clusters))
    vocab = Counter(t for _s, _n, cl in blocks for t in {t for _x, t in cl})
    # Animation labels repeat across dozens of blocks; mob names do not (threshold measured on the sheets).
    anim_words = {t for t, n in vocab.items() if n >= 20 and len(t) <= 20}
    out = []
    for sec, name_row, clusters in blocks:
        frames_all = real_frames(sec)
        if not frames_all:
            continue
        names = [t for _x, t in name_row] or [t for _x, t in clusters if t not in anim_words]
        anims = sorted((x, t) for x, t in clusters if t in anim_words and t not in names)
        name = max(names, key=len) if names else "unnamed"
        spans = sec.get("col_spans", [])
        entries_here = []
        if anims and spans:
            starts = []
            for x, t in anims:
                col = max((i for i, s in enumerate(spans) if s[0] <= x), default=0)
                starts.append((col, t))
            for i, (col, t) in enumerate(starts):
                end = starts[i + 1][0] if i + 1 < len(starts) else len(spans)
                fr = real_frames(sec, range(col, max(end, col + 1)))
                for part in t.split("/"):
                    entries_here.append((anim_name(part), fr))
        else:
            entries_here.append(("idle", frames_all))
        catalog.append({"sheet": sheet, "n": sec["n"], "name": name,
                        "anims": {a: len(f) for a, f in entries_here}})
        base = f"{prefix}.{slug(name)}"
        for anim, fr in entries_here:
            if not fr:
                continue
            tags = [prefix, slug(name), f"anim:{anim}"]
            e = entry(f"{base}.{anim}", sheet, sec["n"], fr, tags)
            e["ship"] = False
            out.append(e)
    seen, uniq = set(), []
    for e in out:
        if e["id"] not in seen:
            seen.add(e["id"])
            uniq.append(e)
    return uniq


def catalog_md(cat: dict[str, list[dict]], entries: list[dict]) -> str:
    L = ["# MineSurvive — Asset catalogue", "",
         "Generated by `tools/build_catalog.py` from the decoded sheet labels (do not edit by hand; "
         "re-run the tools). Section numbers refer to `assets-work/<sheet>/sections.json`; "
         "the manifest is `assets-src/manifest.json`. `Ship` = packed into the v1.0 atlas.", ""]
    shipped = {e["sheet"]: 0 for e in entries}
    for e in entries:
        if e.get("ship"):
            shipped[e["sheet"]] += 1
    L.append("| Sheet | Sections | Manifest entries | Shipped entries |")
    L.append("|---|---|---|---|")
    for sh, rows in cat.items():
        n_e = sum(1 for e in entries if e["sheet"] == sh)
        L.append(f"| {sh} | {len(rows)} | {n_e} | {shipped.get(sh, 0)} |")
    L.append("")
    for sh, rows in cat.items():
        L.append(f"## {sh}")
        L.append("")
        if sh in HEROES:
            by_armor: dict[str, Counter] = {}
            for r in rows:
                by_armor.setdefault(r["armor"], Counter())[re.sub(r"\(\w+\)", "", r["label"]).strip()] += 1
            L.append("Armor tiers found: " + ", ".join(by_armor) + ". Section labels per armor (count of tiers):")
            L.append("")
            L.append("| Label | Sections per armor tier |")
            L.append("|---|---|")
            lab = Counter()
            for r in rows:
                if r["armor"] == "none":
                    lab[re.sub(r"\(\w+\)", "", r["label"]).replace("  ", " ").strip()] += 1
            for k, v in sorted(lab.items()):
                L.append(f"| {k or '(blank)'} | {v} |")
        else:
            L.append("| Section | Name | Animations (frames) |")
            L.append("|---|---|---|")
            for r in rows:
                an = ", ".join(f"{a} {n}" for a, n in r["anims"].items())
                L.append(f"| {r['n']} | {r['name'].title()} | {an} |")
        L.append("")
    return "\n".join(L)


def main() -> None:
    entries: list[dict] = []
    cat: dict[str, list[dict]] = {}
    for sh in HEROES:
        cat[sh] = []
        entries += hero_entries(sh, cat[sh])
    for sh, prefix in MOB_SHEETS.items():
        cat[sh] = []
        entries += mob_entries(sh, prefix, cat[sh])
    for e in entries:
        if any(e["id"].startswith(p) for p in OVR.get("ship", [])):
            e["ship"] = True
        if any(e["id"].startswith(p) for p in OVR.get("unship", [])):
            e["ship"] = False
    (SRC / "manifest.json").write_text(json.dumps({"version": 1, "entries": entries}, separators=(",", ":")))
    (ROOT / "docs" / "ASSET_CATALOG.md").write_text(catalog_md(cat, entries))
    print(f"manifest: {len(entries)} entries ({sum(1 for e in entries if e['ship'])} shipped)")


if __name__ == "__main__":
    main()
