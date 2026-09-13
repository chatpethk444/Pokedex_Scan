"""Style-subset accuracy probe. Run: python src/probe_styles.py"""
import glob
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import timm
import torch
from torch.utils.data import DataLoader

from train import ImageListDataset, build_transforms, evaluate

ckpt = torch.load("outputs/best.pt", map_location="cpu", weights_only=True)
classes = ckpt["classes"]
c2i = {c: i for i, c in enumerate(classes)}
_, tf = build_transforms(ckpt.get("img_size", 224))
model = timm.create_model(ckpt["model"], pretrained=False, num_classes=len(classes))
model.load_state_dict(ckpt["state"])
model.eval()

for pat, tag in [("pokemon_dataset/*/web_card_*", "cards"),
                 ("pokemon_dataset/*/web_art_*", "artwork"),
                 ("pokemon_dataset/*/web_sprite_*", "sprites"),
                 ("pokemon_dataset/*/syn_neon_*", "syn_neon"),
                 ("pokemon_dataset/*/*", "all")]:
    fs = sorted(f for f in glob.glob(pat)
                if Path(f).is_file() and not Path(f).parent.name.startswith("_"))
    ys = [c2i[Path(f).parent.name] for f in fs]
    ld = DataLoader(ImageListDataset(fs, ys, tf), batch_size=32)
    r = evaluate(model, ld, "cpu", classes)
    print(f"{tag}: n={len(fs)} acc={r['acc']:.4f} f1={r['f1_macro']:.4f} cm={r['cm']}")

# production metric: real images only (no synthetic)
fs = sorted(f for f in glob.glob("pokemon_dataset/*/*")
            if Path(f).is_file() and not Path(f).parent.name.startswith("_")
            and "syn_neon_" not in Path(f).name)
ys = [c2i[Path(f).parent.name] for f in fs]
ld = DataLoader(ImageListDataset(fs, ys, tf), batch_size=32)
r = evaluate(model, ld, "cpu", classes)
print(f"real: n={len(fs)} acc={r['acc']:.4f} f1={r['f1_macro']:.4f} cm={r['cm']}")
