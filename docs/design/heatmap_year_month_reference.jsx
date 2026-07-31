import React, { useMemo, useState } from "react";

/**
 * DiaryHeatmap — self-contained GitHub-style activity heatmap for a diary app.
 * Year view (53-week grid) + Month view (calendar with word counts).
 * Mock data only: replace `entryFor` with your real lookup.
 */

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const TODAY = new Date(2026, 6, 31);   // "today" for the mock data
const START = new Date(2025, 8, 1);    // account created

const NO = "#e3e5e9", ONTIME = "#0aa671", BACK = "#6ee7b7", FUTURE = "#f7f8fa";

const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const hash = (d) => {
  const n = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return ((n * 2654435761) % 1000) / 1000;
};

/** MOCK: deterministic fake history. Swap for real data. */
function entryFor(d) {
  if (d > TODAY || d < START) return null;
  const h = hash(d);
  if (h > 0.55) return null;
  return { backfilled: h > 0.42, words: 120 + Math.round(h * 900) };
}

function cellFor(d) {
  const future = d > TODAY;
  const isToday = key(d) === key(TODAY);
  const e = future ? null : entryFor(d);
  return {
    bg: future ? FUTURE : e ? (e.backfilled ? BACK : ONTIME) : NO,
    border: isToday ? "1.8px solid #f0a63c" : future ? "1px solid #e6e9ee" : "1px solid transparent",
    cursor: future ? "default" : "pointer",
    opacity: future ? 0.55 : 1,
    day: d.getDate(),
    fg: e && !e.backfilled ? "#fff" : "#16202e",
    metaFg: e ? (e.backfilled ? "rgba(12,60,44,.78)" : "rgba(255,255,255,.82)") : "#9aa2ae",
    meta: e ? `${e.words}w` : future ? "" : "—",
    tip: `${SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` +
      (e ? ` · ${e.words} words${e.backfilled ? " (backfilled)" : ""}` : future ? " · upcoming" : " · no entry"),
  };
}

const CSS = `
.dh-cell { transition: transform 120ms; }
.dh-cell:hover { transform: scale(1.35); }
.dh-day { transition: transform 140ms, box-shadow 140ms; }
.dh-day:hover { transform: translateY(-2px); box-shadow: 0 8px 18px -8px rgba(22,32,46,.3); }
.dh-nav:hover:enabled { border-color: #16202e !important; color: #16202e !important; }
.dh-nav:disabled { opacity: .4; cursor: default; }
.dh-select:hover { border-color: #16202e; }
@keyframes dhFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.dh-fade { animation: dhFade 260ms ease-out both; }
`;

const card = {
  background: "#fff", border: "1px solid #e6e9ee", borderRadius: 12,
  padding: "22px 18px", textAlign: "center", boxShadow: "0 1px 2px rgba(22,32,46,.04)",
};
const navBtn = {
  width: 32, height: 34, border: "1px solid #e2e6ec", background: "#fff",
  borderRadius: 8, cursor: "pointer", color: "#6f7887", fontSize: 15, lineHeight: 1,
};

function Stat({ value, label, unit }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 13.5, color: "#6f7887", marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "#b0b7c1" }}>{unit}</div>
    </div>
  );
}

function Legend({ color, border, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#6f7887" }}>
      <span style={{ width: 13, height: 13, borderRadius: 3, background: color, border, display: "inline-block", boxSizing: "border-box" }} />
      {children}
    </div>
  );
}

