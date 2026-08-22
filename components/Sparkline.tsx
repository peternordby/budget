import styles from "./Sparkline.module.css";

type SparklineProps = {
  points: number[];
  ariaLabel: string;
};

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 32;
const MIDPOINT = VIEW_HEIGHT / 2;
// The stroke is centred on the path, so plotting the extremes at y=0 and
// y=VIEW_HEIGHT clipped half of it against the viewBox edge — visible as a
// flat-topped peak on every tile whose series had a clear maximum.
const INSET = 2;

export default function Sparkline({ points, ariaLabel }: SparklineProps) {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return (
      <svg
        className={styles["sparkline"]}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          className={styles["sparkline-dot"]}
          cx={VIEW_WIDTH / 2}
          cy={MIDPOINT}
          r={2}
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;

  const coords = points.map((value, i) => {
    const x = (i / (points.length - 1)) * VIEW_WIDTH;
    const y =
      range === 0
        ? MIDPOINT
        : VIEW_HEIGHT - INSET - ((value - min) / range) * (VIEW_HEIGHT - INSET * 2);
    return `${x},${y}`;
  });

  return (
    <svg
      className={styles["sparkline"]}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <polyline className={styles["sparkline-line"]} points={coords.join(" ")} />
    </svg>
  );
}
