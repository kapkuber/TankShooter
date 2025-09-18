import { useEffect, useRef } from "react";
import type { Vec2 as EntVec2, GameEntity } from "./game/entities";
import {
  SQUARE_SIZE,
  TRIANGLE_SIZE,
  SQUARE_MAX_COUNT,
  TRIANGLE_MAX_COUNT,
  computeEntityCollisionRadius,
  triangleWorldVerts,
  circleIntersectsTriangle,
  ENTITY_COLLISION_INSET,
  HIT_FLASH_DURATION,
  ENTITY_BOUNCE,
  resolveEntityEntityCollisions,
  spawnEntityRandomAvoidingPlayers as entsSpawnRandom,
  spawnEntityNearAvoidingPlayers as entsSpawnNear,
  updateEntities as entsUpdate,
  drawEntities as entsDraw,
  queueDeathEffectFromEntity as entsQueueDeathFx,
  updateDeathEffects as entsDeathUpdate,
  drawDeathEffects as entsDeathDraw,
} from "./game/entities";
import type { Bullet } from "./game/tank";
import {
  TANK_RADIUS,
  TANK_MAX_HP,
  BULLET_RADIUS,
  BULLET_COOLDOWN,
  spawnBullet as tankSpawnBullet,
  drawTank as tankDraw,
  drawTankHealthBar as tankDrawHp,
  drawTankDamageFlash as tankDrawHit,
  integrateTank,
} from "./game/tank";

/**
 * Suggested repo setup (outside this file):
 * - Vite + React + TypeScript
 * - ESLint + Prettier
 */

// Utility types
type Vec2 = EntVec2;

type SquareEntity = GameEntity;

// Config (tweak freely)
const GRID_SIZE = 25; // px per grid cell
const GRID_BG_COLOR = "#cccccc"; // grid background (inside map)
const GRID_LINE_COLOR = "#c4c4c4"; // grid lines (inside map)
const OUTSIDE_BG_COLOR = "#b7b7b7"; // grid background (outside map)
const OUTSIDE_LINE_COLOR = "#adadad"; // grid lines (outside map)
const MAP_WIDTH = 1500;
const MAP_HEIGHT = 1500;
// Spawn system controls
const SPAWN_SAFE_RADIUS = 20 * GRID_SIZE; // no-spawn radius around player

