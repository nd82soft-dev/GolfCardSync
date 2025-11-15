from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import numpy as np

app = FastAPI(title="GolfCardSync Strokes Service")

class RoundData(BaseModel):
    scores: List[int]
    putts: List[int]
    par: List[int] = [4,4,4,4,4,3,5,3,5,4,5,4,3,4,5,3,4,4]  # basic par layout

@app.post("/strokes")
def compute_strokes(data: RoundData):
    scores = np.array(data.scores[:18])
    par = np.array(data.par[:18])
    diff = scores - par

    sg_putting = float(max(0, 2.0 - 0.1 * np.sum(data.putts)))  # fake placeholder
    sg_off_tee = float(-0.05 * diff[:4].sum())
    sg_approach = float(-0.03 * diff[4:10].sum())
    sg_around_green = float(-0.02 * diff[10:].sum())

    total_sg = sg_putting + sg_off_tee + sg_approach + sg_around_green

    per_hole = []
    for i in range(18):
        per_hole.append({
            "hole": i+1,
            "score": int(scores[i]),
            "par": int(par[i]),
            "to_par": int(scores[i] - par[i])
        })

    return {
        "sg_off_tee": sg_off_tee,
        "sg_approach": sg_approach,
        "sg_around_green": sg_around_green,
        "sg_putting": sg_putting,
        "sg_total": total_sg,
        "per_hole": per_hole
    }

