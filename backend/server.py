"""Pokedex backend: ONNX inference + OCR + Pokemon info.
Run: uvicorn server:app --host 0.0.0.0 --port 8000   (from backend/)
Docs: http://localhost:8000/docs
"""
import re
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import numpy as np
import onnxruntime as ort
import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

ROOT = Path(__file__).parent
MODEL_PATH = ROOT / ".." / "outputs" / "best.onnx"
CLASSES_PATH = ROOT / ".." / "outputs" / "classes.txt"
IMG_SIZE = 224
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# offline fallback (demo works without network)
FALLBACK = {
    "abra": {"id": 63, "name": "abra",
             "types": ["psychic"], "height_m": 0.9, "weight_kg": 19.5,
             "artwork": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/63.png",
             "gallery": [
                 "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/63.png",
                 "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/63.png",
                 "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/63.gif"],
             "cry": "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/63.ogg",
             "flavor": "Using its ability to read minds, it will identify impending danger and teleport to safety.",
             "stats": [{"name": "hp", "value": 25}, {"name": "attack", "value": 20},
                       {"name": "defense", "value": 15}, {"name": "special-attack", "value": 105},
                       {"name": "special-defense", "value": 55}, {"name": "speed", "value": 90}],
             "abilities": [{"name": "synchronize", "effect": "Passes poison, paralyze, or burn to the foe."},
                           {"name": "inner-focus", "effect": "Prevents flinching."}],
             "evolution": [{"name": "abra", "id": 63, "min_level": None, "trigger": None},
                           {"name": "kadabra", "id": 64, "min_level": 16, "trigger": "level-up"},
                           {"name": "alakazam", "id": 65, "min_level": None, "trigger": "trade"}]},
    "aerodactyl": {"id": 142, "name": "aerodactyl",
                   "types": ["rock", "flying"], "height_m": 1.8, "weight_kg": 59.0,
                   "artwork": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/142.png",
                   "gallery": [
                       "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/142.png",
                       "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/142.png",
                       "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/142.gif"],
                   "cry": "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/142.ogg",
                   "flavor": "A ferocious, prehistoric Pokemon that goes for the enemy's throat with its serrated saw-like fangs.",
                   "stats": [{"name": "hp", "value": 80}, {"name": "attack", "value": 105},
                             {"name": "defense", "value": 65}, {"name": "special-attack", "value": 60},
                             {"name": "special-defense", "value": 75}, {"name": "speed", "value": 130}],
                   "abilities": [{"name": "rock-head", "effect": "Protects against recoil damage."},
                                 {"name": "pressure", "effect": "Raises foe's PP usage."}],
                   "evolution": [{"name": "aerodactyl", "id": 142, "min_level": None, "trigger": None}]},
}

app = FastAPI(title="PokT Pokedex API")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

CLASSES = [c.strip() for c in CLASSES_PATH.read_text().splitlines() if c.strip()]
_session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
_IN, _OUT = _session.get_inputs()[0].name, _session.get_outputs()[0].name


def preprocess(data: bytes) -> np.ndarray:
    with Image.open(BytesIO(data)) as im:
        if im.mode == "P":
            im = im.convert("RGBA")
        img = im.convert("RGB")
    s = int(IMG_SIZE * 1.14)
    scale = s / min(img.size)
    img = img.resize((round(img.width * scale), round(img.height * scale)))
    x0 = (img.width - IMG_SIZE) // 2
    y0 = (img.height - IMG_SIZE) // 2
    img = img.crop((x0, y0, x0 + IMG_SIZE, y0 + IMG_SIZE))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return arr.transpose(2, 0, 1)[None]


@app.get("/health")
def health():
    return {"status": "ok", "classes": CLASSES, "model": MODEL_PATH.name}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "image too large (max 10MB)")
    try:
        x = preprocess(data)
    except Exception:
        raise HTTPException(400, "unreadable image")
    logits = _session.run([_OUT], {_IN: x})[0][0]
    exp = np.exp(logits - logits.max())
    probs = exp / exp.sum()
    top = int(probs.argmax())
    return {"prediction": CLASSES[top], "confidence": float(probs[top]),
            "probs": {c: float(probs[i]) for i, c in enumerate(CLASSES)}}


@lru_cache(maxsize=128)
def _ability_effect(url: str) -> dict:
    try:
        a = requests.get(url, timeout=8).json()
        eff = next((e["short_effect"] for e in a.get("effect_entries", [])
                    if e["language"]["name"] == "en"), "")
        return {"name": a["name"], "effect": eff}
    except Exception:
        return {"name": url.rstrip("/").split("/")[-1], "effect": ""}


@lru_cache(maxsize=64)
def _evo_chain(url: str) -> list:
    """Full branching chain, Kanto only (this dex is GEN 1).

    Old code followed kids[0] only, so Eevee showed Vaporeon alone
    and dropped Jolteon + Flareon. BFS keeps root first, then
    evolutions in API order; id>151 (post-gen1) filtered out.
    """
    try:
        chain = requests.get(url, timeout=8).json()["chain"]
        out = []
        queue: list = [chain]
        while queue:
            node = queue.pop(0)
            sp = node["species"]
            det = (node.get("evolution_details") or [None])[0] or {}
            pid = int(sp["url"].rstrip("/").split("/")[-1])
            if pid <= 151:
                out.append({"name": sp["name"],
                            "id": pid,
                            "min_level": det.get("min_level"),
                            "trigger": (det.get("trigger") or {}).get("name")})
            queue.extend(node.get("evolves_to") or [])
        return out
    except Exception:
        return []


