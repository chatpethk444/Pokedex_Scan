"""Pokemon classifier: timm transfer learning.
Run: python src/train.py --data pokemon_dataset --epochs 15 --batch 32
Output: outputs/best.pt, outputs/classes.txt, outputs/split.json, outputs/history.csv
Split: 70/15/15 stratified (train/val/test). Model selection on val macro-F1.
Early stop: --patience N. Resume: --resume outputs/best.pt --epochs <more>.
"""
import argparse
import json
import random
from pathlib import Path

import torch
import timm
from PIL import Image
from sklearn.metrics import (accuracy_score, balanced_accuracy_score,
                             confusion_matrix, f1_score, recall_score)
from sklearn.model_selection import train_test_split
from torch import nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision import transforms

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


class ImageListDataset(Dataset):
    def __init__(self, files, labels, transform=None):
        self.files = files
        self.labels = labels
        self.transform = transform

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        with Image.open(self.files[i]) as img:
            if img.mode == "P":  # palette+transparency -> silent RGB
                img = img.convert("RGBA")
            img = img.convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, self.labels[i]


def collect(data_dir: Path):
    files, labels, classes = [], [], sorted(
        d.name for d in data_dir.iterdir()
        if d.is_dir() and not d.name.startswith("_")  # skip _quarantine etc.
    )
    cls_to_idx = {c: i for i, c in enumerate(classes)}
    for cls in classes:
        for f in (data_dir / cls).iterdir():
            if f.suffix.lower() in IMG_EXTS:
                files.append(str(f))
                labels.append(cls_to_idx[cls])
    return files, labels, classes


def evaluate(model, loader, device, classes):
    ys, ps = [], []
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            ps += model(x).argmax(1).cpu().tolist()
            ys += y.tolist()
    return {
        "acc": accuracy_score(ys, ps),
        "bal_acc": balanced_accuracy_score(ys, ps),
        "f1_macro": f1_score(ys, ps, average="macro", zero_division=0),
        "recall": recall_score(ys, ps, average=None, zero_division=0).tolist(),
        "cm": confusion_matrix(ys, ps).tolist(),
    }


def fmt_report(m, classes):
    lines = [f"acc={m['acc']:.4f} bal_acc={m['bal_acc']:.4f} f1_macro={m['f1_macro']:.4f}"]
    for i, c in enumerate(classes):
        lines.append(f"  recall[{c}]={m['recall'][i]:.4f}")
    lines.append(f"  cm={m['cm']}")
    return "\n".join(lines)


