import React, { useMemo, useState } from "react";

/* ─────────────────────────────────────────────────────────────
   Diary — "Ink & Almanac"
   Single self-contained file. All three screens, light + dark,
   desktop + mobile, every state. Sample data is hard-coded.

   TOKENS live as CSS custom properties in <Tokens/> below, so they
   drop straight into tailwind.config.js:
     theme.extend.colors = { paper:'var(--paper)', ink:'var(--ink)', ... }
   Then `bg-paper text-ink` works and dark mode is one attribute:
     <html data-theme="dark">
   Nothing here needs an animation library.
   ───────────────────────────────────────────────────────────── */

const GRAIN_LIGHT =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/></filter><rect width='180' height='180' filter='url(%23n)' opacity='0.05'/></svg>\")";
const GRAIN_DARK = GRAIN_LIGHT.replace("opacity='0.05'", "opacity='0.11'");

const CSS = `
:root{
  --paper:#f6f1e7; --paper-2:#efe8da; --card:#fffdf8; --deckle:#e8dfcd;
  --ink:#23201c; --ink-2:#5a5346; --ink-3:#8a7f6d;
  --wax:#9c3b2c; --wax-soft:#f0dcd6;
  --leaf:#4f7b58; --leaf-deep:#2f4a37; --leaf-soft:#dfe8e0;
  --brass:#c9a227; --brass-soft:#f3e7c4;
  --line:rgba(35,32,28,.11); --line-2:rgba(35,32,28,.2);
  --empty:#e4dccc; --future:rgba(35,32,28,.045);
  --shadow-1:0 1px 2px rgba(58,45,26,.06);
  --shadow-2:0 2px 6px rgba(58,45,26,.07), 0 10px 26px -14px rgba(58,45,26,.24);
  --shadow-3:0 18px 44px -18px rgba(58,45,26,.4);
  --grain:${GRAIN_LIGHT};
}
[data-theme="dark"]{
  --paper:#171614; --paper-2:#1d1c19; --card:#211f1c; --deckle:#2a2723;
  --ink:#ece7dc; --ink-2:#b3ab9c; --ink-3:#847c6d;
  --wax:#d4694f; --wax-soft:#3a221c;
  --leaf:#6f9e78; --leaf-deep:#3d5c45; --leaf-soft:#203024;
  --brass:#d9b452; --brass-soft:#3b3116;
  --line:rgba(236,231,220,.1); --line-2:rgba(236,231,220,.2);
  --empty:#2c2925; --future:rgba(236,231,220,.035);
  --shadow-1:0 1px 2px rgba(0,0,0,.4);
  --shadow-2:0 2px 8px rgba(0,0,0,.44), 0 14px 30px -16px rgba(0,0,0,.7);
  --shadow-3:0 20px 50px -20px rgba(0,0,0,.8);
  --grain:${GRAIN_DARK};
}
.di{font-family:'Instrument Sans',Helvetica,Arial,sans-serif;color:var(--ink)}
.di textarea{font:inherit}
.di textarea::placeholder{color:var(--ink-3);opacity:.75}
.di ::selection{background:var(--brass-soft);color:var(--ink)}
.di a{color:var(--wax);text-decoration:none}
.di a:hover{color:var(--ink)}
.di button:focus-visible,.di textarea:focus-visible{outline:2px solid var(--brass);outline-offset:2px}

/* hover states — cheap, all transform/opacity */
.hv-lift{transition:transform 160ms cubic-bezier(.2,.7,.3,1),filter 160ms}
.hv-lift:hover{transform:translateY(-2px)}
.hv-cell{transition:transform 140ms cubic-bezier(.2,.7,.3,1)}
.hv-cell:hover{transform:scale(1.4)}
.hv-day{transition:transform 160ms cubic-bezier(.2,.7,.3,1),box-shadow 160ms}
.hv-day:hover{transform:translateY(-3px)}
.hv-photo{transition:transform 320ms cubic-bezier(.2,.7,.3,1),box-shadow 320ms}
.hv-photo:hover{transform:rotate(0deg) scale(1.05);box-shadow:var(--shadow-3)}
.hv-out{transition:all 160ms}
.hv-out:hover{border-color:var(--ink);color:var(--ink)}

@keyframes unroll{from{opacity:0;transform:translateX(16px) rotate(.4deg)}to{opacity:1;transform:none}}
@keyframes riseIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes inkPulse{0%,100%{opacity:.35}50%{opacity:.9}}
@keyframes nibSweep{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}
.an-rise{animation:riseIn 320ms cubic-bezier(.2,.7,.3,1) both}
.an-unroll{animation:unroll 420ms cubic-bezier(.2,.7,.3,1) both}
.an-pulse{animation:inkPulse 2.4s ease-in-out infinite}
.an-sweep{animation:nibSweep 1.6s linear infinite}
@media (prefers-reduced-motion:reduce){
  .di *{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important}
}
`;

/* ── sample data ───────────────────────────────────────────── */

const ENTRY = `Today was a very busy day for me. In the morning, I woke up late because my alarm clock didn't rang. I was so hurry to go to work that I forgot my wallet at home. When I arrived to the office, my manager was already there and she looked very strictly.

During the lunch time, I ate with my colleague at a small restaurant near here. The food was so delicous, especially the fried chicken, but the price was a little bit expensive. We talked about our work and future plans. My colleague suggested me to learn more about programming, which I think is a good advice.

In the afternoon, I had an important meeting with clients. I was very nervous because my English skill is not good enough to present. However, my boss helped me a lot and the meeting ended successful.

After finishing work, I went back home by bus. Traffic was very crowded today, so I felt very tired. When I arrived home, I cooked dinner and watched a comfortable movie on TV. Now I am writing this diary before go to sleep. I hope tomorrow will be a more better day than today!`;

