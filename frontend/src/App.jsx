import { useState, useMemo } from "react";
import axios from "axios";
import "./App.css";

function ProgressRing({ label, value, max }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const offset = circumference * (1 - pct);

  return (
    <div className="ring">
      <svg width="100" height="100">
        <circle
          className="ring-bg"
          cx="50"
          cy="50"
          r={radius}
        />
        <circle
          className="ring-fg"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <div className="ring-value">{value}</div>
        <div className="ring-max">/ {max}</div>
      </div>
      <div className="ring-label">{label}</div>
    </div>
  );
}

function HoleChart({ holes }) {
  const scores = holes.map((h) => h.score || 0);
  if (!scores.length) return null;

  const maxScore = Math.max(...scores, 5);
  const minScore = Math.min(...scores, 2);

  const points = scores
    .map((s, i) => {
      const x = (i / Math.max(scores.length - 1, 1)) * 100;
      const normY = (s - minScore) / Math.max(maxScore - minScore || 1, 1);
      const y = 100 - normY * 80 - 10; // padding
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chart-card">
      <h3>Hole-by-Hole Score</h3>
      <svg viewBox="0 0 100 100" className="hole-chart">
        <polyline
          className="hole-line"
          points={points}
        />
        {scores.map((s, i) => {
          const x = (i / Math.max(scores.length - 1, 1)) * 100;
          const normY = (s - minScore) / Math.max(maxScore - minScore || 1, 1);
          const y = 100 - normY * 80 - 10;
          return <circle key={i} cx={x} cy={y} r="1.8" className="hole-dot" />;
        })}
      </svg>
      <div className="chart-xaxis">
        {scores.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [round, setRound] = useState(null);
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);

  const API = import.meta.env.VITE_API_BASE_URL;

  const uploadScorecard = async () => {
    if (!file) return;

    const form = new FormData();
    form.append("image", file);

    setLoading(true);
    setError("");
    setRound(null);

    try {
      const res = await axios.post(`${API}/api/round/from-image`, form);
      console.log("API response:", res.data);
      setRaw(res.data);

      // handle different shapes: { front9, back9, summary } OR { round: {...} }
      const payload = res.data.round || res.data || {};
      setRound(payload);
    } catch (err) {
      console.error(err);
      setError("Error processing scorecard");
    } finally {
      setLoading(false);
    }
  };

  // Safely derive front/back/summary
  const { front, back, summary, stats } = useMemo(() => {
    if (!round) return { front: [], back: [], summary: null, stats: {} };

    let front9 =
      round.front9 ||
      round.front ||
      (Array.isArray(round.holes) ? round.holes.slice(0, 9) : []);
    let back9 =
      round.back9 ||
      round.back ||
      (Array.isArray(round.holes) ? round.holes.slice(9, 18) : []);

    front9 = Array.isArray(front9) ? front9 : [];
    back9 = Array.isArray(back9) ? back9 : [];

    const sumScores = (arr) =>
      arr.reduce((sum, h) => sum + (h.score ? Number(h.score) || 0 : 0), 0);
    const sumPutts = (arr) =>
      arr.reduce((sum, h) => sum + (h.p ? Number(h.p) || 0 : 0), 0);

    const allHoles = [...front9, ...back9];

    const s = round.summary || {};
    const frontScore = s.front9 ?? s.front ?? sumScores(front9);
    const backScore = s.back9 ?? s.back ?? sumScores(back9);
    const totalScore = s.total ?? s.round ?? frontScore + backScore;

    // derive stats
    const totalPutts =
      s.putts_total ??
      s.total_putts ??
      s.putts ??
      sumPutts(allHoles);

    const greensHit =
      s.greens_hit ??
      s.greens ??
      allHoles.filter(
        (h) => h.g === true || h.g === "✓" || h.g === "hit"
      ).length;

    const fairwaysHit =
      s.fairways_hit ??
      s.fairways ??
      allHoles.filter(
        (h) => h.f === true || h.f === "✓" || h.f === "hit"
      ).length;

    const statsObj = {
      totalScore,
      frontScore,
      backScore,
      totalPutts,
      greensHit,
      fairwaysHit,
      holesPlayed: allHoles.length,
    };

    return {
      front: front9,
      back: back9,
      summary: { frontScore, backScore, totalScore },
      stats: statsObj,
    };
  }, [round]);

  const renderTable = (holes, title, offset) => {
    if (!holes.length) return null;

    return (
      <div className="card">
        <h2 className="card-title">{title}</h2>

        <div className="table-wrapper">
          <table className="scorecard">
            <thead>
              <tr>
                <th>Hole</th>
                {holes.map((_, i) => (
                  <th key={i}>{i + 1 + offset}</th>
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
                  {holes.reduce(
                    (sum, h) => sum + (h.score ? Number(h.score) || 0 : 0),
                    0
                  )}
                </td>
              </tr>

              <tr>
                <td className="row-label">Putts</td>
                {holes.map((h, i) => (
                  <td key={i}>{h.p ?? "-"}</td>
                ))}
                <td>
                  {holes.reduce(
                    (sum, h) => sum + (h.p ? Number(h.p) || 0 : 0),
                    0
                  )}
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
  };

  return (
    <div className={`app-root ${dark ? "dark" : ""}`}>
      <div className="app-container">
        <header className="header">
          <div>
            <h1 className="title">GolfCardSync</h1>
            <p className="subtitle">Upload a scorecard, get instant analytics.</p>
          </div>

          <button
            className="dark-toggle"
            onClick={() => setDark((d) => !d)}
          >
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
        </header>

        <div className="upload-card">
          <div className="upload-top">
            <input
              type="file"
              accept="image/*"
              className="file-input"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <button
              onClick={uploadScorecard}
              className="upload-btn"
              disabled={loading || !file}
            >
              {loading ? "Processing..." : "Upload Scorecard"}
            </button>
          </div>
          <p className="hint">
            JPG or PNG of a handwritten scorecard. We’ll parse strokes, putts, fairways, and greens.
          </p>

          {error && <p className="error">{error}</p>}
        </div>

        {round && (
          <>
            <section className="dashboard">
              <div className="card stats-card">
                <h2 className="card-title">Round Summary</h2>
                <div className="stats-grid">
                  <div>
                    <div className="stat-label">Front 9</div>
                    <div className="stat-value">
                      {summary?.frontScore ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Back 9</div>
                    <div className="stat-value">
                      {summary?.backScore ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Total</div>
                    <div className="stat-value highlight">
                      {summary?.totalScore ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Holes</div>
                    <div className="stat-value">
                      {stats.holesPlayed || "-"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card rings-card">
                <h2 className="card-title">Consistency Rings</h2>
                <div className="rings-row">
                  <ProgressRing
                    label="Greens Hit"
                    value={stats.greensHit || 0}
                    max={18}
                  />
                  <ProgressRing
                    label="Fairways Hit"
                    value={stats.fairwaysHit || 0}
                    max={14}
                  />
                  <ProgressRing
                    label="Total Putts"
                    value={stats.totalPutts || 0}
                    max={36}
                  />
                </div>
              </div>
            </section>

            <section className="dashboard">
              {renderTable(front, "Front 9", 0)}
              {renderTable(back, "Back 9", 9)}
            </section>

            <section className="dashboard">
              <div className="card full-width">
                <HoleChart holes={[...front, ...back]} />
              </div>
            </section>

            {/* Debug card if structure is weird */}
            {!front.length && !back.length && (
              <section className="dashboard">
                <div className="card">
                  <h2 className="card-title">Raw API Response</h2>
                  <pre className="raw-json">
                    {JSON.stringify(raw, null, 2)}
                  </pre>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
