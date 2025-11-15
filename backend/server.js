import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import axios from "axios";
import FormData from "form-data";

const app = express();

app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Python services
const OCR_URL = "http://127.0.0.1:8001/ocr";
const STROKES_URL = "http://127.0.0.1:8002/strokes";
const ANALYSIS_URL = "http://127.0.0.1:8003/patterns";

// Simple health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Main endpoint: image -> OCR -> strokes -> analysis
app.post("/api/round/from-image", async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const image = req.files.image;

    // Build multipart form for OCR service
    const form = new FormData();
    form.append("image", image.data, {
      filename: image.name,
      contentType: image.mimetype
    });

    // 1) OCR
    const ocrResp = await axios.post(OCR_URL, form, {
      headers: form.getHeaders()
    });

    const ocrData = ocrResp.data;
    const { scores, putts, fairways, greens } = ocrData;

    // 2) Strokes gained (rough model)
    const strokesResp = await axios.post(STROKES_URL, {
      scores,
      putts
    });

    const strokesData = strokesResp.data;

    // 3) Miss pattern / AI commentary
    const analysisResp = await axios.post(ANALYSIS_URL, {
      fairways,
      greens,
      scores,
      putts
    });

    const analysisData = analysisResp.data;

    return res.json({
      ocr: ocrData,
      strokes: strokesData,
      analysis: analysisData
    });
  } catch (err) {
    console.error("Error in /api/round/from-image:", err?.response?.data || err.message || err);
    return res.status(500).json({
      error: "Processing failed",
      detail: err?.response?.data || String(err)
    });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`GolfCardSync backend running on http://localhost:${PORT}`);
});
