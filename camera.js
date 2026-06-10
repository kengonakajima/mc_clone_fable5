// フライカメラの状態と 4x4 行列(column-major Float32Array)

export const cam = {
  x: 0.5, y: 1.5, z: 4.0,
  yaw: 0,    // 0 で -Z 方向、右に回すと増える
  pitch: 0,  // 上を向くと増える
};

export function mat4Perspective(fovyRad, aspect, near, far) {
  const f = 1 / Math.tan(fovyRad / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function camForward() {
  const cp = Math.cos(cam.pitch);
  return [
    cp * Math.sin(cam.yaw),
    Math.sin(cam.pitch),
    -cp * Math.cos(cam.yaw),
  ];
}

export function camViewMatrix() {
  const [fx, fy, fz] = camForward();
  // right = normalize(cross(forward, worldUp))
  const rx = Math.cos(cam.yaw);
  const ry = 0;
  const rz = Math.sin(cam.yaw);
  // up = cross(right, forward)
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const m = new Float32Array(16);
  m[0] = rx; m[4] = ry; m[8] = rz;
  m[1] = ux; m[5] = uy; m[9] = uz;
  m[2] = -fx; m[6] = -fy; m[10] = -fz;
  m[12] = -(rx * cam.x + ry * cam.y + rz * cam.z);
  m[13] = -(ux * cam.x + uy * cam.y + uz * cam.z);
  m[14] = fx * cam.x + fy * cam.y + fz * cam.z;
  m[15] = 1;
  return m;
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