const CHANGES = [
  { from: "didn't rang", to: "didn't ring", kind: "grammar", why: "After the auxiliary “didn't”, the main verb stays in its base form." },
  { from: "so hurry", to: "in such a hurry", kind: "vocabulary", why: "“In such a hurry” is the natural phrase for urgency; “hurry” is a noun here." },
  { from: "arrived to", to: "arrived at", kind: "grammar", why: "“Arrive” takes “at” for a specific place, “in” for a city or country." },
  { from: "looked very strictly", to: "looked very strict", kind: "grammar", why: "After a linking verb like “looked”, use an adjective, not an adverb." },
  { from: "delicous", to: "delicious", kind: "spelling", why: "Spelling — the “i” before “ous”." },
  { from: "the lunch time", to: "lunchtime", kind: "style", why: "“Lunchtime” is the usual compound noun and reads more naturally." },
  { from: "suggested me to learn", to: "suggested that I learn", kind: "grammar", why: "“Suggest” is followed by a that-clause, never by “someone to do”." },
  { from: "a good advice", to: "good advice", kind: "grammar", why: "“Advice” is uncountable, so it takes no article." },
  { from: "skill is", to: "skills are", kind: "grammar", why: "A plural subject needs a plural verb." },
  { from: "ended successful", to: "ended successfully", kind: "grammar", why: "Use an adverb to describe how the meeting ended." },
  { from: "a comfortable movie", to: "a comforting movie", kind: "vocabulary", why: "“Comforting” describes something that makes you feel at ease; “comfortable” describes physical comfort." },
  { from: "before go to sleep", to: "before I go to sleep", kind: "grammar", why: "The clause needs its subject “I” to be complete." },
  { from: "a more better day", to: "a better day", kind: "grammar", why: "“Better” is already comparative, so “more” is redundant." },
];

/** improved text as a token stream — strings are untouched text, numbers index CHANGES */
const STREAM = [
  "Today was a very busy day for me. In the morning, I woke up late because my alarm clock ", 0,
  ". I was ", 1, " to go to work that I forgot my wallet at home. When I ", 2,
  " the office, my manager was already there and she ", 3,
  ".\n\nDuring ", 5, ", I ate with my colleague at a small restaurant nearby. The food was so ", 4,
  ", especially the fried chicken, but the price was a little bit expensive. We talked about our work and future plans. My colleague ", 6,
  " more about programming, which I think is ", 7,
  ".\n\nIn the afternoon, I had an important meeting with clients. I was very nervous because my English ", 8,
  " not good enough to present. However, my boss helped me a lot and the meeting ", 9,
  ".\n\nAfter finishing work, I went back home by bus. Traffic was very heavy today, so I felt very tired. When I arrived home, I cooked dinner and watched ", 10,
  " on TV. Now I am writing this diary ", 11, ". I hope tomorrow will be ", 12, "!",
];

/** STREAM split on "\n\n" into paragraphs, so the rendered copy needs no pre-wrap */
const PARAGRAPHS = STREAM.reduce((acc, piece) => {
  if (typeof piece !== "string") { acc[acc.length - 1].push(piece); return acc; }
  piece.split("\n\n").forEach((part, i) => {
    if (i > 0) acc.push([]);
    if (part) acc[acc.length - 1].push(part);
  });
  return acc;
}, [[]]);

const FEEDBACK =
  "You described a full, busy day and kept the story easy to follow from morning to night — that is the hardest part, and you already do it well. Most of today's notes are the same two habits: prepositions after verbs of movement (“arrived at”, not “arrived to”) and choosing between an adjective and an adverb (“looked strict”, but “ended successfully”). Both are worth five minutes of attention tomorrow, because fixing them alone would remove more than half of these notes. Your vocabulary is reaching for the right idea — “comfortable movie” is a lovely near-miss for “comforting”. Keep reaching; near-misses are how the range grows.";

