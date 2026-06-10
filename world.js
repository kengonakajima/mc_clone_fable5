import { fbm2, fbm3 } from './noise.js';

export const CHUNK_X = 16;
export const CHUNK_Y = 128;
export const CHUNK_Z = 16;
export const SEED = 1234;
export const SEA_LEVEL = 56;

export const BLOCK = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5 };

// "cx,cz" -> Uint8Array(CHUNK_X * CHUNK_Y * CHUNK_Z)
export const chunks = new Map();

// "cx,cz" -> Uint8Array(同サイズ)。水ブロックの水位 (0=水源 .. 7=末端)。水以外の場所の値は無意味
export const waterLevels = new Map();

export function chunkKey(cx, cz) {
  return cx + ',' + cz;
}

export function blockIndex(x, y, z) {
  return (x * CHUNK_Z + z) * CHUNK_Y + y;
}

export function terrainHeight(wx, wz) {
  const n = fbm2(wx * 0.01, wz * 0.01, SEED, 4);
  return Math.floor(30 + n * 50); // 30..80
}

export function generateChunk(cx, cz) {
  const data = new Uint8Array(CHUNK_X * CHUNK_Y * CHUNK_Z);
  for (let x = 0; x < CHUNK_X; x++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      const wx = cx * CHUNK_X + x;
      const wz = cz * CHUNK_Z + z;
      const h = terrainHeight(wx, wz);
      const sandy = h <= SEA_LEVEL + 1; // 水際と水底は砂にする
      for (let y = 0; y <= h; y++) {
        // 洞窟: 3D ノイズが閾値を超えた所をくり抜く。水中の柱と最下段は掘らない
        if (!sandy && y > 0 && fbm3(wx * 0.06, y * 0.06, wz * 0.06, SEED + 999, 3) > 0.62) continue;
        let b = BLOCK.STONE;
        if (y === h) b = sandy ? BLOCK.SAND : BLOCK.GRASS;
        else if (y >= h - 3) b = sandy ? BLOCK.SAND : BLOCK.DIRT;
        data[blockIndex(x, y, z)] = b;
      }
      for (let y = h + 1; y <= SEA_LEVEL; y++) {
        data[blockIndex(x, y, z)] = BLOCK.WATER;
      }
    }
  }
  chunks.set(chunkKey(cx, cz), data);
  waterLevels.set(chunkKey(cx, cz), new Uint8Array(CHUNK_X * CHUNK_Y * CHUNK_Z));
  return data;
}

export function getBlock(wx, wy, wz) {
  if (wy < 0 || wy >= CHUNK_Y) return BLOCK.AIR;
  const cx = Math.floor(wx / CHUNK_X);
  const cz = Math.floor(wz / CHUNK_Z);
  const c = chunks.get(chunkKey(cx, cz));
  if (!c) return BLOCK.AIR;
  return c[blockIndex(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z)];
}

export function setWater(wx, wy, wz, level) {
  if (wy < 0 || wy >= CHUNK_Y) return;
  const cx = Math.floor(wx / CHUNK_X);
  const cz = Math.floor(wz / CHUNK_Z);
  const c = chunks.get(chunkKey(cx, cz));
  if (!c) return;
  const i = blockIndex(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z);
  c[i] = BLOCK.WATER;
  waterLevels.get(chunkKey(cx, cz))[i] = level;
}

export function setAir(wx, wy, wz) {
  if (wy < 0 || wy >= CHUNK_Y) return;
  const cx = Math.floor(wx / CHUNK_X);
  const cz = Math.floor(wz / CHUNK_Z);
  const c = chunks.get(chunkKey(cx, cz));
  if (!c) return;
  c[blockIndex(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z)] = BLOCK.AIR;
}

export function getWaterLevel(wx, wy, wz) {
  if (wy < 0 || wy >= CHUNK_Y) return 0;
  const cx = Math.floor(wx / CHUNK_X);
  const cz = Math.floor(wz / CHUNK_Z);
  const lv = waterLevels.get(chunkKey(cx, cz));
  if (!lv) return 0;
  return lv[blockIndex(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z)];
}
