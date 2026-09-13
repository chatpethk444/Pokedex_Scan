"""List files the checkpoint gets wrong. Run: python src/find_errors.py"""
import glob
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import timm
import torch
from PIL import Image
from torchvision import transforms

ckpt = torch.load("outputs/best.pt", map_location="cpu", weights_only=True)
classes = ckpt["classes"]
c2i = {c: i for i, c in enumerate(classes)}
size = ckpt.get("img_size", 224)
tf = transforms.Compose([
    transforms.Resize(int(size * 1.14)),
    transforms.CenterCrop(size),
    transforms.ToTensor(),
    transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
])
model = timm.create_model(ckpt["model"], pretrained=False, num_classes=len(classes))
model.load_state_dict(ckpt["state"])
model.eval()

wrong = []
with torch.no_grad():
    for f in sorted(glob.glob("pokemon_dataset/*/*")):
        p = Path(f)
        if not p.is_file() or p.parent.name.startswith("_"):
            continue
        with Image.open(f) as im:
            if im.mode == "P":
                im = im.convert("RGBA")
            x = tf(im.convert("RGB")).unsqueeze(0)
        prob = model(x).softmax(1)[0]
        pred = int(prob.argmax())
        true = c2i[p.parent.name]
        if pred != true:
            wrong.append((f, classes[true], classes[pred], float(prob[pred])))
for f, t, pr, c in wrong:
    print(f"{c:.3f} true={t} pred={pr} {f}")
print(f"total wrong: {len(wrong)}")
