from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_dummy(image: UploadFile = File(...)):
    """
    Temporary dummy OCR endpoint.
    Always returns a valid 18-hole JSON structure so
    the backend and frontend never crash.
    """
    # Just consume the file so FastAPI is happy
    await image.read()

    scores = [4, 6, 4, 4, 4, 3, 4, 3, 5, 3, 5, 4, 4, 3, 4, 3, 4, 4]
    putts = [2, 2, 2, 1, 1, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 2]
    fairways = ["" for _ in range(18)]
    greens = ["" for _ in range(18)]
    pars = [4, 5, 4, 4, 4, 3, 5, 3, 4, 4, 5, 4, 4, 3, 4, 4, 4, 4]

    per_hole = []
    for i in range(18):
        per_hole.append(
            {
                "hole": i + 1,
                "score": scores[i],
                "par": pars[i],
                "putts": putts[i],
                "fairway_mark": fairways[i],
                "green_mark": greens[i],
                "miss_direction": "unknown",
            }
        )

    front9_total = sum(scores[:9])
    back9_total = sum(scores[9:])
    total = front9_total + back9_total

    front9_putts = sum(putts[:9])
    back9_putts = sum(putts[9:])
    total_putts = front9_putts + back9_putts

    return {
        "scores": scores,
        "putts": putts,
        "fairways": fairways,
        "greens": greens,
        "pars": pars,
        "per_hole": per_hole,
        "front9_total": front9_total,
        "back9_total": back9_total,
        "total": total,
        "front9_putts": front9_putts,
        "back9_putts": back9_putts,
        "total_putts": total_putts,
        "totals_match_card": True,
        "validation_notes": ["Dummy OCR response (no real image parsing yet)."],
        "raw_text": "",
    }
