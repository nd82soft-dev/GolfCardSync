import express from "express";
import multer from "multer";
import axios from "axios";

const app = express();
const upload = multer();

const OCR_URL = process.env.OCR_URL || "http://localhost:8001";
const STROKES_URL = process.env.STROKES_URL || "http://localhost:8002";
const ANALYSIS_URL = process.env.ANALYSIS_URL || "http://localhost:8003";

app.post("/api/round/from-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    // 1) Call OCR service
    const formData = new FormData();
    formData.append("image", new Blob([req.file.buffer]), req.file.originalname);

    const ocrResp = await axios.post(`${OCR_URL}/ocr`, formData, {
      headers: formData.getHeaders ? formData.getHeaders() : {},
      timeout: 30000,
    });

    const ocr = ocrResp.data;

    // 2) Call strokes-gained service
    const strokesResp = await axios.post(`${STROKES_URL}/strokes`, {
      scores: ocr.scores,
      putts: ocr.putts,
      pars: ocr.pars,
      // add other fields if your strokes service expects them
    });

    const strokes = strokesResp.data;

    // 3) Call analysis service
    const analysisResp = await axios.post(`${ANALYSIS_URL}/analyze`, {
      scores: ocr.scores,
      putts: ocr.putts,
      fairways: ocr.fairways,
      greens: ocr.greens,
      strokes,
    });

    const analysis = analysisResp.data;

    // 4) Combined round object
    const round = {
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
      ocr,
      strokes,
      analysis,
    };

    res.json(round);
  } catch (err) {
    console.error("Error in /api/round/from-image:", err.response?.data || err);
    res.status(500).json({
      error: "Failed to process scorecard",
      details: err.response?.data || err.message,
    });
  }
});
