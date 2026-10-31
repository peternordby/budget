import type { CSSProperties, ReactNode } from "react";
import styles from "./Aquarium.module.css";

// The Akvarium style's backdrop: light rays from the surface, marine snow,
// bubbles, and the animals swimming past behind the glass cards — a thresher
// shark near and another far off, a school of yellowtail fusiliers, a green
// sea turtle and moon jellies. Rendered always
// (static markup in the root layout) and display: none in every other style,
// which also stops its animations. Everything moves by transform/opacity
// only, and nothing blurs — the same rule as Glass.
//
// The paint is shared: gradients and the fusilier are defined once, in Defs,
// and referenced by id from every sprite. Their colours are CSS variables
// (Aquarium.module.css), so the deep (dark theme) re-lights every animal
// without a second drawing.

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** A gradient stop whose colour is a CSS variable — a stop-color attribute cannot hold var(). */
function Stop({ at, color }: { at: number; color: string }) {
  return <stop offset={at} style={{ stopColor: `var(${color})` }} />;
}

function Defs() {
  return (
    <svg className={styles["defs"]} aria-hidden="true" focusable="false">
      <defs>
        {/* Countershading: a dark back, a sharp line along the flank, a pale belly. */}
        <linearGradient id="aq-shark" x1="0" y1="0" x2="0" y2="1">
          <Stop at={0} color="--aq-shark-back" />
          <Stop at={0.4} color="--aq-shark-flank" />
          <Stop at={0.58} color="--aq-shark-belly" />
          <Stop at={0.85} color="--aq-shark-belly" />
          <Stop at={1} color="--aq-shark-shadow" />
        </linearGradient>
        <linearGradient id="aq-shark-fin" x1="0" y1="0" x2="0" y2="1">
          <Stop at={0} color="--aq-shark-back" />
          <Stop at={1} color="--aq-shark-fin" />
        </linearGradient>
        <linearGradient id="aq-fusilier" x1="0" y1="0" x2="0" y2="1">
          <Stop at={0} color="--aq-fusilier-back" />
          <Stop at={0.45} color="--aq-fusilier-flank" />
          <Stop at={0.62} color="--aq-fusilier-belly" />
          <Stop at={1} color="--aq-fusilier-belly" />
        </linearGradient>
        <radialGradient id="aq-shell" cx="0.45" cy="0.42" r="0.62">
          <Stop at={0} color="--aq-shell-light" />
          <Stop at={1} color="--aq-shell-dark" />
        </radialGradient>
        {/* One per plate (objectBoundingBox): each scute lit in its centre. */}
        <radialGradient id="aq-scute" cx="0.5" cy="0.4" r="0.7">
          <Stop at={0} color="--aq-scute-light" />
          <Stop at={1} color="--aq-shell-light" />
        </radialGradient>
        <linearGradient id="aq-skin" x1="0" y1="0" x2="1" y2="0">
          <Stop at={0} color="--aq-skin-light" />
          <Stop at={1} color="--aq-skin" />
        </linearGradient>
        <radialGradient id="aq-bell" cx="0.5" cy="0.25" r="0.8">
          <Stop at={0} color="--aq-bell" />
          <Stop at={0.7} color="--aq-jelly" />
          <Stop at={1} color="--aq-jelly-rim" />
        </radialGradient>
        {/* Yellowtail fusilier, facing left: blue back, a yellow stripe running into a yellow forked tail. */}
        <symbol id="aq-fusilier-fish" viewBox="0 0 44 18" overflow="visible">
          <path d="M35 9C37 7 39.5 4 43 1.2C42 4.5 41 7 40.4 9C41 11 42 13.5 43 16.8C39.5 14 37 11 35 9Z" className={styles["fusilier-yellow"]} />
          <path d="M13 2.8C17 0.6 22 0.4 27 2.6Z" className={styles["fusilier-yellow"]} />
          <path d="M1 9C3 5 9 2.5 17 2.2C26 2 32 4.5 36 7.3V10.7C32 13.5 26 16 17 15.8C9 15.5 3 13 1 9Z" fill="url(#aq-fusilier)" />
          <path d="M8 5C16 3.6 26 4 36 7.4V8.6C26 5.8 16 5.6 8 6.6Z" className={styles["fusilier-yellow"]} />
          <path d="M10.5 4.8C9.4 7.5 9.4 10.5 10.5 13.2" className={styles["line"]} />
          <path d="M13 10.2C15 11.4 16.6 12.4 19.4 13C17.4 10.9 15.6 10.1 13 10.2Z" className={styles["fin-pale"]} />
          <circle cx="5.8" cy="7.9" r="1.9" className={styles["eye-ring"]} />
          <circle cx="5.8" cy="7.9" r="1.35" className={styles["eye"]} />
          <circle cx="5.4" cy="7.4" r="0.4" className={styles["glint"]} />
        </symbol>
      </defs>
    </svg>
  );
}