const CHIPS = {
  grammar: { bg: "var(--wax-soft)", fg: "var(--wax)" },
  vocabulary: { bg: "var(--brass-soft)", fg: "var(--brass)" },
  style: { bg: "var(--leaf-soft)", fg: "var(--leaf)" },
  spelling: { bg: "var(--paper-2)", fg: "var(--ink-2)" },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TODAY = new Date(2026, 7, 1);
const START = new Date(2025, 8, 1);

const dow = (d) => (d.getDay() + 6) % 7;              // Monday-first
const kk = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const hsh = (d) => (((d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) * 2654435761) % 1000) / 1000;

/** MOCK history. Replace with your real lookup: (Date) => {backfilled, words, mood} | null */
function entryFor(d) {
  if (d > TODAY || d < START) return null;
  const h = hsh(d);
  if (h > 0.62) return null;
  return { backfilled: h > 0.5, words: 120 + Math.round(h * 900), mood: h < 0.22 ? "happy" : h < 0.46 ? "normal" : "sad" };
}

const BACKFILL_FILL = "repeating-linear-gradient(135deg,var(--leaf) 0 3px,var(--leaf-deep) 3px 6px)";

function cellFor(d) {
  const future = d > TODAY;
  const today = kk(d) === kk(TODAY);
  const e = future ? null : entryFor(d);
  return {
    bg: future ? "var(--future)" : e ? (e.backfilled ? BACKFILL_FILL : "var(--leaf)") : "var(--empty)",
    border: future ? "1px dashed var(--line-2)" : "1px solid transparent",
    ring: today ? "0 0 0 2px var(--brass)" : "none",
    cursor: future ? "default" : "pointer",
    opacity: future ? 0.6 : 1,
    day: d.getDate(),
    fg: e ? "#f3f7f3" : "var(--ink-2)",
    metaFg: e ? "rgba(243,247,243,.8)" : "var(--ink-3)",
    meta: e ? `${e.words}w` : future ? "" : "—",
    moodBg: e ? (e.mood === "happy" ? "var(--brass)" : e.mood === "normal" ? "#f3f7f3" : "transparent") : "transparent",
    moodBorder: e && e.mood === "sad" ? "1.4px solid rgba(243,247,243,.85)" : "0",
    tip: `${SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` +
      (e ? ` · ${e.words} words · ${e.mood}${e.backfilled ? " · backfilled" : " · on time"}`
         : future ? " · upcoming" : " · no entry"),
  };
}

/* ── small shared bits ─────────────────────────────────────── */

const seg = (on) => ({
  border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500,
  padding: "7px 15px", borderRadius: 7, transition: "all 180ms cubic-bezier(.2,.7,.3,1)",
  background: on ? "var(--card)" : "transparent",
  color: on ? "var(--ink)" : "var(--ink-3)",
  boxShadow: on ? "var(--shadow-1)" : "none",
});
const segWrap = { display: "flex", gap: 2, background: "var(--paper-2)", borderRadius: 9, padding: 3 };
const label = { fontSize: 10.5, fontWeight: 500, letterSpacing: ".15em", color: "var(--ink-3)" };
const navBtn = {
  width: 32, height: 34, border: "1px solid var(--line-2)", background: "transparent",
  borderRadius: 8, cursor: "pointer", color: "var(--ink-2)", fontSize: 15, lineHeight: 1,
};
const serif = "Literata, Georgia, serif";
const mono = "'Space Grotesk', ui-monospace, monospace";

function Tokens() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400&family=Instrument+Sans:wght@400;500;600&family=Space+Grotesk:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <style>{CSS}</style>
    </>
  );
}

/* ── HOME ──────────────────────────────────────────────────── */

