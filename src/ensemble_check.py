"""Logit-ensemble probe: best.pt + best_nonneon.pt. Run: python src/ensemble_check.py"""
import glob
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import timm
import torch
from PIL import Image
from torchvision import transforms

SIZE = 224
tf = transforms.Compose([
    transforms.Resize(int(SIZE * 1.14)),
    transforms.CenterCrop(SIZE),
    transforms.ToTensor(),
    transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
])
classes = ["Abra", "Aerodactyl"]
c2i = {c: i for i, c in enumerate(classes)}

models = []
for ckpt_path in ["outputs/best.pt", "outputs/best_nonneon.pt"]:
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=True)
    m = timm.create_model(ckpt["model"], pretrained=False, num_classes=2)
    m.load_state_dict(ckpt["state"])
    m.eval()
    models.append(m)

wrong, n = [], 0
with torch.no_grad():
    for f in sorted(glob.glob("pokemon_dataset/*/*")):
        p = Path(f)
        if not p.is_file() or p.parent.name.startswith("_"):
            continue
        with Image.open(f) as im:
            if im.mode == "P":
                im = im.convert("RGBA")
            x = tf(im.convert("RGB")).unsqueeze(0)
        prob = sum(m(x).softmax(1)[0] for m in models) / len(models)
        pred = int(prob.argmax())
        n += 1
        if pred != c2i[p.parent.name]:
            wrong.append((f, p.parent.name, classes[pred], float(prob[pred])))
for f, t, pr, c in wrong:
    print(f"{c:.3f} true={t} pred={pr} {f}")
print(f"ensemble wrong: {len(wrong)}/{n}")

# externals
for f in ["SV4PT5_EN_148.png", "images (4).jpg", "abra.jpg", "Aerodactyl.png",
          "pokemon_dataset/Abra/147ec91b4a55b38366f24489d4a07bc9.jpg"]:
    with Image.open(f) as im:
        x = tf(im.convert("RGB")).unsqueeze(0)
    with torch.no_grad():
        prob = sum(m(x).softmax(1)[0] for m in models) / len(models)
    print(f"{classes[int(prob.argmax())]} {float(prob.max()):.4f} {f}")
