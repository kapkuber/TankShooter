export type StatKey =
  | "maxHealth"
  | "healthRegen"
  | "bodyDamage"
  | "bulletSpeed"
  | "bulletPenetration"
  | "bulletDamage"
  | "reload"
  | "movementSpeed";

export interface StatPoints {
  maxHealth: number;
  healthRegen: number;
  bodyDamage: number;
  bulletSpeed: number;
  bulletPenetration: number;
  bulletDamage: number;
  reload: number;
  movementSpeed: number;
}

export const STAT_ORDER: StatKey[] = [
  "healthRegen",
  "maxHealth",
  "bodyDamage",
  "bulletSpeed",
  "bulletPenetration",
  "bulletDamage",
  "reload",
  "movementSpeed",
];

export const STAT_LABELS: Record<StatKey, string> = {
  healthRegen: "Health Regen",
  maxHealth: "Max Health",
  bodyDamage: "Body Damage",
  bulletSpeed: "Bullet Speed",
  bulletPenetration: "Bullet Penetration",
  bulletDamage: "Bullet Damage",
  reload: "Reload",
  movementSpeed: "Movement Speed",
};

export const MAX_STAT_POINTS = 7;
export const MAX_SKILL_POINTS = 33;
export const MAX_LEVEL = 45;

export const BASE_HP = 50;
export const HP_PER_LEVEL = 2;
export const HP_PER_POINT = 20;

export const SIZE_PER_LEVEL = 0.01;
export const FOV_SCALE = 0.003;

export const REGEN_BASE_FACTOR = 0.03;
export const REGEN_PER_POINT = 0.12;
export const REGEN_HYPER_DELAY = 30; // seconds since last damage
export const REGEN_HYPER_MULTIPLIER = 4;

export const BODY_DAMAGE_BASE = 5;
export const BODY_DAMAGE_MULT_SHAPE = 4;
export const BODY_DAMAGE_MULT_TANK = 6;
export const BODY_DAMAGE_MULT_PROJECTILE = 1;

export const BASE_BULLET_SPEED = 300;
export const BULLET_SPEED_PER_POINT = 0.1;

export const BASE_BULLET_HP = 2;
export const BULLET_PENETRATION_PER_POINT = 0.75;

export const BASE_BULLET_DAMAGE = 7;
export const BULLET_DAMAGE_PER_POINT = 0.42857;
export const BULLET_HIT_BULLET_REDUCTION = 0.25;

export const BASE_RELOAD_TICKS = 15;
export const RELOAD_POINT_FACTOR = 0.914;
export const TICK_DURATION = 0.04;

export const BASE_TANK_SPEED = 280;
export const SPEED_PER_POINT = 0.06;
export const LEVEL_SPEED_SLOWDOWN = 0.004;
export const MIN_LEVEL_SPEED_MULTIPLIER = 0.6;

export const HIGH_SPEED_DAMAGE_PENALTY = 0.08;

export const IMPACT_SPEED_BONUS = 0.25;

export const SHAPE_BASE_DAMAGE: Record<"square" | "triangle", number> = {
  square: 2,
  triangle: 4,
};

export const BASE_XP_TO_LEVEL = 60;
export const XP_PER_LEVEL = 20;
export const XP_PER_HP = 1;
export const SCORE_PER_HP = 5;
export const SCORE_MULTIPLIER: Record<"square" | "triangle", number> = {
  square: 1,
  triangle: 1.5,
};

export function clampStatPoints(points: StatPoints): StatPoints {
  return {
    maxHealth: Math.max(0, Math.min(MAX_STAT_POINTS, points.maxHealth)),
    healthRegen: Math.max(0, Math.min(MAX_STAT_POINTS, points.healthRegen)),
    bodyDamage: Math.max(0, Math.min(MAX_STAT_POINTS, points.bodyDamage)),
    bulletSpeed: Math.max(0, Math.min(MAX_STAT_POINTS, points.bulletSpeed)),
    bulletPenetration: Math.max(0, Math.min(MAX_STAT_POINTS, points.bulletPenetration)),
    bulletDamage: Math.max(0, Math.min(MAX_STAT_POINTS, points.bulletDamage)),
    reload: Math.max(0, Math.min(MAX_STAT_POINTS, points.reload)),
    movementSpeed: Math.max(0, Math.min(MAX_STAT_POINTS, points.movementSpeed)),
  };
}

export function sumStatPoints(points: StatPoints): number {
  return Object.values(points).reduce((total, value) => total + value, 0);
}

