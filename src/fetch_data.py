"""Fetch varied images per class into the dataset (TCG cards + official artwork + sprites).

Sources (no API key needed):
  - cards:    TCGdex card scans  (https://api.tcgdex.net) — full-card style
  - artwork:  PokeAPI official/home artwork — clean art style
  - sprites:  PokeAPI game sprites — pixel style

Run:
  python src/fetch_data.py --classes Abra Aerodactyl --per-class 30
  python src/fetch_data.py --classes Abra --sources cards --per-class 50 --dry-run

Output: pokemon_dataset/<Class>/web_<source>_<id>.png (+ outputs/fetch_manifest.json)
Dedupes by md5 against files already in the class dir. Verifies with PIL.
"""
import argparse
import hashlib
import json
import re
import time
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image

UA = {"User-Agent": "pokt-fetch/1.0"}
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def md5_of_file(p: Path) -> str:
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def existing_hashes(class_dir: Path) -> set:
    out = set()
    if class_dir.is_dir():
        for f in class_dir.iterdir():
            if f.is_file() and f.suffix.lower() in IMG_EXTS:
                try:
                    out.add(md5_of_file(f))
                except OSError:
                    pass
    return out


def get(session: requests.Session, url: str, timeout=30, tries=3):
    for i in range(tries):
        try:
            r = session.get(url, timeout=timeout)
            if r.status_code == 200:
                return r
            time.sleep(1 + i)
        except requests.RequestException:
            time.sleep(1 + i)
    return None


def valid_image(data: bytes) -> bool:
    try:
        with Image.open(BytesIO(data)) as im:
            im.verify()
        with Image.open(BytesIO(data)) as im:
            im.convert("RGB")
        return True
    except Exception:
        return False


def save(class_dir: Path, stem: str, data: bytes, seen: set) -> str | None:
    h = hashlib.md5(data).hexdigest()
    if h in seen or not valid_image(data):
        return None
    ext = ".png" if data[:8] == b"\x89PNG\r\n\x1a\n" else ".jpg"
    dest = class_dir / f"{stem}{ext}"
    k = 1
    while dest.exists():
        k += 1
        dest = class_dir / f"{stem}_{k}{ext}"
    dest.write_bytes(data)
    seen.add(h)
    return dest.name


def word_match(card_name: str, target: str) -> bool:
    return re.search(rf"(?<![a-z]){re.escape(target.lower())}(?![a-z])",
                     card_name.lower()) is not None


def fetch_cards(session, target: str, per_class: int, log):
    """TCGdex card scans (Pokemon category only - skips Trainer/Energy
    cards like Old Amber that show no creature). Returns [(stem, url)]."""
    r = get(session, f"https://api.tcgdex.net/v2/en/cards?name={target}")
    if not r:
        log(f"  [cards] api fail for {target}")
        return []
    out = []
    for c in r.json():
        if not word_match(c.get("name", ""), target):
            continue
        # category check: Trainer/Energy cards show items, not the Pokemon
        det = get(session, f"https://api.tcgdex.net/v2/en/cards/{c['id']}")
        if not det or det.json().get("category") != "Pokemon":
            log(f"  [cards] skip {c['id']} ({c.get('name')}, "
                f"{det.json().get('category') if det else 'api-fail'})")
            continue
        base = c.get("image")
        if not base:
            continue
        cid = re.sub(r"\W+", "-", c["id"])
        for q in ("high", "low"):  # big first, fallback small
            out.append((f"web_card_{cid}_{q}", f"{base}/{q}.png"))
            if len(out) // 2 >= per_class:
                break
        if len(out) // 2 >= per_class:
            break
    # flatten pairs later: keep high, fallback low at download time
    picked, used = [], set()
    for stem, url in out:
        key = stem.rsplit("_", 1)[0]
        if key not in used:
            used.add(key)
            picked.append((stem, url))
    return picked[:per_class]


def fetch_pokeapi(session, target: str, want_artwork: bool, want_sprites: bool, log):
    """Official artwork + sprites. Returns [(stem, url)]."""
    r = get(session, f"https://pokeapi.co/api/v2/pokemon/{target.lower()}")
    if not r:
        log(f"  [pokeapi] no entry for {target}")
        return []
    d = r.json()
    pid = d["id"]
    sp = d.get("sprites", {}) or {}
    other = sp.get("other", {}) or {}
    out = []
    if want_artwork:
        for key in ("official-artwork", "home"):
            url = (other.get(key) or {}).get("front_default")
            if url:
                out.append((f"web_art_{key}_{pid}", url))
    if want_sprites:
        for key in ("front_default", "front_shiny", "back_default"):
            if sp.get(key):
                out.append((f"web_sprite_{key}_{pid}", sp[key]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--classes", nargs="+", default=None,
                    help="default: every subdir of --out")
    ap.add_argument("--per-class", type=int, default=30)
    ap.add_argument("--sources", nargs="+", default=["cards", "artwork", "sprites"],
                    choices=["cards", "artwork", "sprites"])
    ap.add_argument("--out", default="pokemon_dataset")
    ap.add_argument("--manifest", default="outputs/fetch_manifest.json")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delay", type=float, default=0.3)
    args = ap.parse_args()

    out = Path(args.out)
    classes = args.classes or sorted(
        d.name for d in out.iterdir() if d.is_dir() and not d.name.startswith("_"))
    log = print
    session = requests.Session()
    session.headers.update(UA)

    manifest_path = Path(args.manifest)
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []

    for cls in classes:
        class_dir = out / cls
        class_dir.mkdir(parents=True, exist_ok=True)
        seen = existing_hashes(class_dir)
        log(f"{cls}: existing={len(seen)}")

        jobs = []
        if "cards" in args.sources:
            jobs += [("card", s, u) for s, u in fetch_cards(session, cls, args.per_class, log)]
        pa = fetch_pokeapi(session, cls,
                           "artwork" in args.sources, "sprites" in args.sources, log)
        jobs += [("pokeapi", s, u) for s, u in pa]
        log(f"  candidates={len(jobs)}")
        if args.dry_run:
            for kind, stem, url in jobs:
                log(f"  DRY {kind} {stem} {url}")
            continue

        added = 0
        for kind, stem, url in jobs:
            urls = [url] if kind == "pokeapi" else [url]
            if kind == "card" and url.endswith("_high.png"):
                urls.append(url.replace("_high.png", "_low.png"))
            name = None
            for u in urls:
                r = get(session, u)
                if r and valid_image(r.content):
                    name = save(class_dir, stem, r.content, seen)
                    if name:
                        break
            if name:
                added += 1
                manifest.append({"class": cls, "file": name, "url": url, "kind": kind})
            time.sleep(args.delay)
        log(f"  added={added}")

    if not args.dry_run:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=1))
        log(f"manifest: {manifest_path} ({len(manifest)} rows)")


if __name__ == "__main__":
    main()
