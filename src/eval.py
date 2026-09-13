"""Evaluate checkpoint on locked test split.
Run: python src/eval.py --ckpt outputs/best.pt --split outputs/split.json
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from train import ImageListDataset, build_transforms, evaluate, fmt_report

import torch
import timm
from torch.utils.data import DataLoader


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="outputs/best.pt")
    ap.add_argument("--split", default="outputs/split.json")
    ap.add_argument("--batch", type=int, default=32)
    args = ap.parse_args()

    ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    classes = ckpt["classes"]
    _, val_tf = build_transforms(ckpt.get("img_size", 224))
    split = json.loads(Path(args.split).read_text())
    cls_to_idx = {c: i for i, c in enumerate(classes)}
    files = [f for f in split["test"]]
    labels = [cls_to_idx[Path(f).parent.name] for f in files]

    ds = ImageListDataset(files, labels, val_tf)
    ld = DataLoader(ds, batch_size=args.batch)
    model = timm.create_model(ckpt["model"], pretrained=False, num_classes=len(classes))
    model.load_state_dict(ckpt["state"])
    model.eval()

    m = evaluate(model, ld, "cpu", classes)
    print(f"n_test={len(files)}\n" + fmt_report(m, classes))


if __name__ == "__main__":
    main()
