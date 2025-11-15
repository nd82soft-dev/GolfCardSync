from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI(title="GolfCardSync Analysis Service")

class RoundPFG(BaseModel):
    fairways: List[str]
    greens: List[str]
    scores: List[int]
    putts: List[int]

def summarize_direction(symbols: List[str]) -> str:
    left = symbols.count("←")
    right = symbols.count("→")
    long = symbols.count("↑")
    short = symbols.count("↓")

    tendencies = []
    if left > right and left > 0:
        tendencies.append("left")
    if right > left and right > 0:
        tendencies.append("right")
    if long > short and long > 0:
        tendencies.append("long")
    if short > long and short > 0:
        tendencies.append("short")

    if not tendencies:
        return "no clear directional bias"
    return ", ".join(tendencies)

@app.post("/patterns")
def patterns(data: RoundPFG):
    fw_dir = summarize_direction(data.fairways)
    gr_dir = summarize_direction(data.greens)

    fw_hits = sum(1 for f in data.fairways if f == "✓")
    gr_hits = sum(1 for g in data.greens if g == "✓")

    avg_score = sum(data.scores) / max(1, len(data.scores))
    avg_putts = sum(data.putts) / max(1, len(data.putts))

    commentary = []

    commentary.append(f"Average score: {avg_score:.1f}, average putts: {avg_putts:.1f} per hole.")
    commentary.append(f"Fairways hit: {fw_hits}/14 (approx), greens hit: {gr_hits}/18 (approx).")

    if "left" in fw_dir:
        commentary.append("Off the tee you tend to miss left. Consider alignment or clubface adjustments.")
    if "right" in fw_dir:
        commentary.append("Off the tee you tend to miss right. Check setup and path.")
    if "short" in gr_dir:
        commentary.append("Approach shots often finish short. Maybe club up more frequently.")
    if "long" in gr_dir:
        commentary.append("Approach shots often finish long. Check distances or wind adjustments.")
    if fw_dir == "no clear directional bias" and gr_dir == "no clear directional bias":
        commentary.append("Directional misses look reasonably balanced.")

    return {
        "fairway_direction_tendency": fw_dir,
        "green_direction_tendency": gr_dir,
        "commentary": commentary
    }