export default function DiaryHeatmap() {
  const [mode, setMode] = useState("year");
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const isYear = mode === "year";

  const v = useMemo(() => {
    // year grid: whole weeks covering Jan 1 – Dec 31
    const jan = new Date(year, 0, 1);
    const gridStart = new Date(year, 0, 1 - jan.getDay());
    const dec = new Date(year, 11, 31);
    const gridEnd = new Date(year, 11, 31 + (6 - dec.getDay()));
    const yearCells = [], monthLabels = [];
    let seen = -1;
    for (const d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      const inYear = d.getFullYear() === year;
      yearCells.push(inYear ? cellFor(new Date(d)) : { bg: "transparent", border: "1px solid transparent", cursor: "default", tip: "" });
      if (inYear && d.getMonth() !== seen && d.getDay() <= 3) {
        seen = d.getMonth();
        monthLabels.push({ text: SHORT[seen], col: Math.floor(yearCells.length / 7) + 1 });
      }
    }

    // month grid
    const first = new Date(year, month, 1);
    const mStart = new Date(year, month, 1 - first.getDay());
    const last = new Date(year, month + 1, 0);
    const mEnd = new Date(year, month, last.getDate() + (6 - last.getDay()));
    const monthCells = [];
    for (const d = new Date(mStart); d <= mEnd; d.setDate(d.getDate() + 1)) {
      monthCells.push(d.getMonth() === month
        ? cellFor(new Date(d))
        : { bg: "transparent", border: "1px solid transparent", cursor: "default", opacity: 1, day: "", meta: "", fg: "#c7ccd4", metaFg: "#c7ccd4", tip: "" });
    }

    // stats scoped to the visible range
    let entries = 0, words = 0, streak = 0, longest = 0, run = 0;
    const from = isYear ? new Date(year, 0, 1) : first;
    const to = isYear ? new Date(year, 11, 31) : last;
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const e = entryFor(d);
      if (e) { entries++; words += e.words; run++; longest = Math.max(longest, run); streak = run; }
      else if (d <= TODAY) { run = 0; streak = 0; }
    }

    return {
      yearCells, monthLabels, monthCells,
      weekCount: Math.ceil(yearCells.length / 7),
      daysInMonth: last.getDate(),
      entries, words, streak, longest,
      monthOptions: MONTHS.map((label, i) => ({
        value: i, label: `${label} ${year}`,
        disabled: new Date(year, i, 1) > TODAY || new Date(year, i + 1, 0) < START,
      })),
      atFirst: year === START.getFullYear() && month <= START.getMonth(),
      atLast: year === TODAY.getFullYear() && month >= TODAY.getMonth(),
      atThisYear: year >= TODAY.getFullYear(),
    };
  }, [year, month, isYear]);

  const seg = (active) => ({
    border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500,
    padding: "7px 15px", borderRadius: 7, transition: "all 160ms",
    background: active ? "#fff" : "transparent",
    color: active ? "#16202e" : "#78818f",
    boxShadow: active ? "0 1px 3px rgba(22,32,46,.14)" : "none",
  });

  const prevMonth = () => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1));
  const nextMonth = () => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1));

  return (
    <div style={{
      minHeight: "100vh", background: "#f7f8fa", color: "#16202e",
      fontFamily: "'Inter Tight', Helvetica, Arial, sans-serif",
      padding: "34px 30px 60px", boxSizing: "border-box",
    }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
          <Stat value={v.streak} label="Current streak" unit="days" />
          <Stat value={v.longest} label="Longest streak" unit="days" />
          <Stat value={v.entries} label="Total entries" unit="entries" />
          <Stat value={v.words.toLocaleString("en-US")} label="Total words" unit="words" />
        </div>

        <section style={{
          background: "#fff", border: "1px solid #e6e9ee", borderRadius: 14,
          boxShadow: "0 1px 2px rgba(22,32,46,.04)", padding: "22px 24px 24px",
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>
                {isYear ? `${year} · full year` : `${MONTHS[month]} ${year}`}
              </h2>
              <span style={{ fontSize: 13, color: "#9aa2ae" }}>
                {isYear ? `${v.weekCount} weeks · hover a day for details` : `${v.daysInMonth} days · ${v.entries} entries logged`}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", background: "#f1f3f6", borderRadius: 9, padding: 3, gap: 2 }}>
                <button style={seg(isYear)} onClick={() => setMode("year")}>Year</button>
                <button style={seg(!isYear)} onClick={() => setMode("month")}>Month</button>
              </div>

              {isYear ? (
                <div className="dh-fade" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="dh-nav" style={navBtn} onClick={() => setYear(year - 1)}>‹</button>
                  <span style={{ fontSize: 13.5, fontWeight: 500, minWidth: 46, textAlign: "center" }}>{year}</span>
                  <button className="dh-nav" style={navBtn} disabled={v.atThisYear} onClick={() => setYear(Math.min(year + 1, TODAY.getFullYear()))}>›</button>
                </div>
              ) : (
                <div className="dh-fade" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="dh-nav" style={navBtn} disabled={v.atFirst} onClick={prevMonth}>‹</button>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <select
                      className="dh-select"
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value))}
                      style={{
                        appearance: "none", border: "1px solid #e2e6ec", background: "#fff",
                        borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", color: "#16202e",
                        padding: "8px 32px 8px 13px", height: 34, cursor: "pointer", minWidth: 152,
                      }}
                    >
                      {v.monthOptions.map((m) => (
                        <option key={m.value} value={m.value} disabled={m.disabled}>{m.label}</option>
                      ))}
                    </select>
                    <span style={{
                      position: "absolute", right: 12, width: 8, height: 8,
                      borderRight: "1.6px solid #6f7887", borderBottom: "1.6px solid #6f7887",
                      transform: "translateY(-2px) rotate(45deg)", pointerEvents: "none",
                    }} />
                  </div>
                  <button className="dh-nav" style={navBtn} disabled={v.atLast} onClick={nextMonth}>›</button>
                </div>
              )}
            </div>
          </div>

          {isYear ? (
            <div className="dh-fade" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 26 }} />
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${v.weekCount}, 1fr)`, fontSize: 11, color: "#9aa2ae" }}>
                  {v.monthLabels.map((lab) => (
                    <span key={lab.text} style={{ gridRow: 1, gridColumn: `${lab.col} / span 4` }}>{lab.text}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 26, display: "grid", gridTemplateRows: "repeat(7, 1fr)", gap: 3, fontSize: 10.5, color: "#9aa2ae" }}>
                  {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => <span key={i} style={{ lineHeight: 1 }}>{d}</span>)}
                </div>
                <div style={{
                  flex: 1, display: "grid", gridAutoFlow: "column",
                  gridTemplateRows: "repeat(7, 1fr)", gridAutoColumns: "1fr", gap: 3,
                }}>
                  {v.yearCells.map((c, i) => (
                    <div key={i} className="dh-cell" title={c.tip} style={{
                      aspectRatio: "1", borderRadius: 3, background: c.bg,
                      border: c.border, boxSizing: "border-box", cursor: c.cursor,
                    }} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="dh-fade" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, fontSize: 11.5, fontWeight: 500, color: "#9aa2ae", letterSpacing: "0.02em" }}>
                {["SUN","MON","TUE","WED","THU","FRI","SAT"].map((d) => <span key={d}>{d}</span>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                {v.monthCells.map((c, i) => (
                  <div key={i} className="dh-day" title={c.tip} style={{
                    aspectRatio: "1.35", borderRadius: 9, background: c.bg, border: c.border,
                    boxSizing: "border-box", padding: "9px 10px", display: "flex",
                    flexDirection: "column", justifyContent: "space-between",
                    cursor: c.cursor, opacity: c.opacity,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.fg }}>{c.day}</span>
                    <span style={{ fontSize: 11, color: c.metaFg }}>{c.meta}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", borderTop: "1px solid #f0f2f5", paddingTop: 16 }}>
            <Legend color={NO}>No entry</Legend>
            <Legend color={ONTIME}>Written on time</Legend>
            <Legend color={BACK}>Backfilled</Legend>
            <Legend color={FUTURE} border="1px solid #e6e9ee">Future</Legend>
            <div style={{ marginLeft: "auto" }}>
              <Legend color="#fff" border="1.8px solid #f0a63c">Today</Legend>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
