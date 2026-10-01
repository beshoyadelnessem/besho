import { Video } from "@remotion/media";
import { loadFont } from "@remotion/fonts";
import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// Fonts are bundled in public/fonts so rendering works offline.
const mono = "CncMono";
const display = "CncDisplay";
loadFont({ family: mono, url: staticFile("fonts/DejaVuSansMono.ttf"), weight: "400" });
loadFont({ family: mono, url: staticFile("fonts/DejaVuSansMono-Bold.ttf"), weight: "700" });
loadFont({ family: display, url: staticFile("fonts/LiberationSans-Bold.ttf"), weight: "700" });

const CYAN = "#5fe3ff";
const AMBER = "#ffb547";
const BLUEPRINT = "#0b2a4a";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

const SECTIONS = [
  { from: 0, label: "01", title: "PLUNGE" },
  { from: 198, label: "02", title: "CONTOUR" },
  { from: 396, label: "03", title: "FINISH" },
];

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

// Footage: stabilized + graded clip with a slow push-in.
const Footage: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        scale: interpolate(frame, [0, durationInFrames], [1.02, 1.1], clamp),
      }}
    >
      <Video
        src={staticFile("cnc-stabilized.mp4")}
        objectFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
};

const Grid: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [30, 70], [0, 0.22], clamp);
  return (
    <AbsoluteFill
      style={{
        opacity,
        mixBlendMode: "screen",
        backgroundImage: `linear-gradient(${CYAN}55 1px, transparent 1px), linear-gradient(90deg, ${CYAN}55 1px, transparent 1px), linear-gradient(${CYAN}22 1px, transparent 1px), linear-gradient(90deg, ${CYAN}22 1px, transparent 1px)`,
        backgroundSize: "120px 120px, 120px 120px, 24px 24px, 24px 24px",
        backgroundPosition: `0 ${-frame * 0.4}px, 0 0, 0 ${-frame * 0.4}px, 0 0`,
      }}
    />
  );
};

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(ellipse at center, transparent 45%, rgba(3,12,24,0.75) 100%)",
    }}
  />
);

// Viewfinder corner brackets that snap in.
const Brackets: React.FC = () => {
  const frame = useCurrentFrame();
  const inset = interpolate(frame, [20, 50], [140, 56], {
    ...clamp,
    easing: easeOut,
  });
  const opacity = interpolate(frame, [20, 35], [0, 1], clamp);
  const size = 90;
  const stroke = 5;
  const corner = (top: boolean, left: boolean): React.CSSProperties => ({
    position: "absolute",
    width: size,
    height: size,
    [top ? "top" : "bottom"]: inset + 110,
    [left ? "left" : "right"]: inset,
    [top ? "borderTop" : "borderBottom"]: `${stroke}px solid ${CYAN}`,
    [left ? "borderLeft" : "borderRight"]: `${stroke}px solid ${CYAN}`,
    opacity,
    filter: `drop-shadow(0 0 8px ${CYAN})`,
  });
  return (
    <AbsoluteFill>
      <div style={corner(true, true)} />
      <div style={corner(true, false)} />
      <div style={corner(false, true)} />
      <div style={corner(false, false)} />
    </AbsoluteFill>
  );
};

// Top status bar: REC + timecode + frame counter (real values).
const TopBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const secs = Math.floor(frame / fps);
  const tc = `00:00:${pad(secs)}:${pad(frame % fps)}`;
  const opacity = interpolate(frame, [40, 60], [0, 1], clamp);
  const blink = Math.floor(frame / 15) % 2 === 0 ? 1 : 0.25;
  return (
    <div
      style={{
        position: "absolute",
        top: 70,
        left: 60,
        right: 60,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: mono,
        fontSize: 34,
        color: "white",
        letterSpacing: 2,
        opacity,
        textShadow: "0 2px 12px rgba(0,0,0,0.8)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: "#ff3b3b",
            opacity: blink,
          }}
        />
        REC {tc}
      </div>
      <div style={{ color: CYAN }}>
        FRM {pad(frame, 4)}/{pad(durationInFrames, 4)}
      </div>
    </div>
  );
};

// Bottom ruler that scrolls with time + progress fill.
const Ruler: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [40, 60], [0, 1], clamp);
  const progress = frame / (durationInFrames - 1);
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const offset = (frame * 3) % 40;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        bottom: 80,
        height: 80,
        opacity,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          translate: `${-offset}px 0`,
        }}
      >
        {ticks.map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: i * 20,
              bottom: 16,
              width: 2,
              height: i % 10 === 0 ? 40 : i % 5 === 0 ? 26 : 14,
              background: i % 10 === 0 ? CYAN : "rgba(255,255,255,0.6)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          background: "rgba(255,255,255,0.15)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 6,
          width: `${progress * 100}%`,
          background: AMBER,
          boxShadow: `0 0 14px ${AMBER}`,
        }}
      />
    </div>
  );
};