function Home({ mob, onWrite }) {
  const [view, setView] = useState("year");
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const isYear = view === "year";

  const g = useMemo(() => {
    const gs = new Date(year, 0, 1 - dow(new Date(year, 0, 1)));
    const ge = new Date(year, 11, 31 + (6 - dow(new Date(year, 11, 31))));
    const yearCells = [], ticks = [];
    let seen = -1;
    for (const d = new Date(gs); d <= ge; d.setDate(d.getDate() + 1)) {
      const inY = d.getFullYear() === year;
      yearCells.push(inY ? cellFor(new Date(d)) : null);
      if (inY && d.getMonth() !== seen && dow(d) <= 3) {
        seen = d.getMonth();
        ticks.push({ text: SHORT[seen], col: Math.floor(yearCells.length / 7) + 1 });
      }
    }
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const ms = new Date(year, month, 1 - dow(first));
    const me = new Date(year, month, last.getDate() + (6 - dow(last)));
    const monthCells = [];
    for (const d = new Date(ms); d <= me; d.setDate(d.getDate() + 1)) {
      monthCells.push(d.getMonth() === month ? cellFor(new Date(d)) : null);
    }
    let entries = 0;
    for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) if (entryFor(d)) entries++;
    const beads = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(TODAY); d.setDate(d.getDate() - i);
      const e = entryFor(d);
      beads.push({
        bg: e ? (e.backfilled ? BACKFILL_FILL : "var(--leaf)") : "var(--empty)",
        ring: i === 0 ? "0 0 0 1.5px var(--brass)" : "none",
        tip: `${SHORT[d.getMonth()]} ${d.getDate()}`,
      });
    }
    return { yearCells, ticks, weeks: Math.ceil(yearCells.length / 7), monthCells, entries, days: last.getDate(), beads };
  }, [year, month]);

  const statCell = {
    background: "var(--card)", padding: mob ? "16px" : "20px 24px",
    display: "flex", flexDirection: "column", gap: 9,
  };
  const big = { fontFamily: mono, fontSize: mob ? 34 : 44, fontWeight: 700, lineHeight: .9, letterSpacing: "-.03em" };

  return (
    <div className="an-rise" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...label, letterSpacing: ".16em" }}>SATURDAY, AUGUST 1, 2026</span>
          <h1 style={{ margin: 0, fontFamily: serif, fontSize: mob ? 24 : 31, fontWeight: 500, letterSpacing: "-.02em" }}>
            Good evening, Dũng
          </h1>
        </div>
        <a href="#" style={{ fontSize: 14, color: "var(--ink-3)" }}>Sign out</a>
      </div>

      {/* stats — one card, hairline-divided, wax spine */}
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "var(--card)", border: "1px solid var(--line)", boxShadow: "var(--shadow-2)" }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: "var(--wax)" }} />
        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 1, background: "var(--line)" }}>
          <div style={statCell}>
            <span style={label}>CURRENT STREAK</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span style={{ ...big, color: "var(--wax)" }}>17</span>
              <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 15, color: "var(--ink-3)" }}>days</span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {g.beads.map((b, i) => (
                <span key={i} title={b.tip} style={{ width: 11, height: 11, borderRadius: 3, background: b.bg, boxShadow: b.ring }} />
              ))}
              <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4 }}>last 7</span>
            </div>
          </div>
          <div style={statCell}>
            <span style={label}>LONGEST STREAK</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span style={big}>31</span>
              <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 15, color: "var(--ink-3)" }}>days</span>
            </div>
            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 11.5, color: "var(--ink-3)" }}>Mar 2 – Apr 1, 2026</span>
          </div>
          <div style={statCell}>
            <span style={label}>TOTAL ENTRIES</span>
            <span style={big}>148</span>
            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 11.5, color: "var(--ink-3)" }}>since Sep 2025</span>
          </div>
          <div style={statCell}>
            <span style={label}>TOTAL WORDS</span>
            <span style={big}>42,180</span>
            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 11.5, color: "var(--ink-3)" }}>≈ a short novel</span>
          </div>
        </div>
      </div>

      {/* almanac */}
      <section style={{
        position: "relative", background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: 16, boxShadow: "var(--shadow-2)", padding: mob ? "18px 16px" : "24px 26px",
        display: "flex", flexDirection: "column", gap: 20, overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "var(--grain)", pointerEvents: "none", opacity: .7 }} />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <h2 style={{ margin: 0, fontFamily: serif, fontSize: 20, fontWeight: 500, letterSpacing: "-.01em" }}>
              {isYear ? `${year} in full` : `${MONTHS[month]} ${year}`}
            </h2>
            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 12.5, color: "var(--ink-3)" }}>
              {isYear ? "each square is a day — hover for details" : `${g.days} days · ${g.entries} entries`}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <div style={segWrap}>
              <button style={seg(isYear)} onClick={() => setView("year")}>Year</button>
              <button style={seg(!isYear)} onClick={() => setView("month")}>Month</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="hv-out" style={navBtn}
                onClick={() => isYear ? setYear(year - 1) : (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1))}>‹</button>
              <span style={{ fontFamily: mono, fontSize: 13.5, fontWeight: 500, minWidth: isYear ? 48 : 112, textAlign: "center" }}>
                {isYear ? year : `${MONTHS[month]} ${year}`}
              </span>
              <button className="hv-out" style={navBtn}
                onClick={() => isYear ? setYear(Math.min(year + 1, TODAY.getFullYear())) : (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1))}>›</button>
            </div>
          </div>
        </div>

        {isYear ? (
          <div className="an-rise" style={{ position: "relative", display: "flex", flexDirection: "column", gap: 7, overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 9, minWidth: mob ? 720 : 0 }}>
              <div style={{ width: 30, flex: "none" }} />
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${g.weeks},1fr)`, fontSize: 10.5, letterSpacing: ".06em", color: "var(--ink-3)" }}>
                {g.ticks.map((t) => <span key={t.text} style={{ gridRow: 1, gridColumn: `${t.col} / span 4` }}>{t.text}</span>)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 9, minWidth: mob ? 720 : 0 }}>
              <div style={{ width: 30, flex: "none", display: "grid", gridTemplateRows: "repeat(7,1fr)", gap: 3, fontSize: 10, color: "var(--ink-3)", alignItems: "center" }}>
                {["MON","","WED","","FRI","","SUN"].map((d, i) => <span key={i}>{d}</span>)}
              </div>
              <div style={{ flex: 1, display: "grid", gridAutoFlow: "column", gridTemplateRows: "repeat(7,1fr)", gridAutoColumns: "1fr", gap: 3 }}>
                {g.yearCells.map((c, i) => c ? (
                  <div key={i} className="hv-cell" title={c.tip} style={{
                    aspectRatio: "1", borderRadius: 3.5, background: c.bg, border: c.border,
                    boxShadow: c.ring, boxSizing: "border-box", cursor: c.cursor,
                  }} />
                ) : <div key={i} />)}
              </div>
            </div>
          </div>
        ) : (
          <div className="an-rise" style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: mob ? 5 : 9, ...label, letterSpacing: ".1em" }}>
              {["MON","TUE","WED","THU","FRI","SAT","SUN"].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: mob ? 5 : 9 }}>
              {g.monthCells.map((c, i) => c ? (
                <div key={i} className="hv-day" title={c.tip} style={{
                  aspectRatio: mob ? "1" : "1.25", borderRadius: 10, background: c.bg, border: c.border,
                  boxShadow: c.ring, boxSizing: "border-box", padding: mob ? 6 : 9,
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                  position: "relative", cursor: c.cursor, opacity: c.opacity,
                }}>
                  <span style={{ fontFamily: mono, fontSize: mob ? 12 : 14, fontWeight: 500, color: c.fg }}>{c.day}</span>
                  <span style={{
                    position: "absolute", top: mob ? 6 : 9, right: mob ? 6 : 9, width: 7, height: 7,
                    borderRadius: 999, background: c.moodBg, border: c.moodBorder, boxSizing: "border-box",
                  }} />
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: c.metaFg }}>{c.meta}</span>
                </div>
              ) : <div key={i} />)}
            </div>
          </div>
        )}

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 15, fontSize: 12, color: "var(--ink-2)" }}>
          <Key sw="var(--empty)">No entry</Key>
          <Key sw="var(--leaf)">Written on time</Key>
          <Key sw={BACKFILL_FILL}>Backfilled</Key>
          <Key sw="var(--future)" border="1px dashed var(--line-2)">Future</Key>
          <span style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: "auto" }}>
            <span style={{ width: 13, height: 13, borderRadius: 3.5, boxShadow: "0 0 0 2px var(--brass)" }} />Today
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 10, borderLeft: "1px solid var(--line)" }}>
            <Dot bg="var(--brass)" />happy<Dot bg="var(--ink-3)" />normal<Dot border="1.4px solid var(--ink-3)" />sad
          </span>
        </div>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button className="hv-lift" onClick={onWrite} style={{
          border: 0, cursor: "pointer", background: "var(--wax)", color: "#fff", fontFamily: "inherit",
          fontSize: 14.5, fontWeight: 500, padding: "14px 24px", borderRadius: 11, boxShadow: "var(--shadow-2)",
        }}>Write today's entry</button>
        <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 14, color: "var(--ink-3)" }}>
          Keep the chain going — day 18 is one page away.
        </span>
      </div>
    </div>
  );
}

const Key = ({ sw, border, children }) => (
  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
    <span style={{ width: 13, height: 13, borderRadius: 3.5, background: sw, border, boxSizing: "border-box" }} />
    {children}
  </span>
);
const Dot = ({ bg = "transparent", border = "0" }) => (
  <span style={{ width: 8, height: 8, borderRadius: 999, background: bg, border, boxSizing: "border-box" }} />
);

/* ── PHOTO FRAMES ──────────────────────────────────────────── */
/* Photos are user-uploaded with unpredictable ratios: the frame owns the
   height, the img is object-cover. Tilt is a static transform, removed on
   hover. Nothing animates on its own. */

function Photo({ src, caption, time, tilt, h, width }) {
  return (
    <figure className="hv-photo" style={{
      margin: 0, width, flex: width ? "none" : undefined, background: "var(--card)",
      padding: "10px 10px 0", borderRadius: 3, boxShadow: "var(--shadow-2)",
      transform: `rotate(${tilt}deg)`, cursor: "zoom-in",
    }}>
      <div style={{ height: h, overflow: "hidden", borderRadius: 2, background: "var(--paper-2)" }}>
        <img src={src} alt={caption} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <figcaption style={{ fontFamily: serif, fontSize: 13, color: "var(--ink-3)", padding: "9px 2px 11px", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{caption}</span><span style={{ fontFamily: mono }}>{time}</span>
      </figcaption>
    </figure>
  );
}

function EmptySlot({ n, tilt, h, width }) {
  return (
    <figure style={{
      margin: 0, width, flex: width ? "none" : undefined, background: "var(--card)", padding: 10,
      borderRadius: 3, boxShadow: "var(--shadow-1)", border: "1px dashed var(--line-2)",
      transform: `rotate(${tilt}deg)`, cursor: "pointer",
      transition: "all 320ms cubic-bezier(.2,.7,.3,1)",
    }}>
      <div style={{ height: h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--paper-2)", borderRadius: 2 }}>
        <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 15, color: "var(--ink-3)" }}>Drop a photo</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>or <a href="#">browse files</a></span>
      </div>
      <figcaption style={{ fontFamily: serif, fontSize: 13, color: "var(--ink-3)", padding: "9px 2px 3px" }}>Slot {n} of 4</figcaption>
    </figure>
  );
}

/* ── ENTRY ─────────────────────────────────────────────────── */

const PHOTOS = [
  { src: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800", caption: "Rushed coffee", time: "08:40", tilt: -3.2 },
  { src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800", caption: "Desk, mid-chaos", time: "14:12", tilt: 2.4 },
];

const PROMPTS = [
  ["What surprised me today", "What surprised me today was "],
  ["One person I talked to", "Today I talked to "],
  ["Something I want to fix", "One thing I want to fix is "],
];

function MoodPicker({ value, onChange }) {
  const items = [["happy", "☀"], ["normal", "◐"], ["sad", "☂"]];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", paddingLeft: 6 }}>
      {items.map(([k, glyph], i) => {
        const on = value === i;
        return (
          <button key={k} title={k} onClick={() => onChange(i)} style={{
            width: 34, height: 34, borderRadius: 999, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1,
            transition: "all 180ms cubic-bezier(.2,.7,.3,1)",
            background: on ? "var(--brass-soft)" : "transparent",
            border: on ? "1.5px solid var(--brass)" : "1.5px solid var(--line-2)",
            color: on ? "var(--ink)" : "var(--ink-3)",
            transform: on ? "scale(1.06)" : "none",
          }}>{glyph}</button>
        );
      })}
    </div>
  );
}

function Paper({ mob, text, setText, height, showEmptyState }) {
  const blank = text.trim().length === 0;
  return (
    <div style={{
      position: "relative", borderRadius: 4, background: "var(--card)", backgroundImage: "var(--grain)",
      boxShadow: "var(--shadow-2)", border: "1px solid var(--line)", overflow: "hidden",
    }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "var(--wax)" }} />
      <span style={{ position: "absolute", left: mob ? 20 : 30, top: 0, bottom: 0, width: 1, background: "var(--wax)", opacity: .22 }} />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder="Write your diary entry here…"
        style={{
          position: "relative", width: "100%", height, boxSizing: "border-box", border: 0,
          outline: "none", resize: "none", background: "transparent",
          padding: `34px 34px 34px ${mob ? 26 : 44}px`,
          fontFamily: serif, fontSize: mob ? 16.5 : 17.5, lineHeight: 1.78,
          color: "var(--ink)", caretColor: "var(--wax)",
        }}
      />
      {showEmptyState && blank && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 18, pointerEvents: "none", padding: 40, textAlign: "center",
        }}>
          <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 21, color: "var(--ink-3)", maxWidth: "34ch", lineHeight: 1.5, textWrap: "pretty" }}>
            The page is waiting. Three sentences count as a day.
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", pointerEvents: "auto" }}>
            {PROMPTS.map(([t, seed]) => (
              <button key={t} onClick={() => setText(seed)} style={{
                border: "1px dashed var(--line-2)", background: "transparent", color: "var(--ink-2)",
                fontFamily: serif, fontStyle: "italic", fontSize: 14, padding: "9px 15px",
                borderRadius: 999, cursor: "pointer", transition: "all 180ms",
              }}>{t}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Entry({ mob, text, setText, onSuggest, onHome }) {
  const [mood, setMood] = useState(1);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="an-rise" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <h1 style={{ margin: 0, fontFamily: serif, fontSize: mob ? 24 : 31, fontWeight: 500, letterSpacing: "-.02em" }}>
            Friday, July 10, 2026
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: ".1em", color: "var(--wax)",
              background: "var(--wax-soft)", border: "1px solid var(--wax)", borderRadius: 999, padding: "3px 10px",
            }}>BACKFILLED</span>
            <MoodPicker value={mood} onChange={setMood} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-3)" }}>
            <span className="an-pulse" style={{ width: 7, height: 7, borderRadius: 999, background: "var(--leaf)" }} />
            Saved · just now
          </span>
          <a href="#" onClick={onHome} style={{ fontSize: 14, color: "var(--ink-3)" }}>← Home</a>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: mob ? "1fr" : "minmax(0,250px) minmax(0,1fr) minmax(0,250px)",
        gap: mob ? 16 : "clamp(14px,2.4vw,32px)", alignItems: "start",
      }}>
        {!mob && (
          <aside style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 26, minWidth: 0 }}>
            <Photo {...PHOTOS[0]} h="clamp(160px,17vw,220px)" />
            <Photo {...PHOTOS[1]} h="clamp(200px,22vw,290px)" />
          </aside>
        )}

        <main style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Paper mob={mob} text={text} setText={setText} height={mob ? 460 : 620} showEmptyState />
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button className="hv-lift" onClick={onSuggest} style={{
              border: 0, cursor: "pointer", background: "var(--ink)", color: "var(--paper)",
              fontFamily: "inherit", fontSize: 14, fontWeight: 500, padding: "13px 22px",
              borderRadius: 10, boxShadow: "var(--shadow-1)",
            }}>Suggest better English</button>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>5 suggestions left today</span>
            <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 12.5, color: "var(--ink-3)" }}>{words} words</span>
          </div>
        </main>

        {!mob && (
          <aside style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 76, minWidth: 0 }}>
            <EmptySlot n={3} tilt={3} h="clamp(200px,22vw,290px)" />
            <EmptySlot n={4} tilt={-2.6} h="clamp(160px,17vw,220px)" />
          </aside>
        )}
      </div>

      {mob && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <span style={label}>PHOTOS · 2 OF 4</span>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "6px 2px 14px", scrollSnapType: "x mandatory" }}>
            <Photo {...PHOTOS[0]} h={180} width={190} />
            <Photo {...PHOTOS[1]} h={180} width={190} />
            <EmptySlot n={3} tilt={1.6} h={180} width={190} />
            <EmptySlot n={4} tilt={-1.8} h={180} width={190} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SUGGESTION ────────────────────────────────────────────── */

function Suggestion({ mob, text, setText, status, setStatus, onHome }) {
  const [sel, setSel] = useState(null);
  const [copied, setCopied] = useState(false);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const colH = mob ? 440 : 600;

  const run = () => { setStatus("loading"); setTimeout(() => setStatus("done"), 2200); };
  const copy = () => {
    navigator.clipboard?.writeText(STREAM.map((p) => (typeof p === "string" ? p : CHANGES[p].to)).join(""));
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="an-rise" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <h1 style={{ margin: 0, fontFamily: serif, fontSize: mob ? 24 : 31, fontWeight: 500, letterSpacing: "-.02em" }}>
            Friday, July 10, 2026
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: ".1em", color: "var(--wax)",
              background: "var(--wax-soft)", border: "1px solid var(--wax)", borderRadius: 999, padding: "3px 10px",
            }}>BACKFILLED</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Saved · 2 min ago</span>
          </div>
        </div>
        <a href="#" onClick={onHome} style={{ fontSize: 14, color: "var(--ink-3)" }}>← Home</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 18, alignItems: "start" }}>
        {/* LEFT — the user's own words, always editable, never overwritten */}
        <section style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", height: 20 }}>
            <span style={label}>YOUR ENTRY</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: "var(--ink-3)" }}>{words} words</span>
          </div>
          <div style={{ position: "relative", borderRadius: 4, background: "var(--card)", backgroundImage: "var(--grain)", border: "1px solid var(--line)", boxShadow: "var(--shadow-2)", overflow: "hidden", height: colH }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "var(--wax)" }} />
            <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} style={{
              position: "relative", width: "100%", height: "100%", boxSizing: "border-box", border: 0,
              outline: "none", resize: "none", background: "transparent",
              padding: `26px 26px 26px ${mob ? 26 : 44}px`,
              fontFamily: serif, fontSize: mob ? 16.5 : 17.5, lineHeight: 1.78, color: "var(--ink)", caretColor: "var(--wax)",
            }} />
          </div>
        </section>

        {/* RIGHT — the tutor's copy. Copy is the only action. */}
        <section style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, height: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span style={{ ...label, color: "var(--leaf)" }}>TUTOR'S COPY</span>
              {status === "done" && (
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: "var(--leaf)", background: "var(--leaf-soft)", padding: "2px 8px", borderRadius: 999 }}>
                  {CHANGES.length} notes
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>5 suggestions left today</span>
          </div>

          <div className="an-unroll" style={{
            position: "relative", borderRadius: 4, background: "var(--card)", backgroundImage: "var(--grain)",
            border: "1px solid var(--line)", boxShadow: "var(--shadow-2)", overflow: "hidden",
            height: colH, display: "flex", flexDirection: "column",
          }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "var(--leaf)" }} />

            {status === "idle" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 40, textAlign: "center" }}>
                <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 19, color: "var(--ink-3)", maxWidth: "30ch", lineHeight: 1.55, textWrap: "pretty" }}>
                  When you're done writing, I'll read it and leave notes in the margin.
                </span>
                <button className="hv-lift" onClick={run} style={{
                  border: 0, cursor: "pointer", background: "var(--ink)", color: "var(--paper)",
                  fontFamily: "inherit", fontSize: 14, fontWeight: 500, padding: "12px 20px", borderRadius: 10,
                }}>Suggest better English</button>
              </div>
            )}

            {status === "loading" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "26px 26px 26px 34px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="an-pulse" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--leaf)" }} />
                  <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 15, color: "var(--ink-2)" }}>Reading your entry…</span>
                </div>
                {["96%","88%","74%","92%","60%","84%","90%","70%","46%"].map((w, i) => (
                  <div key={i} style={{ position: "relative", height: 13, borderRadius: 3, background: "var(--paper-2)", width: w, overflow: "hidden" }}>
                    <div className="an-sweep" style={{
                      position: "absolute", inset: 0, width: "34%",
                      background: "linear-gradient(90deg,transparent,var(--leaf-soft),transparent)",
                      animationDelay: `${(i * 0.12).toFixed(2)}s`,
                    }} />
                  </div>
                ))}
              </div>
            )}

            {status === "error" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40, textAlign: "center" }}>
                <span style={{ fontFamily: serif, fontSize: 19, color: "var(--wax)" }}>The note came back blank.</span>
                <span style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: "34ch", lineHeight: 1.6, textWrap: "pretty" }}>
                  Something went wrong on our side. Your entry is safe and unchanged.
                </span>
                <button onClick={run} style={{
                  border: "1px solid var(--wax)", background: "transparent", color: "var(--wax)", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13.5, fontWeight: 500, padding: "10px 18px", borderRadius: 9,
                }}>Try again</button>
              </div>
            )}

            {status === "done" && (
              <>
                <div style={{ flex: 1, overflowY: "auto", padding: "26px 26px 26px 34px", fontFamily: serif, fontSize: mob ? 16.5 : 17.5, lineHeight: 1.78, color: "var(--ink)" }}>
                  {/* paragraph breaks are structural <p>s — never white-space:pre-wrap */}
                  {PARAGRAPHS.map((para, pi) => (
                  <p key={pi} style={{ margin: "0 0 18px" }}>
                  {para.map((p, i) => {
                    if (typeof p === "string") return <span key={i}>{p}</span>;
                    const c = CHANGES[p], on = sel === p;
                    return (
                      <span key={i} onClick={() => setSel(on ? null : p)} title={`${c.from} → ${c.to} · ${c.kind}`} style={{
                        /* bleed via box-shadow, never horizontal padding — padding would
                           push a space between the corrected word and its punctuation */
                        background: on ? "var(--brass-soft)" : "var(--leaf-soft)",
                        boxShadow: on
                          ? "0 0 0 2px var(--brass-soft), 0 0 0 3.5px var(--brass)"
                          : "0 0 0 2px var(--leaf-soft)",
                        borderRadius: 3, cursor: "pointer",
                        transition: "background 160ms, box-shadow 160ms",
                      }}>{c.to}</span>
                    );
                  })}
                  </p>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid var(--line)", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--paper-2)" }}>
                  <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 12.5, color: "var(--ink-3)" }}>
                    Your own words stay exactly as you wrote them.
                  </span>
                  <button className="hv-out" onClick={copy} style={{
                    border: "1px solid var(--line-2)", background: "var(--card)", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 13, color: "var(--ink)", padding: "8px 15px", borderRadius: 8,
                  }}>{copied ? "Copied ✓" : "Copy"}</button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {status === "done" && (
        <>
          <section style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={label}>MARGIN NOTES</span>
              <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 13, color: "var(--ink-3)" }}>
                tap a highlight above to jump here
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 10 }}>
              {CHANGES.map((c, i) => {
                const on = sel === i;
                return (
                  <div key={i} onClick={() => setSel(on ? null : i)} style={{
                    position: "relative", background: on ? "var(--brass-soft)" : "var(--card)",
                    border: `1px solid ${on ? "var(--brass)" : "var(--line)"}`, borderRadius: 11,
                    padding: "13px 15px 13px 17px", cursor: "pointer", overflow: "hidden",
                    boxShadow: on ? "var(--shadow-2)" : "var(--shadow-1)",
                    transition: "all 180ms cubic-bezier(.2,.7,.3,1)",
                  }}>
                    <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: on ? "var(--brass)" : "transparent" }} />
                    <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: serif, fontSize: 15, color: "var(--ink-3)", textDecoration: "line-through", textDecorationColor: "var(--wax)" }}>{c.from}</span>
                      <span style={{ color: "var(--ink-3)", fontSize: 13 }}>→</span>
                      <span style={{ fontFamily: serif, fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>{c.to}</span>
                      <span style={{
                        marginLeft: "auto", fontSize: 10.5, fontWeight: 500, letterSpacing: ".06em",
                        textTransform: "uppercase", color: CHIPS[c.kind].fg, background: CHIPS[c.kind].bg,
                        padding: "2.5px 8px", borderRadius: 999,
                      }}>{c.kind}</span>
                    </div>
                    <p style={{ margin: "7px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)", textWrap: "pretty" }}>{c.why}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* feedback card — reads well at 2 lines and at 15 */}
          <section style={{
            position: "relative", background: "var(--card)", backgroundImage: "var(--grain)",
            border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--shadow-2)",
            padding: "22px 26px 24px 30px", overflow: "hidden",
          }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "var(--brass)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={label}>A NOTE FROM YOUR TUTOR</span>
              <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
            <p style={{ margin: 0, fontFamily: serif, fontSize: 16, lineHeight: 1.72, color: "var(--ink)", textWrap: "pretty", maxWidth: "78ch" }}>
              {FEEDBACK}
            </p>
            <p style={{ margin: "14px 0 0", fontFamily: serif, fontStyle: "italic", fontSize: 14, color: "var(--ink-3)" }}>
              — see you tomorrow, same page
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/* ── SHELL (demo chrome — drop this in the real app) ───────── */

export default function DiaryInkAlmanac() {
  const [theme, setTheme] = useState("light");
  const [screen, setScreen] = useState("home");
  const [width, setWidth] = useState("desktop");
  const [status, setStatus] = useState("done");
  const [text, setText] = useState(ENTRY);
  const mob = width === "mobile";

  return (
    <div className="di" data-theme={theme} style={{ minHeight: "100vh", background: "var(--paper)", backgroundImage: "var(--grain)" }}>
      <Tokens />

      <div style={{
        position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 14,
        flexWrap: "wrap", padding: "10px 18px", background: "var(--card)",
        borderBottom: "1px solid var(--line)", boxShadow: "var(--shadow-1)",
      }}>
        <span style={{ fontFamily: serif, fontSize: 15, fontWeight: 600, letterSpacing: "-.01em" }}>Diary</span>
        <span style={label}>INK &amp; ALMANAC</span>
        <div style={{ ...segWrap, marginLeft: 8 }}>
          {[["home","Home"],["entry","Entry"],["suggest","Suggestion"]].map(([k, l]) => (
            <button key={k} style={seg(screen === k)} onClick={() => setScreen(k)}>{l}</button>
          ))}
        </div>
        <div style={segWrap}>
          <button style={seg(!mob)} onClick={() => setWidth("desktop")}>Desktop</button>
          <button style={seg(mob)} onClick={() => setWidth("mobile")}>Mobile</button>
        </div>
        <button className="hv-out" onClick={() => setTheme(theme === "light" ? "dark" : "light")} style={{
          border: "1px solid var(--line-2)", background: "transparent", color: "var(--ink-2)",
          cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, padding: "6px 13px", borderRadius: 8,
        }}>{theme === "light" ? "☾ Dark" : "☀ Light"}</button>
        {screen === "suggest" && (
          <div style={{ ...segWrap, marginLeft: "auto" }}>
            {[["idle","Idle"],["loading","Loading"],["error","Error"],["done","Notes"]].map(([k, l]) => (
              <button key={k} style={seg(status === k)} onClick={() => setStatus(k)}>{l}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{
        maxWidth: mob ? 412 : 1500, margin: "0 auto",
        padding: mob ? "22px 18px 60px" : "34px 40px 72px",
        boxSizing: "border-box",
        borderLeft: mob ? "1px solid var(--line)" : 0,
        borderRight: mob ? "1px solid var(--line)" : 0,
        minHeight: "80vh",
      }}>
        {screen === "home" && <Home mob={mob} onWrite={() => setScreen("entry")} />}
        {screen === "entry" && (
          <Entry mob={mob} text={text} setText={setText}
            onSuggest={() => { setScreen("suggest"); setStatus("done"); }}
            onHome={() => setScreen("home")} />
        )}
        {screen === "suggest" && (
          <Suggestion mob={mob} text={text} setText={setText}
            status={status} setStatus={setStatus} onHome={() => setScreen("home")} />
        )}
      </div>
    </div>
  );
}

/* ── COST NOTES ────────────────────────────────────────────────
   CHEAP (pure CSS, no JS):
     • grain overlay (one static SVG data-URI, two opacities)
     • wax spine + margin rule, drop-cap, hairline dividers
     • hatched "backfilled" fill (repeating-linear-gradient)
     • all hover/focus transitions, screen-enter riseIn, suggestion unroll
     • dark mode — one [data-theme] block, no component changes

   MEDIUM:
     • photo tilt + straighten-on-hover: trivial, but a lightbox and real
       drag-and-drop upload are ~half a day
     • loading nib-sweep: 9 animated bars; keep it off-screen-safe by
       unmounting when status !== 'loading' (done above)

   EXPENSIVE — decide if it's worth it:
     • highlight ↔ note linking needs the AI to return CHANGES as an ordered
       token stream (string | index), not a plain rewritten string. If your
       endpoint returns only text, you need a diff on the client and the
       mapping gets fuzzy. Ask for the stream shape server-side.
     • scroll-to-note on highlight click (omitted here on purpose — never use
       scrollIntoView inside the entry column; use a scrollTop offset).
     • foil shimmer on streak milestones: skip in v1.

   TYPING SAFETY: the textarea has no animated ancestors and the grain is a
   fixed background-image, so nothing repaints or re-randomises per keystroke.
   ────────────────────────────────────────────────────────────── */
