import {
  GRID_SIZE,
  GRID_BG_COLOR,
  GRID_LINE_COLOR,
  OUTSIDE_BG_COLOR,
  OUTSIDE_LINE_COLOR,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "./config";
import type { CameraInfo } from "./config";

export interface GridPatterns {
  inside: CanvasPattern | null;
  outside: CanvasPattern | null;
}

function makeGridPattern(bg: string, line: string): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = GRID_SIZE;
  tile.height = GRID_SIZE;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;
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
  return tctx.createPattern(tile, "repeat");
}

export function createGridPatterns(): GridPatterns {
  return {
    inside: makeGridPattern(GRID_BG_COLOR, GRID_LINE_COLOR),
    outside: makeGridPattern(OUTSIDE_BG_COLOR, OUTSIDE_LINE_COLOR),
  };
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: CameraInfo,
  patterns: GridPatterns,
): void {
  const { width, height, x: camX, y: camY } = camera;
  ctx.clearRect(0, 0, width, height);

  const outside = patterns.outside;
  if (outside) {
    ctx.save();
    ctx.translate(-(camX % GRID_SIZE), -(camY % GRID_SIZE));
    ctx.fillStyle = outside;
    ctx.fillRect(-GRID_SIZE, -GRID_SIZE, width + GRID_SIZE * 2, height + GRID_SIZE * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = OUTSIDE_BG_COLOR;
    ctx.fillRect(0, 0, width, height);
  }

  const mapL = -camX;
  const mapT = -camY;
  const mapR = MAP_WIDTH - camX;
  const mapB = MAP_HEIGHT - camY;
  const insideL = Math.max(0, mapL);
  const insideT = Math.max(0, mapT);
  const insideR = Math.min(width, mapR);
  const insideB = Math.min(height, mapB);
  const hasInside = insideR > insideL && insideB > insideT;
  if (!hasInside) return;

  const inside = patterns.inside;
  if (inside) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(insideL, insideT, insideR - insideL, insideB - insideT);
    ctx.clip();
    ctx.translate(-(camX % GRID_SIZE), -(camY % GRID_SIZE));
    ctx.fillStyle = inside;
    ctx.fillRect(-GRID_SIZE, -GRID_SIZE, width + GRID_SIZE * 2, height + GRID_SIZE * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = GRID_BG_COLOR;
    ctx.fillRect(insideL, insideT, insideR - insideL, insideB - insideT);
  }
}
