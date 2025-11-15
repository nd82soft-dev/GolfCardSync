import { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [round, setRound] = useState(null);
  const [error, setError] = useState("");

  const API = import.meta.env.VITE_API_BASE_URL;

  const uploadScorecard = async () => {
    if (!file) return;

    const form = new FormData();
    form.append("image", file);

    setLoading(true);
    setError("");

    try {
      const res = await axios.post(`${API}/api/round/from-image`, form);
      setRound(res.data);
    } catch (err) {
      console.error(err);
      setError("Error processing scorecard");
    } finally {
      setLoading(false);
    }
  };

  const renderTable = (holes, title) => (
    <div className="card">
      <h2 className="card-title">{title}</h2>

      <div className="table-wrapper">
        <table className="scorecard">
          <thead>
            <tr>
              <th>Hole</th>
              {holes.map((h, i) => (
                <th key={i}>{i + 1}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className="row-label">Score</td>
              {holes.map((h, i) => (
                <td key={i}>{h.score ?? "-"}</td>
              ))}
              <td>
                {holes.reduce((sum, h) => sum + (h.score || 0), 0)}
              </td>
            </tr>

            <tr>
              <td className="row-label">Putts</td>
              {holes.map((h, i) => (
                <td key={i}>{h.p ?? "-"}</td>
              ))}
              <td>
                {holes.reduce((sum, h) => sum + (h.p || 0), 0)}
              </td>
            </tr>

            <tr>
              <td className="row-label">Fairway</td>
              {holes.map((h, i) => (
                <td key={i}>{h.f || "-"}</td>
              ))}
              <td>-</td>
            </tr>

            <tr>
              <td className="row-label">Green</td>
              {holes.map((h, i) => (
                <td key={i}>{h.g || "-"}</td>
              ))}
              <td>-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <h1 className="title">GolfCardSync</h1>

      <div className="upload-card">
        <input
          type="file"
          className="file-input"
          onChange={(e) => setFile(e.target.files[0])}
        />

        <button
          onClick={uploadScorecard}
          className="upload-btn"
          disabled={loading}
        >
          {loading ? "Processing..." : "Upload Scorecard"}
        </button>

        {error && <p className="error">{error}</p>}
      </div>

      {round && (
        <div className="results">
          {renderTable(round.front9, "Front 9")}
          {renderTable(round.back9, "Back 9")}

          <div className="card total-card">
            <h2 className="card-title">Round Summary</h2>
            <p><strong>Front 9:</strong> {round.summary.front9}</p>
            <p><strong>Back 9:</strong> {round.summary.back9}</p>

            <p className="total-score">
              Total Score: <span>{round.summary.total}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
