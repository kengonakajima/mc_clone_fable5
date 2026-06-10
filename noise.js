// シード付き value noise + fBm

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 144665087);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // [0,1)
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise2(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const v00 = hash2(ix, iz, seed);
  const v10 = hash2(ix + 1, iz, seed);
  const v01 = hash2(ix, iz + 1, seed);
  const v11 = hash2(ix + 1, iz + 1, seed);
  const sx = smooth(fx);
  const sz = smooth(fz);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sz; // [0,1)
}

export function fbm2(x, z, seed, octaves) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, z * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // [0,1)
}

function hash3(ix, iy, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 2246822519) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 144665087);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // [0,1)
}

export function valueNoise3(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = smooth(fx);
  const sy = smooth(fy);
  const sz = smooth(fz);
  const v000 = hash3(ix, iy, iz, seed);
  const v100 = hash3(ix + 1, iy, iz, seed);
  const v010 = hash3(ix, iy + 1, iz, seed);
  const v110 = hash3(ix + 1, iy + 1, iz, seed);
  const v001 = hash3(ix, iy, iz + 1, seed);
  const v101 = hash3(ix + 1, iy, iz + 1, seed);
  const v011 = hash3(ix, iy + 1, iz + 1, seed);
  const v111 = hash3(ix + 1, iy + 1, iz + 1, seed);
  const a = v000 + (v100 - v000) * sx;
  const b = v010 + (v110 - v010) * sx;
  const c = v001 + (v101 - v001) * sx;
  const d = v011 + (v111 - v011) * sx;
  const e = a + (b - a) * sy;
  const f = c + (d - c) * sy;
  return e + (f - e) * sz; // [0,1)
}

export function fbm3(x, y, z, seed, octaves) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise3(x * freq, y * freq, z * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // [0,1)
}