export function totalSkillPointsForLevel(level: number): number {
  const clampedLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const perLevel = Math.max(0, Math.min(27, clampedLevel - 1));
  const level30 = clampedLevel >= 30 ? 1 : 0;
  const threeLevelSteps = Math.max(0, Math.floor((clampedLevel - 33) / 3) + 1);
  const extra = Math.min(5, threeLevelSteps);
  return Math.min(MAX_SKILL_POINTS, perLevel + level30 + extra);
}

export function availableSkillPoints(level: number, points: StatPoints): number {
  return Math.max(0, totalSkillPointsForLevel(level) - sumStatPoints(points));
}

export function baseMaxHpForLevel(level: number): number {
  return BASE_HP + HP_PER_LEVEL * Math.max(0, level - 1);
}

export function xpForNextLevel(level: number): number {
  return BASE_XP_TO_LEVEL + XP_PER_LEVEL * Math.max(0, level - 1);
}

export interface DerivedStats {
  sizeMultiplier: number;
  fovMultiplier: number;
  maxHp: number;
  regenPerSecond: number;
  bodyDamageShape: number;
  bodyDamageTank: number;
  bodyDamageProjectile: number;
  bulletSpeed: number;
  bulletSpeedMultiplier: number;
  bulletDamage: number;
  bulletHpMax: number;
  reloadTicks: number;
  reloadSeconds: number;
  moveSpeed: number;
}

export function computeDerivedStats(level: number, points: StatPoints): DerivedStats {
  const sizeMultiplier = 1 + SIZE_PER_LEVEL * Math.max(0, level - 1);
  const fovMultiplier = 1 + FOV_SCALE * Math.max(0, level - 1);
  const maxHp = baseMaxHpForLevel(level) + points.maxHealth * HP_PER_POINT;
  const regenPerSecond =
    (maxHp / 30) * (REGEN_BASE_FACTOR + REGEN_PER_POINT * points.healthRegen);
  const bodyBase = points.bodyDamage + BODY_DAMAGE_BASE;
  const bulletSpeedMultiplier = 1 + BULLET_SPEED_PER_POINT * points.bulletSpeed;
  const bulletSpeed = BASE_BULLET_SPEED * bulletSpeedMultiplier;
  const bulletDamageBase = BASE_BULLET_DAMAGE * (1 + BULLET_DAMAGE_PER_POINT * points.bulletDamage);
  const speedPenalty = 1 / (1 + Math.max(0, bulletSpeedMultiplier - 1) * HIGH_SPEED_DAMAGE_PENALTY);
  const bulletDamage = bulletDamageBase * speedPenalty;
  const bulletHpMax = BASE_BULLET_HP * (1 + BULLET_PENETRATION_PER_POINT * points.bulletPenetration);
  const reloadTicks = Math.ceil(BASE_RELOAD_TICKS * Math.pow(RELOAD_POINT_FACTOR, points.reload));
  const reloadSeconds = reloadTicks * TICK_DURATION;
  const levelSlowdown = Math.max(
    MIN_LEVEL_SPEED_MULTIPLIER,
    1 - LEVEL_SPEED_SLOWDOWN * Math.max(0, level - 1),
  );
  const moveSpeed = BASE_TANK_SPEED * levelSlowdown * (1 + SPEED_PER_POINT * points.movementSpeed);

  return {
    sizeMultiplier,
    fovMultiplier,
    maxHp,
    regenPerSecond,
    bodyDamageShape: bodyBase * BODY_DAMAGE_MULT_SHAPE,
    bodyDamageTank: bodyBase * BODY_DAMAGE_MULT_TANK,
    bodyDamageProjectile: bodyBase * BODY_DAMAGE_MULT_PROJECTILE,
    bulletSpeed,
    bulletSpeedMultiplier,
    bulletDamage,
    bulletHpMax,
    reloadTicks,
    reloadSeconds,
    moveSpeed,
  };
}

export function computeBulletHitDamage(
  bulletDamage: number,
  bulletHp: number,
  targetBaseDamage: number,
): number {
  if (bulletHp < targetBaseDamage) {
    return bulletDamage * (bulletHp / Math.max(1e-6, targetBaseDamage));
  }
  return bulletDamage;
}

export function impactMultiplierFromSpeed(speed: number): number {
  const ratio = Math.max(0, Math.min(1, speed / BASE_TANK_SPEED));
  return 1 + ratio * IMPACT_SPEED_BONUS;
}

export function xpForKill(kind: "square" | "triangle", maxHp: number): number {
  const base = Math.max(1, maxHp);
  const multiplier = SCORE_MULTIPLIER[kind] ?? 1;
  return Math.round(base * multiplier * XP_PER_HP);
}

export function scoreForKill(kind: "square" | "triangle", maxHp: number): number {
  const base = Math.max(1, maxHp);
  const multiplier = SCORE_MULTIPLIER[kind] ?? 1;
  return Math.round(base * multiplier * SCORE_PER_HP);
}
