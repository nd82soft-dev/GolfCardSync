import { useState } from "react";
import axios from "axios";
import "./App.css";

// CHANGE THIS TO YOUR BACKEND IP
const API = import.meta.env.VITE_API_BASE_URL || "http://167.99.26.124:5000";

function Dashboard({ data }) {
  const labels = Array.from({ length: 18 }, (_, i) => `H${i + 1}`);
  const scores = data.ocr.scores;
  const putts = data.ocr.putts;
  const fw = data.ocr.fairways;
  const gr = data.ocr.greens;

  const totalPutts = putts.reduce((a, b) => a + b, 0);
  const fwHit = fw.filter((f) => f === "✓").length;
  const grHit = gr.filter((g) => g === "✓").length;

  return (
    <div style={{ marginTop: 20 }}>
      <h2>Round Summary</h2>
      <p><b>Total Putts:</b> {totalPutts}</p>
      <p><b>Fairways Hit:</b> {fwHit} / 14</p>
      <p><b>Greens Hit:</b> {grHit} / 18</p>

      <h3 style={{ marginTop: 20 }}>Scores</h3>
      <pre>{JSON.stringify(scores, null, 2)}</pre>

      <h3>Putt Breakdown</h3>
      <pre>{JSON.stringify(putts, null, 2)}</pre>

      <h3>Fairways</h3>
      <pre>{JSON.stringify(fw, null, 2)}</pre>

      <h3>Greens</h3>
      <pre>{JSON.stringify(gr, null, 2)}</pre>

      <h3 style={{ marginTop: 20 }}>Strokes Gained (simple model)</h3>
      <pre>{JSON.stringify(data.strokes, null, 2)}</pre>

      <h3 style={{ marginTop: 20 }}>AI Commentary</h3>
      <ul>
        {data.analysis.commentary.map((c, i) => (
          <li key={i}>• {c}</li>
        ))}
      </ul>
    </div>
  );
}

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return alert("Please select a scorecard image.");

    const formData = new FormData();
    formData.append("image", file);

    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/round/from-image`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setResult(res.data);
    } catch (err) {
      console.error(err);
      alert("Error processing scorecard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1>GolfCardSync</h1>
      <p>Upload a scorecard image to analyze your golf performance.</p>

      <form onSubmit={handleUpload} style={{ marginTop: 20 }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <button
          type="submit"
          disabled={loading || !file}
          style={{ marginLeft: 10 }}
        >
          {loading ? "Processing..." : "Upload"}
        </button>
      </form>

      {result && <Dashboard data={result} />}
    </div>
  );
}

export default App;