@lru_cache(maxsize=64)
def _pokeapi(name: str) -> dict | None:
    try:
        p = requests.get(f"https://pokeapi.co/api/v2/pokemon/{name.lower()}",
                         timeout=8).json()
        s = requests.get(p["species"]["url"], timeout=8).json()
        flavor = next((f["flavor_text"].replace("\n", " ").replace("\f", " ")
                       for f in s["flavor_text_entries"] if f["language"]["name"] == "en"),
                      "")
        other = p["sprites"].get("other", {}) or {}
        spr = p["sprites"] or {}
        art = other.get("official-artwork") or {}
        home = other.get("home") or {}
        show = other.get("showdown") or {}
        # raster only: dream_world is SVG, RN Image can't render it
        candidates = [
            art.get("front_default"),
            art.get("front_shiny"),
            home.get("front_default"),
            home.get("front_shiny"),
            show.get("front_default"),
            show.get("back_default"),
            show.get("front_shiny"),
            spr.get("front_default"),
            spr.get("back_default"),
            spr.get("front_shiny"),
            spr.get("back_shiny"),
        ]
        gallery: list = []
        for u in candidates:
            if u and u not in gallery:
                gallery.append(u)
        cries = p.get("cries") or {}
        return {"id": p["id"], "name": p["name"],
                "types": [t["type"]["name"] for t in p["types"]],
                "height_m": p["height"] / 10, "weight_kg": p["weight"] / 10,
                "artwork": p["sprites"]["other"]["official-artwork"]["front_default"],
                "gallery": gallery,
                "cry": cries.get("latest") or cries.get("legacy") or "",
                "flavor": flavor,
                "stats": [{"name": st["stat"]["name"], "value": st["base_stat"]}
                          for st in p["stats"]],
                "abilities": [_ability_effect(a["ability"]["url"])
                              for a in p["abilities"]],
                "evolution": _evo_chain(s["evolution_chain"]["url"])}
    except Exception:
        return None


@app.get("/pokemon/{name}")
def pokemon(name: str):
    info = _pokeapi(name) or FALLBACK.get(name.lower())
    if not info:
        raise HTTPException(404, f"unknown pokemon: {name}")
    return info


_ocr = None


def ocr_engine():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr = RapidOCR()
    return _ocr


def parse_card(lines: list) -> dict:
    """Heuristics for Pokemon TCG layout: name top-left, 'NNN HP' top-right."""
    texts = [ln["text"] for ln in lines]
    fields: dict = {"name": None, "hp": None, "card_number": None,
                    "matched_class": None}
    for i, t in enumerate(texts):
        if re.fullmatch(r"\d{1,3}/\d{1,3}", t):
            fields["card_number"] = t
        if t.upper() == "HP" and i > 0 and texts[i - 1].isdigit():
            fields["hp"] = int(texts[i - 1])
    alpha = [ln for ln in lines
             if re.fullmatch(r"[A-Za-z'’.\- ]{3,}", ln["text"]) and ln["conf"] > 0.6]
    if alpha:
        top = sorted(alpha, key=lambda ln: ln["box"][1])[:3]
        fields["name"] = max(top, key=lambda ln: ln["conf"])["text"].strip()
    if fields["name"]:
        for cls in CLASSES:
            if cls.lower() in fields["name"].lower() or \
                    fields["name"].lower() in cls.lower():
                fields["matched_class"] = cls
                break
    return fields


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "image too large (max 10MB)")
    try:
        with Image.open(BytesIO(data)) as im:
            img = np.array(im.convert("RGB"))
    except Exception:
        raise HTTPException(400, "unreadable image")
    result, _ = ocr_engine()(img)
    lines = []
    for box, text, conf in result or []:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        lines.append({"text": text, "conf": round(float(conf), 3),
                      "box": [int(min(xs)), int(min(ys)),
                              int(max(xs)), int(max(ys))]})
    lines.sort(key=lambda ln: (ln["box"][1], ln["box"][0]))
    return {"lines": lines, "fields": parse_card(lines)}


@app.post("/scan")
async def scan(file: UploadFile = File(...)):
    """Classifier + OCR combined: image class, card text, agreed name."""
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "image too large (max 10MB)")
    try:
        x = preprocess(data)
        with Image.open(BytesIO(data)) as im:
            img = np.array(im.convert("RGB"))
    except Exception:
        raise HTTPException(400, "unreadable image")
    logits = _session.run([_OUT], {_IN: x})[0][0]
    exp = np.exp(logits - logits.max())
    probs = exp / exp.sum()
    top = int(probs.argmax())
    result, _ = ocr_engine()(img)
    lines = [{"text": t, "conf": round(float(c), 3),
              "box": [int(min(p[0] for p in b)), int(min(p[1] for p in b)),
                      int(max(p[0] for p in b)), int(max(p[1] for p in b))]}
             for b, t, c in result or []]
    lines.sort(key=lambda ln: (ln["box"][1], ln["box"][0]))
    fields = parse_card(lines)
    name = fields["matched_class"] or CLASSES[top]
    agree = None if fields["matched_class"] is None else \
        fields["matched_class"] == CLASSES[top]
    return {"prediction": CLASSES[top], "confidence": float(probs[top]),
            "probs": {c: float(probs[i]) for i, c in enumerate(CLASSES)},
            "ocr": {"lines": lines, "fields": fields},
            "name": name, "agree": agree}
