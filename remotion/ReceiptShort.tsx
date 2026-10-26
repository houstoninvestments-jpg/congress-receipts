import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ReceiptProps, Side } from "./props";
import type { Beat, BeatId } from "../src/render/timeline";
import { C, fontFamily } from "./theme";
import { CAPTIONS, CARD, FOOTER_Y, HEAD, RESULT } from "./layout";

const pad3 = (n: number) => String(n).padStart(3, "0");
const pct = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}%`);
const pts = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)} pts`);

const Rise: React.FC<{ local: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ local, children, style }) => {
  const { fps } = useVideoConfig();
  const s = spring({ frame: local, fps, config: { damping: 200 }, durationInFrames: 9 });
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * 20}px)`, ...style }}>{children}</div>;
};

const Row: React.FC<{ k: string; v: string; big?: boolean }> = ({ k, v, big }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 24, padding: "13px 0", borderBottom: `2px dashed #CFCABD` }}>
    <div style={{ fontSize: 30, fontWeight: 600, color: C.paperDim, whiteSpace: "nowrap" }}>{k}</div>
    <div style={{ fontSize: big ? 44 : 36, fontWeight: 800, color: C.paperInk, textAlign: "right", lineHeight: 1.15 }}>{v}</div>
  </div>
);

const Bar: React.FC<{ label: string; value: number | null; max: number; grow: number; strong?: boolean }> = ({ label, value, max, grow, strong }) => {
  const w = value === null ? 0 : Math.max(0.04, Math.abs(value) / max) * grow;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, height: 104 }}>
      <div style={{ width: 230, fontSize: 38, fontWeight: 800, color: C.ink, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 64, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${w * 100}%`, background: strong ? C.gold : "#8A8F98", borderRadius: 10 }} />
      </div>
      <div style={{ width: 250, textAlign: "right", fontSize: 64, fontWeight: 900, color: strong ? C.gold : C.ink, fontVariantNumeric: "tabular-nums" }}>{pct(value)}</div>
    </div>
  );
};

const SideBox: React.FC<{ name: string; s: Side }> = ({ name, s }) => (
  <div style={{ flex: 1, border: `4px solid ${C.ink}`, borderRadius: 28, padding: "34px 26px", textAlign: "center" }}>
    <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: 1 }}>{name}</div>
    <div style={{ fontSize: 150, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{s.receipts}</div>
    <div style={{ fontSize: 32, fontWeight: 700, color: C.dim }}>receipts</div>
    <div style={{ marginTop: 26, fontSize: 30, fontWeight: 700, color: C.dim }}>average vs S&P 500</div>
    <div style={{ fontSize: 64, fontWeight: 900, color: C.gold, fontVariantNumeric: "tabular-nums" }}>{pts(s.avgVsMarket)}</div>
  </div>
);

export const ReceiptShort: React.FC<ReceiptProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { beats, captions } = p.timeline;
  const get = (id: BeatId) => beats.find((b) => b.id === id)!;
  const beat: Beat | undefined = beats.find((b) => frame >= b.from && frame < b.to);
  const local = beat ? frame - beat.from : 0;
  const receipt = get("receipt");
  const result = get("result");
  const stamp = get("stamp");
  const board = get("scoreboard");
  const onBoard = frame >= board.from;
  // The card is up from frame 0 (the cover, so the thumbnail shows the filing) until the scoreboard.
  const cardOn = !onBoard;
  const cover = frame < get("hook").to;
  const resultOn = frame >= result.from && !onBoard;
  const stampOn = frame >= stamp.from && !onBoard;
  const stampIn = spring({ frame: frame - stamp.from, fps, config: { damping: 12, stiffness: 170, mass: 0.6 } });
  const caption = captions.find((c) => frame >= c.from && frame < c.to);
  const max = Math.max(1, Math.abs(p.result.stockPct ?? 0), Math.abs(p.result.marketPct ?? 0));
  const grow = interpolate(frame, [result.from, result.from + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily, color: C.ink }}>
      {/* top row, constant */}
      <div style={{ position: "absolute", top: 70, left: 64, right: 64, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 4 }}>
          CONGRESS <span style={{ color: C.gold }}>RECEIPTS</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {p.testLabel ? <div style={{ fontSize: 24, color: "#111", background: C.gold, fontWeight: 800, borderRadius: 8, padding: "4px 12px" }}>{p.testLabel}</div> : null}
          <div style={{ fontSize: 24, fontWeight: 600, border: `2px solid ${C.faint}`, borderRadius: 40, padding: "6px 16px", color: C.dim }}>{p.voiceLabel}</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 136, left: 0, right: 0, textAlign: "center", fontSize: 40, fontWeight: 900, letterSpacing: 6, color: C.dim }}>
        RECEIPT No. {pad3(p.number)}
      </div>

      {/* headline zone: hook, then the stamp */}
      <div style={{ position: "absolute", left: HEAD.x, top: HEAD.y, width: HEAD.w, height: HEAD.h, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        {cover ? (
          <div style={{ fontSize: p.hook.length > 70 ? 50 : 58, fontWeight: 900, lineHeight: 1.08, letterSpacing: -1 }}>{p.hook}</div>
        ) : null}
        {beat?.id === "receipt" || beat?.id === "read" ? <Rise local={frame - receipt.from}><div style={{ fontSize: 44, fontWeight: 900, letterSpacing: 5, color: C.gold }}>THE RECEIPT</div></Rise> : null}
        {beat?.id === "result" ? <Rise local={local}><div style={{ fontSize: 44, fontWeight: 900, letterSpacing: 5, color: C.gold }}>WHAT HAPPENED NEXT</div></Rise> : null}
        {stampOn ? (
          <div
            style={{
              transform: `rotate(-6deg) scale(${interpolate(stampIn, [0, 1], [2.2, 1])})`,
              opacity: Math.min(1, stampIn * 1.5),
              border: `12px solid ${C.gold}`,
              borderRadius: 26,
              color: C.gold,
              fontSize: p.stamp.length > 14 ? 84 : 104,
              fontWeight: 900,
              letterSpacing: 4,
              padding: "6px 34px",
              whiteSpace: "nowrap",
            }}
          >
            {p.stamp}
          </div>
        ) : null}
      </div>

      {/* the filing card */}
      {cardOn ? (
        <div
          style={{
            position: "absolute",
            left: CARD.x,
            top: CARD.y,
            width: CARD.w,
            height: CARD.h,
            background: C.paper,
            borderRadius: 18,
            padding: "30px 44px",
            boxSizing: "border-box",
            boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `4px solid ${C.paperInk}`, paddingBottom: 14 }}>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 2, color: C.paperInk }}>PERIODIC TRANSACTION REPORT</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#111", background: C.gold, borderRadius: 8, padding: "4px 12px", whiteSpace: "nowrap" }}>From official filing</div>
          </div>
          <Row k="Member" v={p.card.member} big />
          <Row k="Party, state" v={p.card.partyState} />
          <Row k="Stock" v={p.card.stock} />
          <Row k="Owner" v={p.card.owner} />
          <Row k="Amount (range)" v={p.card.amount} />
          <Row k="Trade date" v={p.card.tradeDate} />
          <Row k="Filed" v={p.card.filedDate} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 600, color: C.paperDim, paddingTop: 12 }}>
            <span>U.S. House Clerk · Filing ID {p.card.filingId}</span>
            <span>{p.card.late}</span>
          </div>
        </div>
      ) : null}

      {/* result: stock vs S&P 500 */}
      {resultOn ? (
        <div style={{ position: "absolute", left: RESULT.x, top: RESULT.y, width: RESULT.w, height: RESULT.h }}>
          {p.result.pending ? (
            <div style={{ height: "100%", border: `4px dashed ${C.faint}`, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 40, fontWeight: 800, color: C.dim, padding: 30 }}>
              Price check pending: waiting on a licensed price source
            </div>
          ) : (
            <>
              <Bar label={p.result.stockLabel} value={p.result.stockPct} max={max} grow={grow} strong />
              <Bar label="S&P 500" value={p.result.marketPct} max={max} grow={grow} />
              <div style={{ fontSize: 26, fontWeight: 600, color: C.dim, marginTop: 8 }}>{p.result.window}</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: C.faint }}>{p.result.source}</div>
            </>
          )}
        </div>
      ) : null}

      {/* scoreboard: the last 3 seconds */}
      {onBoard ? (
        <div style={{ position: "absolute", left: 70, right: 70, top: 470, display: "flex", flexDirection: "column", gap: 34 }}>
          <Rise local={frame - board.from}>
            <div style={{ textAlign: "center", fontSize: 50, fontWeight: 900, letterSpacing: 3 }}>SCOREBOARD {p.scoreboard.year}</div>
            <div style={{ textAlign: "center", fontSize: 28, fontWeight: 600, color: C.dim, marginTop: 6 }}>Receipts so far this year, measured on each video's date</div>
          </Rise>
          <div style={{ display: "flex", gap: 30 }}>
            <SideBox name="DEMOCRATS" s={p.scoreboard.dem} />
            <SideBox name="REPUBLICANS" s={p.scoreboard.rep} />
          </div>
          {/* "Topic: question" breaks after the colon, so no word is left alone on a line. */}
          <div style={{ textAlign: "center", fontSize: 70, fontWeight: 900, marginTop: 20, lineHeight: 1.12 }}>
            {p.closer.split(/(?<=:)\s+/).map((part, i) => (
              <div key={i} style={{ color: i === 0 && p.closer.includes(":") ? C.dim : C.ink, fontSize: i === 0 && p.closer.includes(":") ? 52 : 70 }}>{part}</div>
            ))}
          </div>
          {p.cta !== "none" ? (
            <div style={{ textAlign: "center", fontSize: p.cta === "direct" ? 38 : 32, fontWeight: 700, color: p.cta === "direct" ? C.ink : C.dim }}>
              {p.cta === "direct" ? "See the filing and the math: link on our channel." : "Every receipt is on our site."}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* captions */}
      {caption && !onBoard ? (
        <div style={{ position: "absolute", left: CAPTIONS.x, top: CAPTIONS.y, width: CAPTIONS.w, textAlign: "center" }}>
          <span style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.2, background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "4px 16px", WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }}>
            {caption.text}
          </span>
        </div>
      ) : null}

      {/* footer, constant */}
      <div style={{ position: "absolute", top: FOOTER_Y, left: 0, right: 0, textAlign: "center", fontSize: 28, fontWeight: 700, color: C.dim }}>{p.notAdvice}</div>

      {beats
        .filter((b) => b.audio)
        .map((b) => (
          <Sequence key={b.id} from={b.from} durationInFrames={b.to - b.from}>
            <Audio src={staticFile(b.audio!)} />
          </Sequence>
        ))}
      <Sequence from={stamp.from} durationInFrames={20}>
        <Audio src={staticFile("stamp.wav")} volume={0.7} />
      </Sequence>
    </AbsoluteFill>
  );
};
