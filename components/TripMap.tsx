"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoBounds, geoContains, geoMercator, geoPath } from "d3-geo";
import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { useReducedMotionConfig } from "motion/react";
import { feature } from "topojson-client";
import type { Feature, MultiPoint } from "geojson";
import {
  ChartTooltip,
  bandLayout,
  barCorner,
  scaleLinear,
  useMeasure,
  type TooltipRow,
} from "@/components/charts";
import { IconMinus, IconPlus } from "@/components/icons";
import { T_BASE } from "@/lib/motion";
import { formatCurrency } from "@/lib/format";
import { shortDate } from "@/lib/periodStats";
import { mapStops, stayLabel, type Stop, type TagSummary } from "@/lib/tags";
import styles from "./TripMap.module.css";

type Country = Feature;

// Natural Earth 1:50m (~230KB gzipped), fetched the first time a map is drawn
// and kept for the session. 1:110m was a sixth of that but had no Mallorca, Ko
// Samui or most other holiday islands — the places a trip map is mostly of.
// 1:10m is five times 1:50m again, for detail nobody zooms far enough to see.
let atlas: Promise<Country[]> | null = null;
function loadCountries() {
  atlas ??= import("world-atlas/countries-50m.json").then(
    ({ default: topology }: any) => (feature(topology, topology.objects.countries) as any).features
  );
  return atlas;
}

const bounds = new WeakMap<Country, [[number, number], [number, number]]>();
function boundsOf(country: Country) {
  let value = bounds.get(country);
  if (!value) bounds.set(country, (value = geoBounds(country)));
  return value;
}

function useCountries() {
  const [countries, setCountries] = useState<Country[] | null>(null);
  useEffect(() => {
    let live = true;
    loadCountries().then((rows) => live && setCountries(rows));
    return () => {
      live = false;
    };
  }, []);
  return countries;
}

const MINI_W = 112;
const MINI_H = 72;

/**
 * A thumbnail that answers "is this the right place?" for a search hit: a
 * country by its own outline, a city as a dot with a few hundred kilometres of
 * neighbourhood around it, its country shaded — enough to tell Roma in Lazio
 * from Roma in Texas at a glance.
 */
export function MiniMap({ lon, lat, country }: { lon: number; lat: number; country: boolean }) {
  const countries = useCountries();
  const drawing = useMemo(() => {
    if (!countries) return null;
    const home = countries.find((row) => geoContains(row, [lon, lat]));
    const [[x0, y0], [x1, y1]] =
      country && home && geoBounds(home)[0][0] <= geoBounds(home)[1][0]
        ? geoBounds(home)
        : [
            [lon - 10, lat - 6],
            [lon + 10, lat + 6],
          ];
    const box: MultiPoint = {
      type: "MultiPoint",
      coordinates: [
        [x0, Math.max(-75, y0)],
        [x1, Math.min(80, y1)],
      ],
    };
    const projection = geoMercator().fitExtent(
      [
        [4, 4],
        [MINI_W - 4, MINI_H - 4],
      ],
      box
    );
    const path = geoPath(projection);
    // Six thumbnails at once: draw only the countries that reach the box, not
    // all 240 at 1:50m. A box across the antimeridian keeps them all.
    const near = (row: Country) => {
      const [[a0, b0], [a1, b1]] = boundsOf(row);
      return a0 > a1 || (a0 <= x1 + 5 && a1 >= x0 - 5 && b0 <= y1 + 5 && b1 >= y0 - 5);
    };
    return {
      paths: countries.filter(near).map((row) => ({ d: path(row) ?? "", home: row === home })),
      dot: projection([lon, lat]),
    };
  }, [countries, lon, lat, country]);

  return (
    <svg className={styles["mini"]} width={MINI_W} height={MINI_H} aria-hidden="true">
      {drawing?.paths.map((row, index) =>
        row.d ? (
          <path key={index} d={row.d} className={row.home ? styles["visited"] : styles["land"]} />
        ) : null
      )}
      {drawing?.dot && !country ? (
        <circle cx={drawing.dot[0]} cy={drawing.dot[1]} r={4} className={styles["mini-dot"]} />
      ) : null}
    </svg>
  );
}

