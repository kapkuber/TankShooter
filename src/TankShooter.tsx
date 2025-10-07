import { useEffect, useRef } from "react";
import type { Vec2 as EntVec2, GameEntity } from "./game/entities";
import {
  SQUARE_MAX_COUNT,
  TRIANGLE_MAX_COUNT,
  HIT_FLASH_DURATION,
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
  BULLET_COOLDOWN,
  spawnBullet as tankSpawnBullet,
  drawTank as tankDraw,
  drawTankHealthBar as tankDrawHp,
  drawTankDamageFlash as tankDrawHit,
  integrateTank,
} from "./game/tank";
import {
  GRID_SIZE,
  MAP_HEIGHT,
  MAP_WIDTH,
  SPAWN_SAFE_RADIUS,
  MAX_SPAWNS_PER_FRAME,
  type CameraInfo,
} from "./game/config";
import { createGridPatterns, drawGrid, type GridPatterns } from "./game/grid";
import { updateBullets, renderBullets } from "./game/bulletSystem";

/**
 * Suggested repo setup (outside this file):
 * - Vite + React + TypeScript
 * - ESLint + Prettier
 */

// Utility types
type Vec2 = EntVec2;

type SquareEntity = GameEntity;

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
  const gridPatternsRef = useRef<GridPatterns>({ inside: null, outside: null });
  const spawnsThisFrameRef = useRef<number>(0);
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
      gridPatternsRef.current = createGridPatterns();
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

    const getCamera = (): CameraInfo => {
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      return {
        x: tankPosRef.current.x - width / 2,
        y: tankPosRef.current.y - height / 2,
        width,
        height,
        devicePixelRatio: dpr,
      };
    };

    const renderTank = (camera: CameraInfo) => {
      const mouse = mouseRef.current;
      tankDraw(ctx, camera.width, camera.height, mouse);
    };

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

      const camera = getCamera();
      drawGrid(ctx, camera, gridPatternsRef.current);
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
      entsDraw(ctx, camera.width, camera.height, camera.x, camera.y, entitiesRef.current as any);
      entsDeathDraw(ctx, camera.width, camera.height, camera.x, camera.y);

      const bulletResult = updateBullets({
        bullets: bulletsRef.current,
        entities: entitiesRef.current as any,
        dt,
        camera,
        spawnsThisFrame: spawnsThisFrameRef.current,
        maxSpawnsPerFrame: MAX_SPAWNS_PER_FRAME,
        spawnSquare: (list) => entsSpawnRandom(list as any, nextEntityIdRef as any, tankPosRef.current, MAP_WIDTH, MAP_HEIGHT, SPAWN_SAFE_RADIUS, 'square'),
        queueDeathEffect: entsQueueDeathFx,
      });

      bulletsRef.current = bulletResult.bullets;
      entitiesRef.current = bulletResult.entities as any;
      spawnsThisFrameRef.current = bulletResult.spawnsThisFrame;

      renderBullets(ctx, bulletsRef.current, camera);
      renderTank(camera);
      tankDrawHp(ctx, camera.width, camera.height, tankHpRef.current, TANK_MAX_HP);
      // red tank flash overlay
      tankDrawHit(ctx, camera.width, camera.height, tankHitTRef.current);
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