/** A pelagic thresher, facing left: short snout, big eye, sickle pectorals, and an upper tail lobe as long as the body. */
function Thresher() {
  return (
    <svg viewBox="0 0 262 100" className={styles["sprite"]}>
      <g className={styles["yaw"]}>
        <path
          className={styles["shark-tail"]}
          d="M151 46C176 40 214 24 257 5.5C259 4.8 260 6.3 258.6 7.4C222 27 190 44 166 52C170 57 174 63 177 70C177.6 71.8 175.8 72.4 174.8 71.2C170 64.5 164 58.5 156 54.5Z"
          fill="url(#aq-shark-fin)"
        />
        <path d="M142 43.5C144 40.5 146 38.5 148.5 37.6C148.8 40.2 149.3 42.4 151.2 45.4Z" fill="url(#aq-shark-fin)" />
        <path d="M143 53C145.5 56 147.5 58 150.5 59.2C150.2 57 150 55 150.4 52.2Z" fill="url(#aq-shark-fin)" />
        <path d="M106 63C110 67 114.5 70 120 72C119.4 68.4 118.6 65.4 117.4 62Z" fill="url(#aq-shark-fin)" />
        <path
          d="M4 52C5 46 12 40 24 37C40 33 62 31 84 32C108 33 132 39 152 45.6L158 48V53.4C140 56 118 62 94 65C70 68 44 68 28 64C16 61 7 57 4 52Z"
          fill="url(#aq-shark)"
        />
        {/* Sunlight along the back, the lateral line, gill slits and the mouth. */}
        <path d="M24 39C50 33 96 32 142 42" className={styles["sheen"]} />
        <path d="M40 50C70 49 110 48 152 49.5" className={styles["line"]} />
        <path d="M44 43C42.6 47.5 42.6 52.5 44 57M47.4 42.6C46 47.3 46 52.7 47.4 57.4M50.8 42.4C49.4 47.2 49.4 52.8 50.8 57.6M54.2 42.4C52.8 47.2 52.8 52.8 54.2 57.6M57.6 42.6C56.2 47.3 56.2 52.7 57.6 57.4" className={styles["gills"]} />
        <path d="M13 58.6C17.5 61 23.5 61 29 58.8" className={styles["gills"]} />
        <path d="M72 33C75 24 79 15 86 9C88 7.8 89.6 8.8 89.6 11C89 18 90.5 26 98.5 34.2Z" fill="url(#aq-shark-fin)" />
        <path
          className={styles["shark-pectoral"]}
          d="M50 61.5C56 72 64 84 76.5 96C78.6 97.8 80.6 96.6 79.4 94.4C74 84 70.4 74 68.4 63Z"
          fill="url(#aq-shark-fin)"
        />
        <circle cx="25.5" cy="46" r="3.8" className={styles["eye"]} />
        <circle cx="24.3" cy="44.8" r="1.1" className={styles["glint"]} />
      </g>
    </svg>
  );
}

// A loose school: offsets and sizes varied by hand so it never reads as a grid.
const SCHOOL: [x: number, y: number, scale: number][] = [
  [0, 22, 1], [20, 6, 0.92], [26, 36, 0.96], [48, 18, 1.05], [52, 48, 0.9], [70, 2, 0.88], [76, 30, 1],
  [98, 14, 0.95], [100, 44, 1.02], [122, 26, 0.9], [128, 54, 0.86], [146, 8, 0.94], [152, 38, 0.98], [172, 22, 0.88],
];

function School() {
  return (
    <svg viewBox="0 0 220 76" className={styles["sprite"]}>
      {SCHOOL.map(([x, y, scale], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
          <g className={styles["drift"]} style={{ "--delay": `${-i * 0.73}s` } as Vars}>
            <use href="#aq-fusilier-fish" width="44" height="18" className={styles["wiggle"]} style={{ "--delay": `${-i * 0.29}s` } as Vars} />
          </g>
        </g>
      ))}
    </svg>
  );
}