/** A stop's colour: its slot, or a neutral for the days no stop holds. */
export type StopColor = (stop: Stop) => string;

function stopName(stop: Stop) {
  return stop.place?.name ?? "Uten sted";
}

/** One dot on the map. Points sharing `route` are joined in the order given;
 *  `group` is what a hover highlights (a stop, or a whole trip). */
export type MapPoint = {
  key: string;
  group: string;
  route: string | null;
  lon: number;
  lat: number;
  /** Next to the dot; also its accessible name, with `ariaLabel`. */
  label: string;
  /** The dot's area follows this. */
  value: number;
  color: string;
  title: string;
  rows: TooltipRow[];
  ariaLabel: string;
};

const ZOOM_STEP = 1.6;

/**
 * Places on a map: every country one of them is in shaded, each place a dot
 * sized by what was spent there, each route drawn great-circle in order.
 * Mercator, fitted to the points with a margin, then zoomable and pannable:
 * drag, pinch or ⌘/Ctrl-scroll (a bare wheel scrolls the page, not the map),
 * the +/−/reset buttons, or a click on a dot. Dots and labels are drawn in
 * screen space so they keep their size while the countries scale.
 *
 * `active` is lifted, so the timeline and the table can light up the same
 * stop the map does.
 */
export function TripMap({
  points,
  active,
  onActive,
}: {
  points: MapPoint[];
  active: string | null;
  onActive: (group: string | null) => void;
}) {
  const countries = useCountries();
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const box = useRef<HTMLDivElement | null>(null);
  const behaviour = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const reduced = useReducedMotionConfig();
  const height = Math.round(Math.min(380, Math.max(240, width * 0.56)));

  const drawing = useMemo(() => {
    if (!countries || !width || !points.length) return null;
    const coords = points.map((point) => [point.lon, point.lat] as [number, number]);
    const visited = countries.filter((country) =>
      coords.some((point) => geoContains(country, point))
    );
    const lons = coords.map(([lon]) => lon);
    const lats = coords.map(([, lat]) => lat);
    // ponytail: no antimeridian handling — a Fiji-to-Samoa trip spans the
    // whole world; a rotated projection would fix it.
    const pad = Math.max(
      3,
      0.2 * Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats))
    );
    const fit: MultiPoint = {
      type: "MultiPoint",
      coordinates: [
        [Math.min(...lons) - pad, Math.max(-75, Math.min(...lats) - pad)],
        [Math.max(...lons) + pad, Math.min(80, Math.max(...lats) + pad)],
      ],
    };
    const projection = geoMercator().fitExtent(
      [
        [12, 12],
        [width - 12, height - 12],
      ],
      fit
    );
    const path = geoPath(projection);
    const routes = new Map<string, [number, number][]>();
    points.forEach((point, index) => {
      if (point.route) routes.set(point.route, [...(routes.get(point.route) ?? []), coords[index]]);
    });
    return {
      countries: countries.map((country) => ({
        d: path(country) ?? "",
        visited: visited.includes(country),
      })),
      routes: [...routes]
        .filter(([, line]) => line.length > 1)
        .map(([group, line]) => ({
          group,
          d: path({ type: "LineString", coordinates: line }) ?? "",
        })),
      dots: coords.map((point) => (projection(point) ?? [0, 0]) as [number, number]),
    };
  }, [countries, width, height, points]);

  // The zoom lives on the wrapper, not the SVG, so a drag or pinch that starts
  // on a dot's hit area (HTML over the SVG) still moves the map.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const zoomer = zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.4, 32])
      .filter((event) => {
        if (event.type === "wheel") return event.ctrlKey || event.metaKey;
        if (event.type === "touchstart") return event.touches.length > 1;
        return !event.ctrlKey && !event.button;
      })
      .on("zoom", (event) => setTransform(event.transform));
    select(element).call(zoomer);
    // One finger scrolls the page; two pinch the map.
    element.style.touchAction = "pan-x pan-y";
    behaviour.current = zoomer;
    return () => {
      select(element).on(".zoom", null);
    };
  }, []);

  // A new set of points is a new map: start from the fitted view.
  const signature = points.map((point) => point.key).join("|");
  useEffect(() => {
    if (box.current && behaviour.current) {
      select(box.current).call(behaviour.current.transform, zoomIdentity);
    }
  }, [signature]);

  function animate(apply: (zoomer: ZoomBehavior<HTMLDivElement, unknown>, target: any) => void) {
    if (!box.current || !behaviour.current) return;
    const target = select(box.current);
    apply(behaviour.current, reduced ? target : target.transition().duration(T_BASE.duration * 1000 * 2));
  }

  function zoomTo(index: number) {
    if (!drawing) return;
    const [x, y] = drawing.dots[index];
    const k = Math.max(transform.k * 2, 4);
    animate((zoomer, target) =>
      target.call(zoomer.transform, zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-x, -y))
    );
  }

  const most = Math.max(1, ...points.map((point) => point.value));
  const radius = (point: MapPoint) => 5 + 11 * Math.sqrt(point.value / most);
  const screen = (index: number) =>
    drawing ? transform.apply(drawing.dots[index]) : ([0, 0] as [number, number]);
  const dim = (group: string) => active !== null && active !== group;
  // Labels placed largest dot first; one that would overlap a placed label is
  // left for the hover to show. ponytail: width estimated from the length, no
  // text measuring.
  const labelled = new Set<number>();
  if (drawing) {
    const placed: [number, number, number, number][] = [];
    [...points.keys()]
      .sort((a, b) => points[b].value - points[a].value)
      .forEach((index) => {
        const [x, y] = screen(index);
        const left = x + radius(points[index]) + 5;
        const rect: [number, number, number, number] = [
          left,
          y - 8,
          left + points[index].label.length * 7,
          y + 8,
        ];
        const hit = placed.some(
          ([x0, y0, x1, y1]) => rect[0] < x1 && rect[2] > x0 && rect[1] < y1 && rect[3] > y0
        );
        if (!hit) {
          placed.push(rect);
          labelled.add(index);
        }
      });
  }
  const shown = hovered !== null ? points[hovered] : null;

  return (
    <div
      className={styles["map"]}
      ref={(element) => {
        box.current = element;
        ref(element);
      }}
      onMouseLeave={() => {
        setHovered(null);
        onActive(null);
      }}
    >
      {drawing ? (
        <svg width={width} height={height} aria-hidden="true">
          <g transform={transform.toString()}>
            {drawing.countries.map((country, index) => (
              <path
                key={index}
                d={country.d}
                className={country.visited ? styles["visited"] : styles["land"]}
              />
            ))}
            {drawing.routes.map((route) => (
              <path
                key={route.group}
                d={route.d}
                className={styles["route"]}
                opacity={dim(route.group) ? 0.25 : undefined}
              />
            ))}
          </g>
          {points.map((point, index) => {
            const [x, y] = screen(index);
            const r = radius(point);
            return (
              <g key={point.key} opacity={dim(point.group) ? 0.3 : 1}>
                <circle cx={x} cy={y} r={r} fill={point.color} className={styles["dot"]} />
                {labelled.has(index) || hovered === index ? (
                  <text x={x + r + 5} y={y + 4} className={styles["label"]}>
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : (
        <div className={styles["loading"]} style={{ height }} />
      )}
      {drawing
        ? points.map((point, index) => {
            const [x, y] = screen(index);
            const size = Math.max(28, radius(point) * 2 + 8);
            return (
              <button
                key={point.key}
                type="button"
                className={styles["hit"]}
                style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}
                aria-label={point.ariaLabel}
                onMouseEnter={() => {
                  setHovered(index);
                  onActive(point.group);
                }}
                onMouseLeave={() => {
                  setHovered(null);
                  onActive(null);
                }}
                onFocus={() => {
                  setHovered(index);
                  onActive(point.group);
                }}
                onBlur={() => {
                  setHovered(null);
                  onActive(null);
                }}
                onClick={() => zoomTo(index)}
              />
            );
          })
        : null}
      {drawing ? (
        <div className={styles["zoom"]}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Zoom inn"
            onClick={() => animate((zoomer, target) => target.call(zoomer.scaleBy, ZOOM_STEP))}
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Zoom ut"
            onClick={() => animate((zoomer, target) => target.call(zoomer.scaleBy, 1 / ZOOM_STEP))}
          >
            <IconMinus />
          </button>
          {transform.k !== 1 || transform.x !== 0 || transform.y !== 0 ? (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => animate((zoomer, target) => target.call(zoomer.transform, zoomIdentity))}
            >
              Tilbake
            </button>
          ) : null}
        </div>
      ) : null}
      {drawing ? (
        <span className={styles["hint"]} aria-hidden="true">
          <span className={styles["hint-mouse"]}>
            Dra for å flytte · knip eller ⌘/Ctrl + scroll for å zoome
          </span>
          <span className={styles["hint-touch"]}>To fingre for å flytte og zoome</span>
        </span>
      ) : null}
      <ChartTooltip
        content={
          shown && hovered !== null
            ? {
                x: screen(hovered)[0],
                y: screen(hovered)[1] - radius(shown),
                boxWidth: width,
                title: shown.title,
                rows: shown.rows,
              }
            : null
        }
      />
    </div>
  );
}

/** A trip's stops as map points (the ones `mapStops` keeps): one group per
 *  stop, one route through the dated ones. */
export function stopPoints(stops: Stop[], color: StopColor): MapPoint[] {
  return mapStops(stops)
    .map((stop) => {
      const place = stop.place!;
      return {
        key: String(stop.index),
        group: String(stop.index),
        route: place.arrive ? "trip" : null,
        lon: place.lon,
        lat: place.lat,
        label: place.name,
        value: stop.spent,
        color: color(stop),
        title: place.kind === "city" ? `${place.name}, ${place.country}` : place.name,
        rows: [
          { value: formatCurrency(stop.spent), swatch: color(stop) },
          {
            label: stayLabel(stop),
            value: stop.days
              ? `${formatCurrency(Math.round(stop.spent / stop.days))} / dag`
              : place.arrive
                ? "dagen telles på neste stopp"
                : "ikke datert",
            tone: "muted",
          },
        ],
        ariaLabel: `${place.name}: ${formatCurrency(stop.spent)}, ${stayLabel(stop)}. Klikk for å zoome inn.`,
      };
    });
}

const HEIGHT = 150;
const TOP = 18;
const BAND = 8; // the strip of stop colours under the bars
const BOTTOM = 34; // the strip and its labels

/**
 * The trip day by day: one column per day, coloured by the stop it belongs to,
 * over a strip that marks each stay. Tickets bought before leaving are not a
 * column — one flight would flatten every day after it; the card's Før turen
 * figure carries them.
 */
export function TripTimeline({
  summary,
  dayStop,
  stops,
  color,
  today,
  highlight,
  onActive,
}: {
  summary: TagSummary;
  dayStop: number[];
  stops: Stop[];
  color: StopColor;
  today: string;
  /** A stop's index as a string — the same group key the map uses. */
  highlight: string | null;
  onActive: (group: string | null) => void;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const days = summary.daily;
  const stopOf = (day: number) => stops.find((stop) => stop.index === dayStop[day]);
  const most = Math.max(1, ...days.map((day) => day.spent));
  const y = scaleLinear().domain([0, most]).range([HEIGHT - BOTTOM, TOP]);
  const band = bandLayout(days.length, width, days.length > 40 ? 0.12 : 0.24);
  const base = HEIGHT - BOTTOM;
  const withYear = summary.start.slice(0, 4) !== summary.end.slice(0, 4);
  const todayIndex = days.findIndex((day) => day.date === today);

  // Runs of consecutive days at one stop, for the strip under the bars.
  const runs: { stop: Stop | undefined; from: number; to: number }[] = [];
  dayStop.forEach((owner, day) => {
    const last = runs[runs.length - 1];
    if (last && dayStop[last.to] === owner) last.to = day;
    else runs.push({ stop: stopOf(day), from: day, to: day });
  });

  const hovered = active !== null ? days[active] : null;
  const hoveredStop = active !== null ? stopOf(active) : undefined;

  return (
    <div
      className={styles["timeline"]}
      ref={ref}
      onMouseLeave={() => {
        setActive(null);
        onActive(null);
      }}
    >
      {width > 0 ? (
        <svg width={width} height={HEIGHT} aria-hidden="true">
          <line className={styles["base"]} x1={0} x2={width} y1={base} y2={base} />
          {todayIndex >= 0 ? (
            <line
              className={styles["today"]}
              x1={band.center(todayIndex)}
              x2={band.center(todayIndex)}
              y1={4}
              y2={base}
            />
          ) : null}
          {days.map((day, index) => {
            const top = y(day.spent);
            const stop = stopOf(index);
            return day.spent > 0 ? (
              <rect
                key={day.date}
                x={band.center(index) - band.bar / 2}
                y={top}
                width={band.bar}
                height={base - top}
                {...barCorner(Math.min(band.bar, base - top) / 2)}
                fill={stop ? color(stop) : "var(--muted)"}
                opacity={
                  active !== null
                    ? active === index
                      ? 1
                      : 0.4
                    : highlight === null || highlight === String(dayStop[index])
                      ? 1
                      : 0.3
                }
              />
            ) : null;
          })}
          {/* No places at all: one unnamed run says nothing, so no strip. */}
          {(stops.some((stop) => stop.place) ? runs : []).map((run) => {
            const x0 = band.left(run.from) + 1;
            const x1 = band.left(run.to) + band.step - 1;
            const name = run.stop ? stopName(run.stop) : "";
            return (
              <g key={run.from}>
                <rect
                  x={x0}
                  y={base + 6}
                  width={Math.max(2, x1 - x0)}
                  height={BAND}
                  {...barCorner(BAND / 2)}
                  fill={run.stop ? color(run.stop) : "var(--muted)"}
                  opacity={
                    highlight === null || highlight === String(run.stop?.index) ? 1 : 0.3
                  }
                />
                {x1 - x0 > name.length * 6.5 ? (
                  <text className={styles["run-label"]} x={(x0 + x1) / 2} y={base + 6 + BAND + 13}>
                    {name}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
      {width > 0
        ? days.map((day, index) => (
            <div
              key={day.date}
              role="img"
              tabIndex={0}
              className={styles["day-hit"]}
              style={{ left: band.left(index), width: band.step, height: HEIGHT - BOTTOM + 14 }}
              aria-label={`${shortDate(day.date, true)}${stopOf(index)?.place ? `, ${stopOf(index)!.place!.name}` : ""}: ${formatCurrency(day.spent)}`}
              onMouseEnter={() => {
                setActive(index);
                onActive(String(dayStop[index]));
              }}
              onFocus={() => {
                setActive(index);
                onActive(String(dayStop[index]));
              }}
              onBlur={() => {
                setActive(null);
                onActive(null);
              }}
            />
          ))
        : null}
      <div className={styles["dates"]}>
        <span>{shortDate(summary.start, withYear)}</span>
        <span>{shortDate(summary.end, withYear)}</span>
      </div>
      <ChartTooltip
        content={
          hovered && active !== null
            ? {
                x: band.center(active),
                y: y(hovered.spent),
                boxWidth: width,
                title: `Dag ${active + 1} · ${shortDate(hovered.date, withYear)}`,
                rows: [
                  {
                    label: hoveredStop ? stopName(hoveredStop) : undefined,
                    value: formatCurrency(hovered.spent),
                    swatch: hoveredStop ? color(hoveredStop) : undefined,
                  },
                ],
              }
            : null
        }
      />
    </div>
  );
}
