"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotionConfig, useSpring } from "motion/react";
import { columnName } from "@/lib/format";
import { T_DRAW } from "@/lib/motion";
import { useAppStyle } from "@/lib/useAppStyle";
import styles from "./CursorEffects.module.css";

// What the pointer does in each style, on top of the cursor image the style
// draws (globals.css, --cursor-default/--cursor-pointer):
//
//   Standard      an accent ring where you click
//   Ark           the cell under the pointer selected on the sheet behind the
//                 cards, with its name (C14) the way Excel's Name Box shows it
//   Glass         an iPadOS-style lens that trails the pointer and wraps
//                 itself around the control it is over
//   Neumorfisme   a dimple pressed into the surface where you click
//   Retro         Windows 98's pointer trails
//   Akvarium      bubbles: a trail as you move, a breath when you rest, a fizz
//                 over a control, a burst and a ripple where you click
//
// Mounted inside the (app) layout's MotionConfig, so reduced motion turns all
// of it off in one place. Nothing here takes pointer events.

/** What counts as clickable: what --cursor-pointer covers by default. */
const CLICKABLE = 'a[href], button:not(:disabled), [role="button"], summary, select';

function clickable(target: EventTarget | null) {
  return target instanceof Element ? target.closest(CLICKABLE) : null;
}

/** The pointer left the window (a pointerout with nowhere to go). */
function leftWindow(event: PointerEvent) {
  return event.relatedTarget === null;
}

export default function CursorEffects() {
  const style = useAppStyle();
  const reduced = useReducedMotionConfig();
  if (reduced) return null;
  switch (style) {
    case "akvarium":
      return <Bubbles />;
    case "retro":
      return <Trails />;
    case "glass":
      return <Lens />;
    case "ark":
      return <SelectedCell />;
    case "neu":
      return <Marks kind="press" />;
    case "standard":
      return <Marks kind="ripple" />;
    default:
      return null;
  }
}

/* ------------------------------------------------ Standard and Neumorfisme */

type Mark = { id: number; x: number; y: number };

function Marks({ kind }: { kind: "ripple" | "press" }) {
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    let id = 0;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const mark = { id: ++id, x: event.clientX, y: event.clientY };
      // A handful at most: a burst of clicks should not pile up nodes.
      setMarks((all) => [...all.slice(-4), mark]);
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  return marks.map((mark) => (
    <motion.span
      key={mark.id}
      className={styles[kind]}
      style={{ left: mark.x, top: mark.y }}
      initial={{ scale: 0.25, opacity: 1 }}
      animate={{ scale: 1, opacity: 0 }}
      transition={T_DRAW}
      onAnimationComplete={() => setMarks((all) => all.filter((other) => other.id !== mark.id))}
    />
  ));
}

/* ---------------------------------------------------------------------- Ark */

/** Ark's background cell, 64 × 20 like Excel's default (globals.css, `.bg-ambient`). */
const CELL_W = 64;
const CELL_H = 20;

function SelectedCell() {
  const cell = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !cell.current || !name.current) return;
      // The grid is fixed to the viewport, so viewport coordinates are cells.
      const col = Math.floor(event.clientX / CELL_W);
      const row = Math.floor(event.clientY / CELL_H);
      cell.current.hidden = false;
      cell.current.style.transform = `translate(${col * CELL_W}px, ${row * CELL_H}px)`;
      name.current.textContent = `${columnName(col)}${row + 1}`;
    };
    const onOut = (event: PointerEvent) => {
      if (leftWindow(event) && cell.current) cell.current.hidden = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);

  return (
    <div ref={cell} className={styles["cell"]} hidden>
      <span ref={name} className={styles["cell-name"]} />
    </div>
  );
}

/* -------------------------------------------------------------------- Glass */

const LENS = 34;
const FOLLOW = { stiffness: 520, damping: 38, mass: 0.6 };
const MORPH = { stiffness: 380, damping: 32 };