// The shell's plates, drawn top-down. The vertebrals run down the spine (the
// front one widest, the last smallest); the costals fan out on the upper side
// to the rim, and are mirrored across the spine (y → 140 − y) for the lower.
const VERTEBRALS: [cx: number, half: number, top: number, bottom: number][] = [
  [70, 10, 58, 82], [91, 11, 57, 83], [112, 10, 57.5, 82.5], [132, 10, 58.5, 81.5], [150, 8, 60.5, 79.5],
];
const COSTALS = [
  "58 64 64 51 72 42 78 59 66 64",
  "72 42 84 38.5 96 36.5 99 58 78 59",
  "96 36.5 108 35.5 121 36 118 58.5 99 58",
  "121 36 134 38.5 145 43 138 60 118 58.5",
  "145 43 154 50 160 62 150 66 138 60",
];
const mirrored = (points: string) =>
  points.split(" ").map((v, i) => (i % 2 ? String(140 - Number(v)) : v)).join(" ");

/**
 * A green sea turtle seen from above and a little behind — drawn top-down, then
 * squashed to an oblique view — so the shell's plates and all four flippers
 * show. Facing left; the front flippers beat together, as a turtle's do.
 */
function Turtle() {
  return (
    <svg viewBox="0 0 200 120" className={styles["sprite"]}>
      <g transform="matrix(1 0 0 0.74 0 8)">
        <path className={`${styles["flipper"]} ${styles["front-top"]}`} d="M68 46C60 34 48 20 28 9C24 7 20 8.6 22.4 12.6C32 24 48 36 60 52Z" fill="url(#aq-skin)" />
        <path className={`${styles["flipper"]} ${styles["front-bottom"]}`} d="M68 94C60 106 48 120 28 131C24 133 20 131.4 22.4 127.4C32 116 48 104 60 88Z" fill="url(#aq-skin)" />
        <path className={`${styles["flipper"]} ${styles["rear-top"]}`} d="M146 50C154 42 164 37 176 36C178 36.4 178 38.4 176.4 39.6C168 45 160 50 154 56Z" fill="url(#aq-skin)" />
        <path className={`${styles["flipper"]} ${styles["rear-bottom"]}`} d="M146 90C154 98 164 103 176 104C178 103.6 178 101.6 176.4 100.4C168 95 160 90 154 84Z" fill="url(#aq-skin)" />
        {/* Scales on the flippers: a dashed seam along each leading edge. */}
        <path d="M60 46C52 36 42 26 30 14M60 94C52 104 42 114 30 126" className={styles["scales"]} />
        <path d="M167 66L182 70L167 74Z" fill="url(#aq-skin)" />
        <path d="M54 62C46 60 36 58 26 60C18 61.6 13 65 13 70C13 75 18 78.4 26 80C36 82 46 80 54 78Z" fill="url(#aq-skin)" />
        <path d="M21 66L28 62.6L35 65.4L29 70ZM21 74L28 77.4L35 74.6L29 70ZM35 65.4L42 63L44 70L35 74.6L29 70Z" className={styles["head-scales"]} />
        <ellipse cx="24" cy="62.2" rx="2.4" ry="1.5" className={styles["eye"]} />
        <ellipse cx="24" cy="77.8" rx="2.4" ry="1.5" className={styles["eye"]} />
        <path d="M50 70C50 46 78 32 110 32C140 32 160 46 168 62C171 68 171 72 168 78C160 94 140 108 110 108C78 108 50 94 50 70Z" fill="url(#aq-shell)" />
        {/* The marginal rim, then each plate lit in its own centre — the
            tortoiseshell look — with dark seams between. */}
        <path d="M57 70C57 51 81 39 110 39C136 39 153 51 160 64M57 70C57 89 81 101 110 101C136 101 153 89 160 76" className={styles["seams"]} />
        {COSTALS.flatMap((points) => [points, mirrored(points)]).map((points) => (
          <polygon key={points} points={points} fill="url(#aq-scute)" className={styles["seams"]} />
        ))}
        {VERTEBRALS.map(([cx, half, top, bottom]) => (
          <path key={cx} d={`M${cx - half} 70L${cx - half + 4} ${top}H${cx + half - 4}L${cx + half} 70L${cx + half - 4} ${bottom}H${cx - half + 4}Z`} fill="url(#aq-scute)" className={styles["seams"]} />
        ))}
        <path d="M64 50C76 40 94 35 112 35" className={styles["sheen"]} />
      </g>
    </svg>
  );
}

