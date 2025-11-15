from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import pytesseract
from PIL import Image
import io
import numpy as np
import cv2

app = FastAPI(title="GolfCardSync OCR Service")

def preprocess_image(img_bytes: bytes) -> np.ndarray:
    # Simple grayscale + threshold; you can extend with deskew + grid detect
    image = Image.open(io.BytesIO(img_bytes)).convert("L")
    np_img = np.array(image)
    _, thresh = cv2.threshold(np_img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def extract_round_data(text: str):
    # Very naive extraction:
    # - Scores: numbers between 3–9
    # - Putts: numbers between 1–3
    # - Fairways/Greens: symbols ✓ X arrows etc from text

    import re
    tokens = re.findall(r"[0-9]+", text)
    scores_all = [int(t) for t in tokens if 3 <= int(t) <= 9]
    putts_all = [int(t) for t in tokens if 1 <= int(t) <= 3]

    scores = scores_all[:18]
    putts = putts_all[:18]

    symbols = []
    for ch in text:
        if ch in ["✓", "✔", "x", "X", "→", "←", "↑", "↓", "<", ">", "^", "v"]:
            symbols.append(ch)

    def norm_symbol(c: str) -> str:
        if c in ["✓", "✔"]:
            return "✓"
        if c in ["x", "X"]:
            return "X"
        if c in [">", "→"]:
            return "→"
        if c in ["<", "←"]:
            return "←"
        if c in ["^", "↑"]:
            return "↑"
        if c in ["v", "V", "↓"]:
            return "↓"
        return c

    symbols = [norm_symbol(s) for s in symbols]

    # First 18 as fairways, next 18 as greens (rough heuristic)
    fairways = symbols[:18]
    greens   = symbols[18:36]

    # Pad if shorter
    def pad(arr, n, fill=""):
        return arr + [fill] * (n - len(arr))

    scores = pad(scores, 18, 0)
    putts = pad(putts, 18, 0)
    fairways = pad(fairways, 18, "")
    greens = pad(greens, 18, "")

    return {
        "scores": scores,
        "putts": putts,
        "fairways": fairways,
        "greens": greens,
        "raw_text": text
    }

@app.post("/ocr")
async def ocr_scorecard(image: UploadFile = File(...)):
    try:
        img_bytes = await image.read()
        pre = preprocess_image(img_bytes)
        pil_img = Image.fromarray(pre)
        text = pytesseract.image_to_string(pil_img)

        data = extract_round_data(text)
        return JSONResponse(data)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