// Section label: "02 / CONTOUR" with a drawn underline.
const SectionLabel: React.FC<{ label: string; title: string }> = ({
  label,
  title,
}) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 18], [-80, 0], { ...clamp, easing: easeOut });
  const opacity = interpolate(frame, [0, 10, 160, 190], [0, 1, 1, 0], clamp);
  const line = interpolate(frame, [6, 30], [0, 360], {
    ...clamp,
    easing: easeOut,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        top: 260,
        opacity,
        translate: `${x}px 0`,
        textShadow: "0 3px 18px rgba(0,0,0,0.85)",
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 30, color: AMBER, letterSpacing: 6 }}>
        OP {label} //
      </div>
      <div
        style={{
          fontFamily: display,
          fontWeight: 700,
          fontSize: 110,
          color: "white",
          letterSpacing: 8,
          lineHeight: 1,
          marginTop: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 14,
          width: line,
          height: 4,
          background: CYAN,
          boxShadow: `0 0 12px ${CYAN}`,
        }}
      />
    </div>
  );
};

// Horizontal scan line sweep used at section changes.
const Scan: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const y = interpolate(frame, [0, 14], [-40, height + 40], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });
  const flash = interpolate(frame, [0, 3, 12], [0, 0.25, 0], clamp);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: CYAN, opacity: flash, mixBlendMode: "screen" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y,
          height: 4,
          background: CYAN,
          boxShadow: `0 0 30px 10px ${CYAN}88`,
        }}
      />
    </AbsoluteFill>
  );
};

// Intro: blueprint panel with title, wipes up to reveal footage.
const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const wipe = interpolate(frame, [48, 70], [0, -height], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const titleOpacity = interpolate(frame, [6, 20], [0, 1], clamp);
  const spacing = interpolate(frame, [6, 40], [40, 14], { ...clamp, easing: easeOut });
  const draw = interpolate(frame, [0, 30], [0, 1], { ...clamp, easing: easeOut });
  const cx = width / 2;
  const cy = height / 2;
  return (
    <AbsoluteFill style={{ translate: `0 ${wipe}px` }}>
      <AbsoluteFill
        style={{
          background: BLUEPRINT,
          backgroundImage: `linear-gradient(${CYAN}33 1px, transparent 1px), linear-gradient(90deg, ${CYAN}33 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      <svg width={width} height={height} style={{ position: "absolute" }}>
        <circle
          cx={cx}
          cy={cy - 40}
          r={300}
          fill="none"
          stroke={CYAN}
          strokeWidth={3}
          strokeDasharray={2 * Math.PI * 300}
          strokeDashoffset={2 * Math.PI * 300 * (1 - draw)}
          opacity={0.7}
        />
        <line x1={cx - 420 * draw} y1={cy - 40} x2={cx + 420 * draw} y2={cy - 40} stroke={CYAN} strokeWidth={2} opacity={0.5} />
        <line x1={cx} y1={cy - 40 - 420 * draw} x2={cx} y2={cy - 40 + 420 * draw} stroke={CYAN} strokeWidth={2} opacity={0.5} />
      </svg>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: titleOpacity,
          translate: "0 -40px",
        }}
      >
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 150,
            color: "white",
            letterSpacing: spacing,
            background: BLUEPRINT,
            padding: "0 30px",
          }}
        >
          CNC
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 38,
            color: CYAN,
            letterSpacing: 10,
            marginTop: 10,
            background: BLUEPRINT,
            padding: "0 20px",
          }}
        >
          PRECISION ROUTING
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Outro: darken + end card.
const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const bg = interpolate(frame, [0, 25], [0, 0.82], clamp);
  const o = interpolate(frame, [10, 28], [0, 1], clamp);
  const s = interpolate(frame, [10, 40], [1.15, 1], {
    ...clamp,
    easing: easeOut,
  });
  const line = interpolate(frame, [18, 45], [0, 520], { ...clamp, easing: easeOut });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: BLUEPRINT, opacity: bg }} />
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", opacity: o, scale: s }}
      >
        <div style={{ fontFamily: mono, fontSize: 34, color: AMBER, letterSpacing: 8 }}>
          JOB STATUS
        </div>
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 140,
            color: "white",
            letterSpacing: 12,
          }}
        >
          COMPLETE
        </div>
        <div
          style={{
            width: line,
            height: 5,
            background: CYAN,
            boxShadow: `0 0 16px ${CYAN}`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const CncEdit: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const outroLen = 60;
  return (
    <AbsoluteFill style={{ background: "black" }}>
      <Footage />
      <Grid />
      <Vignette />
      <Brackets />
      <TopBar />
      <Ruler />
      <Sequence from={80} durationInFrames={118} premountFor={fps} name="Label 01">
        <SectionLabel label={SECTIONS[0].label} title={SECTIONS[0].title} />
      </Sequence>
      <Sequence from={SECTIONS[1].from} durationInFrames={190} premountFor={fps} name="Label 02">
        <SectionLabel label={SECTIONS[1].label} title={SECTIONS[1].title} />
      </Sequence>
      <Sequence from={SECTIONS[2].from} durationInFrames={durationInFrames - outroLen - SECTIONS[2].from} premountFor={fps} name="Label 03">
        <SectionLabel label={SECTIONS[2].label} title={SECTIONS[2].title} />
      </Sequence>
      <Sequence from={SECTIONS[1].from} durationInFrames={16} premountFor={fps} name="Scan 02">
        <Scan />
      </Sequence>
      <Sequence from={SECTIONS[2].from} durationInFrames={16} premountFor={fps} name="Scan 03">
        <Scan />
      </Sequence>
      <Sequence from={durationInFrames - outroLen} premountFor={fps} name="Outro">
        <Outro />
      </Sequence>
      <Sequence durationInFrames={72} name="Intro">
        <Intro />
      </Sequence>
    </AbsoluteFill>
  );
};
