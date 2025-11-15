import { useState } from "react";
import axios from "axios";
import "./App.css";
import logo from "./assets/golfcardsync-logo.png"; // make sure this path/file exists

function normalizeRound(apiData) {
  const top = apiData || {};

  // Pick the most likely “round-like” object
  const candidate =
    top.round ||
    top.analysis?.round ||
    top.analysis ||
    top.strokes?.round ||
    top.strokes ||
    top;

  let front =
    candidate.front9 ||
    candidate.front ||
    (Array.isArray(candidate.holes) ? candidate.holes.slice(0, 9) : []);
  let back =
    candidate.back9 ||
    candidate.back ||
    (Array.isArray(candidate.holes) ? candidate.holes.slice(9, 18) : []);

  front = Array.isArray(front) ? front : [];
  back = Array.isArray(back) ? back : [];

  const all = [...front, ...back];

  const sumField = (arr, field) =>
    arr.reduce((sum, h) => sum + (h[field] ? Number(h[field]) || 0 : 0), 0);

  const s = candidate.summary || top.summary || {};

  const frontScore = s.front9 ?? s.front ?? sumField(front, "score");
  const backScore = s.back9 ?? s.back ?? sumField(back, "score");
  const totalScore = s.total ?? s.round ?? frontScore + backScore;

  const totalPutts =
    s.putts_total ??
    s.total_putts ??
    s.putts ??
    sumField(all, "p");

  const greensHit =
    s.greens_hit ??
    s.greens ??
    all.filter((h) => h.g === true || h.g === "✓" || h.g === "hit").length;

  const fairwaysHit =
    s.fairways_hit ??
    s.fairways ??
    all.filter((h) => h.f === true || h.f === "✓" || h.f === "hit").length;

  const stats = {
    totalScore,
    frontScore,
    backScore,
    totalPutts,
    greensHit,
    fairwaysHit,
    holesPlayed: all.length,
  };

  return {
    round: candidate,
    front,
    back,
    summary: { frontScore, backScore, totalScore },
    stats,
  };
}

function ProgressRing({ label, value, max }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const offset = circumference * (1 - pct);

  return (
    <div className="ring">
      <svg width="100" height="100">
        <circle className="ring-bg" cx="50" cy="50" r={radius} />
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
  const scores = holes.map((h) => (h.score ? Number(h.score) || 0 : 0));
  if (!scores.length) return null;

  const maxScore = Math.max(...scores, 5);
  const minScore = Math.min(...scores, 2);

  const points = scores
    .map((s, i) => {
      const x = (i / Math.max(scores.length - 1, 1)) * 100;
      const normY = (s - minScore) / Math.max(maxScore - minScore || 1, 1);
      const y = 100 - normY * 80 - 10;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chart-card">
      <h3>Hole-by-Hole Score</h3>
      <svg viewBox="0 0 100 100" className="hole-chart">
        <polyline className="hole-line" points={points} />
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
  const [front, setFront] = useState([]);
  const [back, setBack] = useState([]);
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState({});
  const [recentRounds, setRecentRounds] = useState([]);
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
    setFront([]);
    setBack([]);
    setSummary(null);
    setStats({});
    setRaw(null);

    try {
      const res = await axios.post(`${API}/api/round/from-image`, form);
      console.log("API response:", res.data);
      setRaw(res.data);

      const norm = normalizeRound(res.data);
      setRound(norm.round);
      setFront(norm.front);
      setBack(norm.back);
      setSummary(norm.summary);
      setStats(norm.stats);

      // keep last 8 scorecards
      const entry = {
        id: Date.now(),
        createdAt: new Date().toLocaleString(),
        summary: norm.summary,
        stats: norm.stats,
      };
      setRecentRounds((prev) => [entry, ...prev].slice(0, 8));
    } catch (err) {
      console.error(err);
      setError("Error processing scorecard");
    } finally {
      setLoading(false);
    }
  };

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
                    (sum, h) =>
                      sum + (h.score ? Number(h.score) || 0 : 0),
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
          <div className="logo-title">
            <img src={logo} alt="GolfCardSync" className="logo-img" />
            <div>
              <h1 className="title">GolfCardSync</h1>
              <p className="subtitle">
                Scorecard Capture · Analyze · Improve
              </p>
            </div>
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
            Upload a JPG/PNG of your scorecard. We’ll parse strokes, putts,
            fairways, and greens.
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
          </>
        )}

        {/* Recent scorecards (last 8 this session) */}
        {recentRounds.length > 0 && (
          <section className="dashboard recent-section">
            <div className="card full-width">
              <h2 className="card-title">Recent Scorecards</h2>
              <div className="recent-grid">
                {recentRounds.map((r) => (
                  <div key={r.id} className="recent-card">
                    <div className="recent-top">
                      <div className="recent-score">
                        {r.summary.totalScore ?? "-"}
                      </div>
                      <div className="recent-label">Total</div>
                    </div>
                    <div className="recent-details">
                      <div>Front: {r.summary.frontScore ?? "-"}</div>
                      <div>Back: {r.summary.backScore ?? "-"}</div>
                      <div>Putts: {r.stats.totalPutts ?? "-"}</div>
                      <div>Greens: {r.stats.greensHit ?? "-"}</div>
                      <div>Fairways: {r.stats.fairwaysHit ?? "-"}</div>
                      <div className="recent-date">{r.createdAt}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Raw response card if we still couldn't interpret it */}
        {raw && !front.length && !back.length && (
          <section className="dashboard">
            <div className="card full-width">
              <h2 className="card-title">Raw API Response</h2>
              <pre className="raw-json">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default App;
