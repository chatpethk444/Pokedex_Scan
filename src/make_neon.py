"""Synthesize neon-glow-on-black variants from existing dataset images.

Mimics the failing tail style (glowing edges, dark background) without
scraping the web: edge map -> glow -> tint -> black background.

Run:
  python src/make_neon.py --per-class 20 --seed 7
  python src/make_neon.py --per-class 20 --dry-run   (list only)

Output: pokemon_dataset/<Class>/syn_neon_<stem>_<hue>.jpg
Skips files already generated (by name). Deterministic via --seed.
"""
import argparse
import random
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
HUES = {
    "gold": (255, 196, 64),    # like the failing Abra neon
    "cyan": (96, 224, 255),
    "magenta": (255, 96, 224),
}


def neonify_simple(img: Image.Image, hue: tuple, size: int = 512,
                    keep_fill: float = 0.18) -> Image.Image:
    """Edge core + blurred halo, tinted, over a darkened original.

    keep_fill>0 preserves silhouette/color cues (v1 pure-black bg made
    edge-only images label-ambiguous and hurt training).
    """
    base = ImageOps.fit(img.convert("RGB"), (size, size))
    gray = base.convert("L").filter(ImageFilter.GaussianBlur(1.2))
    edges = ImageOps.autocontrast(gray.filter(ImageFilter.FIND_EDGES), cutoff=1)
    halo = edges.filter(ImageFilter.GaussianBlur(2.0))
    core = edges.point(lambda v: min(255, int(v * 1.2)))
    import numpy as np
    glow = Image.fromarray(
        (np.array(core, dtype=float) + np.array(halo, dtype=float) * 0.6
         ).clip(0, 255).astype("uint8"))
    r, g, b = hue
    tinted = Image.merge("RGB", [
        glow.point(lambda v: int(v * r / 255)),
        glow.point(lambda v: int(v * g / 255)),
        glow.point(lambda v: int(v * b / 255)),
    ])
    dark = base.point(lambda v: int(v * keep_fill))
    return Image.blend(dark, tinted, 0.75)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=20)
    ap.add_argument("--hues", nargs="+", default=["gold", "cyan"], choices=list(HUES))
    ap.add_argument("--out", default="pokemon_dataset")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    try:
        import numpy  # noqa: F401
    except ImportError:
        raise SystemExit("need numpy: pip install numpy")

    out = Path(args.out)
    classes = sorted(d.name for d in out.iterdir()
                     if d.is_dir() and not d.name.startswith("_"))
    for cls in classes:
        cdir = out / cls
        pool = sorted(f for f in cdir.iterdir()
                      if f.is_file() and f.suffix.lower() in IMG_EXTS
                      and not f.name.startswith("syn_neon_")
                      and "web_card" not in f.name)  # cards never glow; text noise
        picks = rng.sample(pool, min(args.per_class, len(pool)))
        print(f"{cls}: pool={len(pool)} picks={len(picks)}")
        for src in picks:
            for hue in args.hues:
                dest = cdir / f"syn_neon_{src.stem}_{hue}.jpg"
                if dest.exists():
                    continue
                if args.dry_run:
                    print(f"  DRY {dest.name}")
                    continue
                with Image.open(src) as im:
                    neonify_simple(im, HUES[hue]).save(dest, quality=90)
        if not args.dry_run:
            n = len(list(cdir.glob("syn_neon_*")))
            print(f"  syn_neon total={n}")


if __name__ == "__main__":
    main()