/** A moon jelly: a scalloped glass bell, the four-leaf clover of gonad rings, a fringe of fine tentacles and frilled oral arms. */
function Jelly() {
  const fringe = Array.from({ length: 17 }, (_, i) => 8 + i * 4);
  return (
    <svg viewBox="0 0 80 170" className={styles["sprite"]}>
      <g className={styles["jelly-pulse"]}>
        <g className={styles["tentacles"]}>
          {fringe.map((x, i) => (
            <path key={x} d={`M${x} 42c${i % 2 ? 2 : -2} 10 ${i % 2 ? -2 : 2} 20 0 ${26 + (i % 3) * 7}`} />
          ))}
        </g>
        <g className={styles["arms"]}>
          <path d="M34 38C28 60 40 76 31 100C27 112 33 124 29 140" />
          <path d="M46 38C52 60 40 78 49 102C53 114 47 126 51 146" />
          <path d="M40 40C38 64 44 84 39 110C37 122 41 132 39 150" />
        </g>
        <path d="M6 40C6 18 24 6 40 6C56 6 74 18 74 40C68 38 64 44 58 42C52 46 46 42 40 44C34 42 28 46 22 42C16 44 12 38 6 40Z" fill="url(#aq-bell)" className={styles["bell-rim"]} />
        <g className={styles["gonads"]}>
          {/* Splayed into an X, the way the four horseshoes sit in the bell. */}
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => (
            <ellipse key={`${dx}${dy}`} cx={40 + dx * 5.4} cy={23 + dy * 3.4} rx="4.6" ry="2.4" transform={`rotate(${dx * dy * 32} ${40 + dx * 5.4} ${23 + dy * 3.4})`} />
          ))}
        </g>
        <path d="M16 22C22 12 32 9 40 9" className={styles["sheen"]} />
      </g>
    </svg>
  );
}

const RAYS = [8, 22, 41, 58, 77];
const BUBBLES = [
  [6, 7, 18, -2], [14, 4, 24, -14], [31, 9, 21, -6], [47, 5, 27, -19],
  [63, 8, 19, -9], [72, 4, 25, -3], [86, 10, 22, -16], [93, 6, 28, -11],
];

function Swimmer({ children, className = "", style }: { children: ReactNode; className?: string; style: Vars }) {
  return (
    <div className={`${styles["swim"]} ${className}`} style={style}>
      <div className={styles["bob"]}>{children}</div>
    </div>
  );
}

export default function Aquarium() {
  return (
    <div className={styles["aquarium"]}>
      <Defs />
      <div className={styles["glow"]} />
      {RAYS.map((x, i) => (
        <span key={x} className={styles["ray"]} style={{ "--x": `${x}%`, "--delay": `${-i * 2.3}s` } as Vars} />
      ))}
      <div className={styles["snow"]} />

      {/* Far away first, so the near ones swim in front. */}
      <Swimmer className={`${styles["ltr"]} ${styles["distant"]}`} style={{ "--y": "60vh", "--dy": "3vh", "--dur": "140s", "--delay": "-90s", "--size": "clamp(140px, 16vw, 230px)" }}>
        <div className={styles["flip"]}><Thresher /></div>
      </Swimmer>
      <Swimmer className={styles["rise"]} style={{ "--x": "78vw", "--dur": "75s", "--delay": "-30s", "--size": "clamp(40px, 4.5vw, 64px)" }}>
        <Jelly />
      </Swimmer>
      <Swimmer className={`${styles["rise"]} ${styles["distant"]}`} style={{ "--x": "14vw", "--dur": "95s", "--delay": "-70s", "--size": "clamp(28px, 3.2vw, 46px)" }}>
        <Jelly />
      </Swimmer>
      <Swimmer className={styles["ltr"]} style={{ "--y": "68vh", "--dy": "-6vh", "--dur": "110s", "--delay": "-25s", "--size": "clamp(130px, 13vw, 190px)" }}>
        <div className={styles["flip"]}><Turtle /></div>
      </Swimmer>
      <Swimmer style={{ "--y": "20vh", "--dy": "5vh", "--dur": "55s", "--delay": "-12s", "--size": "clamp(160px, 17vw, 250px)" }}>
        <School />
      </Swimmer>
      <Swimmer className={styles["near"]} style={{ "--y": "36vh", "--dy": "-3vh", "--dur": "80s", "--delay": "-34s", "--size": "clamp(260px, 40vw, 580px)" }}>
        <Thresher />
      </Swimmer>

      {BUBBLES.map(([x, s, d, delay]) => (
        <span key={x} className={styles["bubble"]} style={{ "--x": `${x}%`, "--s": `${s}px`, "--dur": `${d}s`, "--delay": `${delay}s` } as Vars} />
      ))}
    </div>
  );
}
