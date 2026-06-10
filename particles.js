import { createProgram } from './gl.js';

// --- 水しぶきパーティクル ---
// 着水点から白い粒を放出し、重力で落として短時間で消す。gl.POINTS で1ドローコール

const PVS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aSize;  // ワールド単位の粒の大きさ
layout(location = 2) in float aAlpha;
uniform mat4 uVP;
uniform float uPointScale; // 画面高さに応じた係数
out float vAlpha;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = aSize * uPointScale / gl_Position.w;
  vAlpha = aAlpha;
}
`;

const PFS = `#version 300 es
precision mediump float;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard; // 丸い粒にする
  outColor = vec4(1.0, 1.0, 1.0, vAlpha);
}
`;

const SPAWN_RATE = 12;     // 1発生点 (辺) あたりの毎秒発生数
const GRAVITY = 12;
const MAX_PARTICLES = 3000;

let prog, uVP, uPointScale, vao, vbo;
const particles = []; // { x,y,z, vx,vy,vz, life, maxLife, size }

export function initParticles(gl) {
  prog = createProgram(gl, PVS, PFS);
  uVP = gl.getUniformLocation(prog, 'uVP');
  uPointScale = gl.getUniformLocation(prog, 'uPointScale');
  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
  gl.bindVertexArray(null);
}

export function updateParticles(dt, splashPoints) {
  // 既存の粒を動かし、寿命切れを除去 (末尾と入れ替えて pop)
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }
    p.vy -= GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }
  // 発生点 (落水柱の足元の辺) から、辺に沿って散らし外向きに弾けさせる
  for (const p of splashPoints) {
    if (particles.length >= MAX_PARTICLES) break;
    let n = SPAWN_RATE * dt;
    while (n > 0) {
      if (Math.random() < n) {
        const t = (Math.random() - 0.5) * 0.9; // 辺方向のばらつき (辺は (dz,dx) 方向)
        const out = 0.3 + Math.random() * 0.8;  // 外向きの初速
        particles.push({
          x: p.x + p.dz * t,
          y: p.y,
          z: p.z + p.dx * t,
          vx: p.dx * out + p.dz * (Math.random() - 0.5) * 0.8,
          vy: 1.2 + Math.random() * 1.8,
          vz: p.dz * out + p.dx * (Math.random() - 0.5) * 0.8,
          life: 0.3 + Math.random() * 0.4,
          maxLife: 0.7,
          size: 0.08 + Math.random() * 0.12,
        });
      }
      n -= 1;
    }
  }
}

export function drawParticles(gl, vp, canvasHeight) {
  if (particles.length === 0) return;
  const data = new Float32Array(particles.length * 5);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    data[i * 5] = p.x;
    data[i * 5 + 1] = p.y;
    data[i * 5 + 2] = p.z;
    data[i * 5 + 3] = p.size;
    data[i * 5 + 4] = Math.min(1, p.life / 0.25) * 0.9; // 残り 0.25 秒でフェードアウト
  }
  gl.useProgram(prog);
  gl.uniformMatrix4fv(uVP, false, vp);
  gl.uniform1f(uPointScale, canvasHeight * 0.7);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.drawArrays(gl.POINTS, 0, particles.length);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}