export default function TankShooter() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bulletsRef = useRef<Bullet[]>([]);
  const bulletIdRef = useRef(1);
  const lastTsRef = useRef<number | null>(null);
  const tankPosRef = useRef<Vec2>({ x: 0, y: 0 }); // player's WORLD position
  const tankVelRef = useRef<Vec2>({ x: 0, y: 0 }); // player's WORLD velocity
  const tankHpRef = useRef<number>(TANK_MAX_HP);
  const tankHitTRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<Vec2>({ x: 0, y: 0 });
  const mouseDownRef = useRef<boolean>(false);
  const cooldownRemainingRef = useRef<number>(0);
  const insideGridPatternRef = useRef<CanvasPattern | null>(null);
  const outsideGridPatternRef = useRef<CanvasPattern | null>(null);
  const spawnsThisFrameRef = useRef<number>(0);
  const MAX_SPAWNS_PER_FRAME = 2;
  const entitiesRef = useRef<SquareEntity[]>([]);
  const nextEntityIdRef = useRef<number>(1);

  // Seed a few entities on mount so something draws immediately
  useEffect(() => {
    let seeds = 0;
    while (seeds < 6) {
      if (entsSpawnRandom(entitiesRef.current as any, nextEntityIdRef as any, { x: MAP_WIDTH/2, y: MAP_HEIGHT/2 }, MAP_WIDTH, MAP_HEIGHT, SPAWN_SAFE_RADIUS, 'square')) {
        seeds++;
      } else break;
    }
    let tris = 0;
    while (tris < 2) {
      if (entsSpawnRandom(entitiesRef.current as any, nextEntityIdRef as any, { x: MAP_WIDTH/2, y: MAP_HEIGHT/2 }, MAP_WIDTH, MAP_HEIGHT, SPAWN_SAFE_RADIUS, 'triangle')) {
        tris++;
      } else break;
    }
  }, []);
  function spawnBullet() {
    const tank = tankPosRef.current;
    const m = mouseRef.current;
    const w = window.innerWidth;
    const h = window.innerHeight;
    tankSpawnBullet(bulletsRef.current as any, bulletIdRef as any, tank, tankVelRef.current, m, w, h);
  }

  // Resize canvas to full window and account for devicePixelRatio
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    function resize() {
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale drawing ops to CSS pixels
      // world position unchanged on resize

      // Build grid pattern tiles (CSS pixel space)
      function makeGridPattern(bg: string, line: string): CanvasPattern | null {
        const tile = document.createElement('canvas');
        tile.width = GRID_SIZE;
        tile.height = GRID_SIZE;
        const tctx = tile.getContext('2d')!;
        tctx.fillStyle = bg;
        tctx.fillRect(0, 0, tile.width, tile.height);
        tctx.strokeStyle = line;
        tctx.lineWidth = 1;
        tctx.beginPath();
        tctx.moveTo(0.5, 0);
        tctx.lineTo(0.5, tile.height);
        tctx.moveTo(0, 0.5);
        tctx.lineTo(tile.width, 0.5);
        tctx.stroke();
        return tctx.createPattern(tile, 'repeat');
      }
      insideGridPatternRef.current = makeGridPattern(GRID_BG_COLOR, GRID_LINE_COLOR);
      outsideGridPatternRef.current = makeGridPattern(OUTSIDE_BG_COLOR, OUTSIDE_LINE_COLOR);
    }

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Mouse tracking & shooting
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const p = { x: e.clientX, y: e.clientY };
      mouseRef.current = p;
    }
    function onDown(e: MouseEvent) {
      if (e.button !== 0) return; // left click only
      mouseDownRef.current = true;
      // Respect global cooldown
      if (cooldownRemainingRef.current <= 0) {
        spawnBullet();
        cooldownRemainingRef.current = BULLET_COOLDOWN;
      }
    }
    function onUp(e: MouseEvent) {
      if (e.button !== 0) return;
      mouseDownRef.current = false;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // WASD keyboard movement
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
        keysRef.current.add(k);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
        keysRef.current.delete(k);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    function drawGrid() {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      // camera offset (world -> screen)
      const camX = tankPosRef.current.x - w / 2;
      const camY = tankPosRef.current.y - h / 2;

      // Outside pattern fill
      const outside = outsideGridPatternRef.current;
      if (outside) {
        ctx.save();
        ctx.translate(- (camX % GRID_SIZE), - (camY % GRID_SIZE));
        ctx.fillStyle = outside;
        ctx.fillRect(-GRID_SIZE, -GRID_SIZE, w + GRID_SIZE * 2, h + GRID_SIZE * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = OUTSIDE_BG_COLOR;
        ctx.fillRect(0, 0, w, h);
      }

      // Inside map rect
      const mapL = -camX;
      const mapT = -camY;
      const mapR = MAP_WIDTH - camX;
      const mapB = MAP_HEIGHT - camY;
      const insideL = Math.max(0, mapL);
      const insideT = Math.max(0, mapT);
      const insideR = Math.min(w, mapR);
      const insideB = Math.min(h, mapB);
      const hasInside = insideR > insideL && insideB > insideT;
      const inside = insideGridPatternRef.current;
      if (inside && hasInside) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(insideL, insideT, insideR - insideL, insideB - insideT);
        ctx.clip();
        ctx.translate(- (camX % GRID_SIZE), - (camY % GRID_SIZE));
        ctx.fillStyle = inside;
        ctx.fillRect(-GRID_SIZE, -GRID_SIZE, w + GRID_SIZE * 2, h + GRID_SIZE * 2);
        ctx.restore();
      } else if (hasInside) {
        ctx.fillStyle = GRID_BG_COLOR;
        ctx.fillRect(insideL, insideT, insideR - insideL, insideB - insideT);
      }
    }

    function drawTank() {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      const m = mouseRef.current;
      tankDraw(ctx, w, h, m);
    }

    // Tank health is drawn below the tank like entities; invisible at full HP

    function drawBullets(dt: number) {
      // update
      bulletsRef.current.forEach(b => {
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;
        b.life -= dt;
      });
      // bullet vs entity collisions (broad-phase spatial hash)
      if (entitiesRef.current.length && bulletsRef.current.length) {
        const CELL = Math.max(SQUARE_SIZE, TRIANGLE_SIZE, BULLET_RADIUS * 2);
        // use numeric keys to avoid string concat overhead
        const bins = new Map<number, SquareEntity[]>();
        const key = (cx: number, cy: number) => ((cx << 16) ^ (cy & 0xffff)) | 0;

        // bin entities
        for (const e of entitiesRef.current) {
          const cx = Math.floor(e.pos.x / CELL);
          const cy = Math.floor(e.pos.y / CELL);
          const k = key(cx, cy);
          let arr = bins.get(k);
          if (!arr) { arr = []; bins.set(k, arr); }
          arr.push(e);
        }

        const removed = new Set<number>();

        // for each bullet, scan only 3x3 neighboring cells; exit early on hit
        bulletLoop:
        for (const b of bulletsRef.current) {
          if (b.life <= 0) continue;
          const cx = Math.floor(b.pos.x / CELL);
          const cy = Math.floor(b.pos.y / CELL);
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const arr = bins.get(key(cx + dx, cy + dy));
              if (!arr) continue;
              for (const e of arr) {
                if (removed.has(e.id)) continue;
                if (e.kind === 'triangle') {
                  // Triangle collision: polygon with inset constant
                  const insetSize = Math.max(1, e.size - 2 * ENTITY_COLLISION_INSET);
                  const [v0, v1, v2] = triangleWorldVerts(e.pos, e.angle, insetSize);
                  if (circleIntersectsTriangle({ x: b.pos.x, y: b.pos.y }, b.radius, v0, v1, v2)) {
                    (e as any).hp = Math.max(0, (e as any).hp - 7);
                    (e as any).hitT = HIT_FLASH_DURATION;
                    // bounce entity away from bullet
                    const dxh = e.pos.x - b.pos.x;
                    const dyh = e.pos.y - b.pos.y;
                    const len = Math.hypot(dxh, dyh) || 1;
                    (e as any).kick.x += (dxh / len) * ENTITY_BOUNCE;
                    (e as any).kick.y += (dyh / len) * ENTITY_BOUNCE;
                    b.life = 0;
                    if ((e as any).hp <= 0) { entsQueueDeathFx(e as any); removed.add(e.id); }
                    continue bulletLoop;
                  }
                } else {
                  // Square: keep circular approx with inset
                  const dxp = b.pos.x - e.pos.x;
                  const dyp = b.pos.y - e.pos.y;
                  const r = b.radius + computeEntityCollisionRadius(e.size);
                  if (dxp * dxp + dyp * dyp <= r * r) {
                    (e as any).hp = Math.max(0, (e as any).hp - 7);
                    (e as any).hitT = HIT_FLASH_DURATION;
                    // bounce entity away from bullet
                    const len = Math.hypot(dxp, dyp) || 1;
                    (e as any).kick.x -= (dxp / len) * ENTITY_BOUNCE;
                    (e as any).kick.y -= (dyp / len) * ENTITY_BOUNCE;
                    b.life = 0;
                    if ((e as any).hp <= 0) { entsQueueDeathFx(e as any); removed.add(e.id); }
                    continue bulletLoop;
                  }
                }
              }
            }
          }
        }
        if (removed.size) {
          const toRespawn = entitiesRef.current.filter(e => removed.has(e.id)).length;
          entitiesRef.current = entitiesRef.current.filter(e => !removed.has(e.id));
          let spawned = 0;
          while (spawned < toRespawn && spawned < MAX_SPAWNS_PER_FRAME) { if (entsSpawnRandom(entitiesRef.current as any, nextEntityIdRef as any, tankPosRef.current, MAP_WIDTH, MAP_HEIGHT, SPAWN_SAFE_RADIUS, 'square')) { spawned++; spawnsThisFrameRef.current++; } else break; }
        }
      }
      // cull relative to camera/view
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      const camX = tankPosRef.current.x - w / 2;
      const camY = tankPosRef.current.y - h / 2;
      bulletsRef.current = bulletsRef.current.filter(b => {
        if (b.life <= 0) return false;
        const sx = b.pos.x - camX;
        const sy = b.pos.y - camY;
        return sx > -40 && sx < w + 40 && sy > -40 && sy < h + 40;
      });

      // draw
      ctx.fillStyle = "#00b2e1";
      for (const b of bulletsRef.current) {
        ctx.beginPath();
        ctx.arc(b.pos.x - camX, b.pos.y - camY, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#0085a8"; // bullet outline
        ctx.lineWidth = 2.7;
        ctx.stroke();
      }
    }

    function frame(ts: number) {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0; // clamp to avoid huge jumps
      spawnsThisFrameRef.current = 0;

      // movement from WASD (world space) with drift/inertia
      let ix = 0;
      let iy = 0;
      const keys = keysRef.current;
      if (keys.has('w')) iy -= 1;
      if (keys.has('s')) iy += 1;
      if (keys.has('a')) ix -= 1;
      if (keys.has('d')) ix += 1;
      const margin = 4 * GRID_SIZE;
      integrateTank(dt, ix, iy, tankVelRef.current, tankPosRef.current, MAP_WIDTH, MAP_HEIGHT, margin);

      // Tick down global cooldown
      cooldownRemainingRef.current = Math.max(0, cooldownRemainingRef.current - dt);
      // Tick down tank damage flash timer before collision step (so new hits start fresh)
      tankHitTRef.current = Math.max(0, tankHitTRef.current - dt);
      // Continuous fire handling with cooldown (max 1 per 0.6s)
      if (mouseDownRef.current && cooldownRemainingRef.current <= 0) {
        spawnBullet();
        cooldownRemainingRef.current = BULLET_COOLDOWN;
      }

      drawGrid();
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      // Entities update/draw via module
      const maybeSpawnNear = (x: number, y: number, kind: 'square'|'triangle') => {
        const countSquares = entitiesRef.current.filter(e => e.kind === 'square').length;
        const countTris = entitiesRef.current.filter(e => e.kind === 'triangle').length;
        if (kind === 'square' && countSquares < SQUARE_MAX_COUNT && spawnsThisFrameRef.current < MAX_SPAWNS_PER_FRAME) {
          if (entsSpawnNear(entitiesRef.current as any, nextEntityIdRef as any, x, y, tankPosRef.current, MAP_WIDTH, MAP_HEIGHT, SPAWN_SAFE_RADIUS, 'square')) {
            spawnsThisFrameRef.current++;
          }
        } else if (kind === 'triangle' && countTris < TRIANGLE_MAX_COUNT && spawnsThisFrameRef.current < MAX_SPAWNS_PER_FRAME) {
          if (entsSpawnNear(entitiesRef.current as any, nextEntityIdRef as any, x, y, tankPosRef.current, MAP_WIDTH, MAP_HEIGHT, SPAWN_SAFE_RADIUS, 'triangle')) {
            spawnsThisFrameRef.current++;
          }
        }
      };
      const onPlayerCollide = (damage: number) => {
        tankHpRef.current = Math.max(0, tankHpRef.current - damage);
        // trigger flash each time damage is applied
        tankHitTRef.current = HIT_FLASH_DURATION;
      };
      entsUpdate(dt, entitiesRef.current as any, tankPosRef.current, tankVelRef.current, MAP_WIDTH, MAP_HEIGHT, TANK_RADIUS, maybeSpawnNear, onPlayerCollide);
      resolveEntityEntityCollisions(entitiesRef.current as any);
      entsDeathUpdate(dt);
      entsDraw(ctx, w, h, tankPosRef.current.x - w/2, tankPosRef.current.y - h/2, entitiesRef.current as any);
      entsDeathDraw(ctx, w, h, tankPosRef.current.x - w/2, tankPosRef.current.y - h/2);
      drawBullets(dt);
      drawTank();
      tankDrawHp(ctx, w, h, tankHpRef.current, TANK_MAX_HP);
      // red tank flash overlay
      tankDrawHit(ctx, w, h, tankHitTRef.current);
      // screen flash removed per request; only tank flash remains
      requestAnimationFrame(frame);
    }

    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden">
      <canvas ref={canvasRef} className="block" />
      <div className="fixed top-3 left-3 text-xs bg-white/80 rounded-md px-2 py-1 shadow">Left click to shoot • Move mouse to aim</div>
    </div>
  );
}


