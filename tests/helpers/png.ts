import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface Rgba {
  w: number;
  h: number;
  data: Uint8Array;
}

/** Minimal PNG reader (8-bit, non-interlaced; gray, RGB, RGBA, palette) so tests can look at atlas pixels. */
export function readPng(path: string | URL): Rgba {
  const buf = readFileSync(path);
  let pos = 8;
  let w = 0;
  let h = 0;
  let depth = 8;
  let type = 6;
  let palette: Uint8Array = new Uint8Array(0);
  let trns: Uint8Array = new Uint8Array(0);
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const tag = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (tag === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8] ?? 8;
      type = body[9] ?? 6;
      if (body[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (tag === 'PLTE') palette = new Uint8Array(body);
    else if (tag === 'tRNS') trns = new Uint8Array(body);
    else if (tag === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit PNG supported');
  const channels = type === 6 ? 4 : type === 2 ? 3 : type === 4 ? 2 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i++) {
      const cur = raw[y * (stride + 1) + 1 + i] ?? 0;
      const left = i >= channels ? (px[y * stride + i - channels] ?? 0) : 0;
      const up = y > 0 ? (px[(y - 1) * stride + i] ?? 0) : 0;
      const ul = y > 0 && i >= channels ? (px[(y - 1) * stride + i - channels] ?? 0) : 0;
      let v = cur;
      if (f === 1) v += left;
      else if (f === 2) v += up;
      else if (f === 3) v += (left + up) >> 1;
      else if (f === 4) {
        const pa = Math.abs(up - ul);
        const pb = Math.abs(left - ul);
        const pc = Math.abs(left + up - 2 * ul);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
      }
      px[y * stride + i] = v & 255;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (type === 6) for (let c = 0; c < 4; c++) data[i * 4 + c] = px[i * 4 + c] ?? 0;
    else if (type === 2) {
      for (let c = 0; c < 3; c++) data[i * 4 + c] = px[i * 3 + c] ?? 0;
      data[i * 4 + 3] = 255;
    } else if (type === 3) {
      const idx = px[i] ?? 0;
      for (let c = 0; c < 3; c++) data[i * 4 + c] = palette[idx * 3 + c] ?? 0;
      data[i * 4 + 3] = trns[idx] ?? 255;
    } else {
      const g = px[i * channels] ?? 0;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g;
      data[i * 4 + 3] = channels === 2 ? (px[i * 2 + 1] ?? 255) : 255;
    }
  }
  return { w, h, data };
}