function Lens() {
  const x = useSpring(-LENS, FOLLOW);
  const y = useSpring(-LENS, FOLLOW);
  const width = useSpring(LENS, MORPH);
  const height = useSpring(LENS, MORPH);
  const radius = useSpring(LENS / 2, MORPH);
  const opacity = useSpring(0, MORPH);
  const scale = useSpring(1, MORPH);

  useEffect(() => {
    let last: { x: number; y: number } | null = null;

    const place = (px: number, py: number, target: EventTarget | null) => {
      // Over a text field the I-beam is the pointer; a lens would sit on the text.
      if (target instanceof Element && target.closest("input, textarea")) {
        opacity.set(0);
        return;
      }
      opacity.set(1);
      const control = clickable(target);
      const rect = control?.getBoundingClientRect();
      // Only controls get wrapped: a whole table row or chart column is
      // clickable too, and a lens that size would just be a tint.
      if (control && rect && rect.width <= 320 && rect.height <= 64) {
        const corner = getComputedStyle(control).borderTopLeftRadius;
        const r = corner.endsWith("%") ? Math.min(rect.width, rect.height) / 2 : parseFloat(corner) || 0;
        x.set(rect.left - 4);
        y.set(rect.top - 4);
        width.set(rect.width + 8);
        height.set(rect.height + 8);
        radius.set(r + 4);
      } else {
        x.set(px - LENS / 2);
        y.set(py - LENS / 2);
        width.set(LENS);
        height.set(LENS);
        radius.set(LENS / 2);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!last) {
        // Appear where the pointer is, not fly in from where it left.
        x.jump(event.clientX - LENS / 2);
        y.jump(event.clientY - LENS / 2);
      }
      last = { x: event.clientX, y: event.clientY };
      place(last.x, last.y, event.target);
    };
    // A wrapped control moves under a still pointer when the page scrolls.
    const onScroll = () => {
      if (last) place(last.x, last.y, document.elementFromPoint(last.x, last.y));
    };
    const onOut = (event: PointerEvent) => {
      if (!leftWindow(event)) return;
      last = null;
      opacity.set(0);
    };
    const onDown = () => scale.set(0.92);
    const onUp = () => scale.set(1);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("pointerout", onOut);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [x, y, width, height, radius, opacity, scale]);

  return (
    <motion.div
      className={styles["lens"]}
      style={{ x, y, width, height, borderRadius: radius, opacity, scale }}
    />
  );
}

/* -------------------------------------------------------------------- Retro */

/** Windows 98's "Display pointer trails", set about a third of the way up. */
const GHOSTS = 6;
const SPACING = 2; // frames between one ghost and the next

function Trails() {
  const ghosts = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    type Sample = { x: number; y: number; hand: boolean };
    let pointer: Sample | null = null;
    const history: Sample[] = [];
    let frame = 0;

    const tick = () => {
      frame = 0;
      if (pointer) history.unshift(pointer);
      history.length = Math.min(history.length, GHOSTS * SPACING + 1);
      let shown = false;
      ghosts.current.forEach((ghost, i) => {
        if (!ghost) return;
        const at = history[(i + 1) * SPACING];
        // A ghost only where the pointer has been and no longer is: at rest,
        // the trail folds back into the cursor, as it did on 98.
        const show = Boolean(pointer && at && (at.x !== pointer.x || at.y !== pointer.y));
        ghost.hidden = !show;
        if (!show || !at) return;
        shown = true;
        ghost.style.transform = `translate(${at.x}px, ${at.y}px)`;
        ghost.toggleAttribute("data-hand", at.hand);
      });
      if (shown) frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer = { x: event.clientX, y: event.clientY, hand: Boolean(clickable(event.target)) };
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onOut = (event: PointerEvent) => {
      if (!leftWindow(event)) return;
      pointer = null;
      history.length = 0;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);

  return Array.from({ length: GHOSTS }, (_, i) => (
    <span
      key={i}
      hidden
      ref={(el) => {
        ghosts.current[i] = el;
      }}
      className={styles["ghost"]}
    />
  ));
}

/* ----------------------------------------------------------------- Akvarium */

type Bubble = { x: number; y: number; r: number; vx: number; vy: number; age: number; life: number; phase: number };
type Ring = { x: number; y: number; from: number; to: number; age: number; life: number; width: number };

/** Enough for a frantic scribble; past it new bubbles are simply not blown. */
const MAX_BUBBLES = 180;
/** One bubble per this many pixels of movement. */
const TRAIL_STEP = 16;
/** The fish cursor's mouth, from its hotspot (public/cursors/fish.svg). */
const MOUTH = { x: 3, y: 4 };

const random = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * One bubble, drawn once into a 64px sprite and stamped at every size: a
 * near-clear body brightening to a rim, the window the light comes through,
 * its reflection opposite, and a dark hairline so it still reads over the
 * light glass cards.
 */
function bubbleSprite() {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const g = sprite.getContext("2d");
  if (!g) return sprite;
  const body = g.createRadialGradient(32, 32, 8, 32, 32, 30);
  body.addColorStop(0, "rgba(255,255,255,0.03)");
  body.addColorStop(0.7, "rgba(190,240,250,0.12)");
  body.addColorStop(1, "rgba(255,255,255,0.6)");
  g.fillStyle = body;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = "rgba(0,60,80,0.28)";
  g.beginPath();
  g.arc(32, 32, 31.2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.ellipse(21, 19, 8, 4.5, -0.75, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.beginPath();
  g.arc(43, 44, 3, 0, Math.PI * 2);
  g.fill();
  return sprite;
}

function Bubbles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const sprite = bubbleSprite();
    const bubbles: Bubble[] = [];
    const rings: Ring[] = [];
    let frame = 0;
    let then = 0;
    let pointer: { x: number; y: number } | null = null;
    let trail = { x: 0, y: 0 };
    let movedAt = 0;
    let over: Element | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const blow = (x: number, y: number, r: number, vx: number, vy: number, life: number) => {
      if (bubbles.length < MAX_BUBBLES) {
        bubbles.push({ x, y, r, vx, vy, age: 0, life, phase: random(0, Math.PI * 2) });
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - then) / 1000, 0.05);
      then = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.age += dt;
        if (b.age >= b.life || b.y < -b.r) {
          // Pop: a quick ring the size of the bubble, flung outward.
          if (b.y >= -b.r) rings.push({ x: b.x, y: b.y, from: b.r, to: b.r * 2.6, age: 0, life: 0.22, width: 1 });
          bubbles.splice(i, 1);
          continue;
        }
        // Buoyancy eases each bubble toward its terminal rise (bigger rises
        // faster), water drags the sideways throw out of it, it wobbles as
        // it goes, and it swells a little as the pressure drops.
        const rise = 26 + b.r * 13;
        b.vy += (-rise - b.vy) * Math.min(1, dt * 1.8);
        b.vx *= Math.exp(-dt * 2.5);
        b.x += (b.vx + Math.sin(b.age * 5.5 + b.phase) * b.r * 3.2) * dt;
        b.y += b.vy * dt;
        b.r *= 1 + dt * 0.12;
        ctx.globalAlpha = Math.min(1, b.age / 0.12);
        ctx.drawImage(sprite, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }

      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.age += dt;
        if (ring.age >= ring.life) {
          rings.splice(i, 1);
          continue;
        }
        if (ring.age < 0) continue; // a delayed second ripple
        const t = ring.age / ring.life;
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.lineWidth = ring.width * (1 - t * 0.5);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.from + (ring.to - ring.from) * (1 - (1 - t) ** 3), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      frame = bubbles.length || rings.length ? requestAnimationFrame(tick) : 0;
    };

    const kick = () => {
      if (frame) return;
      then = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const x = event.clientX + MOUTH.x;
      const y = event.clientY + MOUTH.y;
      if (!pointer) trail = { x, y };
      pointer = { x, y };
      movedAt = performance.now();

      // A trail: bubbles strung along the path, thrown a little backward.
      const dx = x - trail.x;
      const dy = y - trail.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= TRAIL_STEP) {
        const count = Math.min(Math.floor(distance / TRAIL_STEP), 6);
        for (let i = 1; i <= count; i++) {
          const t = (i * TRAIL_STEP) / distance;
          blow(
            trail.x + dx * t + random(-3, 3),
            trail.y + dy * t + random(-3, 3),
            random(1.2, 4.2),
            (-dx / distance) * 30 + random(-10, 10),
            random(-30, -10),
            random(0.9, 2.4)
          );
        }
        trail = { x, y };
        kick();
      }

      // A fizz on arriving at something clickable.
      const control = clickable(event.target);
      if (control && control !== over) {
        for (let i = 0; i < 5; i++) {
          blow(x + random(-10, 10), y + random(-6, 6), random(1, 2.6), random(-25, 25), random(-60, -30), random(0.5, 1.1));
        }
        kick();
      }
      over = control;
    };

    // At rest the fish breathes: now and then a bubble or two from its mouth.
    const breathe = window.setInterval(() => {
      if (!pointer || performance.now() - movedAt < 500 || document.hidden) return;
      const count = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        blow(pointer.x + random(-1, 1), pointer.y - i * 5, random(1.4, 3), random(-6, 6), random(-20, -8), random(1.8, 3));
      }
      kick();
    }, 900);

    // A click: a ring of bubbles bursting outward and a ripple, twice.
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const { clientX: x, clientY: y } = event;
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 + random(-0.2, 0.2);
        const speed = random(90, 210);
        blow(x, y, random(1.5, 5.5), Math.cos(angle) * speed, Math.sin(angle) * speed - 20, random(0.8, 2.2));
      }
      rings.push({ x, y, from: 4, to: 46, age: 0, life: 0.8, width: 1.6 });
      rings.push({ x, y, from: 4, to: 30, age: -0.14, life: 0.7, width: 1.2 });
      kick();
    };

    const onOut = (event: PointerEvent) => {
      if (!leftWindow(event)) return;
      pointer = null;
      over = null;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerout", onOut);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(breathe);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);

  return <canvas ref={ref} className={styles["bubbles"]} aria-hidden="true" />;
}