def build_transforms(img_size: int):
    mean, std = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(img_size, scale=(0.5, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(20),
        transforms.ColorJitter(0.2, 0.2, 0.2),
        transforms.RandomGrayscale(p=0.2),  # coloring-page / line-art style
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
        transforms.RandomErasing(p=0.25),  # ignore card text/border patches
    ])
    val_tf = transforms.Compose([
        transforms.Resize(int(img_size * 1.14)),
        transforms.CenterCrop(img_size),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    return train_tf, val_tf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="pokemon_dataset")
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--img-size", type=int, default=224)
    ap.add_argument("--model", default="resnet18")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="outputs")
    ap.add_argument("--card-repeat", type=int, default=3,
                    help="repeat web_card_* files in TRAIN split (card style boost)")
    ap.add_argument("--label-smoothing", type=float, default=0.1)
    ap.add_argument("--patience", type=int, default=0,
                    help="early-stop if val macro-F1 doesn't improve for N epochs (0=off)")
    ap.add_argument("--resume", default="",
                    help="resume from checkpoint (e.g. outputs/best.pt)")
    args = ap.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)

    data_dir = Path(args.data)
    files, labels, classes = collect(data_dir)
    print(f"classes={classes} total={len(files)}")
    for c in classes:
        n = labels.count(classes.index(c))
        print(f"  {c}: {n}")

    # 70/15/15 stratified: test locked, selection on val only
    tr_f, tmp_f, tr_y, tmp_y = train_test_split(
        files, labels, test_size=0.3, stratify=labels, random_state=args.seed
    )
    va_f, te_f, va_y, te_y = train_test_split(
        tmp_f, tmp_y, test_size=0.5, stratify=tmp_y, random_state=args.seed
    )
    print(f"split train={len(tr_f)} val={len(va_f)} test={len(te_f)}")
    if args.card_repeat > 1:  # boost rare card style, train only
        extra_f, extra_y = [], []
        for f, y in zip(tr_f, tr_y):
            if "web_card" in Path(f).name:
                extra_f += [f] * (args.card_repeat - 1)
                extra_y += [y] * (args.card_repeat - 1)
        tr_f += extra_f
        tr_y += extra_y
        print(f"card boost x{args.card_repeat}: train={len(tr_f)}")
    train_tf, val_tf = build_transforms(args.img_size)
    train_ds = ImageListDataset(tr_f, tr_y, train_tf)
    val_ds = ImageListDataset(va_f, va_y, val_tf)
    test_ds = ImageListDataset(te_f, te_y, val_tf)

    # balance Abra(155) vs Aerodactyl(245)
    counts = torch.bincount(torch.tensor(tr_y)).float()
    w = 1.0 / counts
    sampler = WeightedRandomSampler([w[y] for y in tr_y], len(tr_y))

    import os
    nw = 0 if os.name == "nt" else 2
    train_ld = DataLoader(train_ds, batch_size=args.batch, sampler=sampler, num_workers=nw)
    val_ld = DataLoader(val_ds, batch_size=args.batch, num_workers=nw)
    test_ld = DataLoader(test_ds, batch_size=args.batch, num_workers=nw)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("device:", device)
    model = timm.create_model(args.model, pretrained=True, num_classes=len(classes))
    model.to(device)

    criterion = nn.CrossEntropyLoss(label_smoothing=args.label_smoothing)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, args.epochs)
    scaler = torch.amp.GradScaler("cuda", enabled=(device == "cuda"))

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "classes.txt").write_text("\n".join(classes))
    (out / "split.json").write_text(json.dumps(
        {"train": tr_f, "val": va_f, "test": te_f, "seed": args.seed}, indent=1))
    hist_path = out / "history.csv"
    best_f1, best_path = 0.0, out / "best.pt"
    start_ep, bad = 1, 0

    if args.resume:
        ckpt = torch.load(args.resume, map_location=device, weights_only=True)
        if ckpt.get("classes") != classes:
            raise SystemExit(f"resume classes mismatch: {ckpt.get('classes')} vs {classes}")
        if "opt" not in ckpt:
            raise SystemExit("resume needs a checkpoint with optimizer state (re-train without --resume)")
        model.load_state_dict(ckpt["state"])
        opt.load_state_dict(ckpt["opt"])
        sched.load_state_dict(ckpt["sched"])
        best_f1 = ckpt.get("best_f1", 0.0)
        start_ep = ckpt.get("epoch", 0) + 1
        print(f"resumed {args.resume}: epoch->{start_ep} best_f1={best_f1:.4f}")
    elif not hist_path.exists():
        hist_path.write_text("epoch,loss,val_acc,val_bal_acc,val_f1\n")

    for ep in range(start_ep, args.epochs + 1):
        model.train()
        tot_loss, tot_n = 0.0, 0
        for x, y in train_ld:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            with torch.amp.autocast("cuda", enabled=(device == "cuda")):
                loss = criterion(model(x), y)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            tot_loss += loss.item() * len(x)
            tot_n += len(x)
        sched.step()

        model.eval()
        m = evaluate(model, val_ld, device, classes)
        print(f"epoch {ep}/{args.epochs} loss={tot_loss/tot_n:.4f}\n{fmt_report(m, classes)}")
        with open(hist_path, "a") as hf:
            hf.write(f"{ep},{tot_loss/tot_n:.4f},{m['acc']:.4f},{m['bal_acc']:.4f},{m['f1_macro']:.4f}\n")
        if m["f1_macro"] > best_f1:
            best_f1 = m["f1_macro"]
            bad = 0
            torch.save({"model": args.model, "classes": classes,
                        "img_size": args.img_size, "epoch": ep,
                        "best_f1": best_f1,
                        "opt": opt.state_dict(), "sched": sched.state_dict(),
                        "state": model.state_dict()}, best_path)
            print(f"  saved {best_path} f1={m['f1_macro']:.4f}")
        else:
            bad += 1
            if args.patience > 0 and bad >= args.patience:
                print(f"early stop: no val gain for {bad} epochs (best f1={best_f1:.4f})")
                break
    print(f"BEST val f1_macro={best_f1:.4f} -> {best_path}")

    # final: locked test set, run once
    ckpt = torch.load(best_path, map_location=device, weights_only=True)
    model.load_state_dict(ckpt["state"])
    model.eval()
    tm = evaluate(model, test_ld, device, classes)
    report = "TEST (locked, run once):\n" + fmt_report(tm, classes)
    print(report)
    (out / "test_report.txt").write_text(report)


if __name__ == "__main__":
    main()
