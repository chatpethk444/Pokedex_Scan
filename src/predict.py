"""Predict single image with trained checkpoint (optional TTA).
Run: python src/predict.py --ckpt outputs/best.pt --img path/to/card.jpg
     python src/predict.py --ckpt outputs/best.pt --img card.jpg --tta
"""
import argparse

import torch
import timm
from PIL import Image
from torchvision import transforms
from torchvision.transforms import functional as F

MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)


def base_tf(img_size):
    return transforms.Compose([
        transforms.Resize(int(img_size * 1.14)),
        transforms.CenterCrop(img_size),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])


def tta_batch(img, img_size):
    """original + hflip only (corner crops add border noise on full cards)."""
    tf = base_tf(img_size)
    return torch.stack([tf(img), tf(F.hflip(img))])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="outputs/best.pt")
    ap.add_argument("--img", required=True)
    ap.add_argument("--tta", action="store_true", help="test-time augmentation")
    args = ap.parse_args()

    ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    classes = ckpt["classes"]
    img_size = ckpt.get("img_size", 224)
    model = timm.create_model(ckpt["model"], pretrained=False, num_classes=len(classes))
    model.load_state_dict(ckpt["state"])
    model.eval()

    with Image.open(args.img) as im:
        if im.mode == "P":
            im = im.convert("RGBA")
        img = im.convert("RGB")
    with torch.no_grad():
        if args.tta:
            logits = model(tta_batch(img, img_size)).mean(0)
        else:
            logits = model(base_tf(img_size)(img).unsqueeze(0))[0]
        prob = logits.softmax(0)
    for i, c in enumerate(classes):
        print(f"{c}: {prob[i]:.4f}")
    print("pred:", classes[int(prob.argmax())])


if __name__ == "__main__":
    main()
