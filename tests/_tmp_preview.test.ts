import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { PixBuffer } from '../src/core/pixelart';
import {
  cagePixels, crystalPixels, dragonPixels, eggPixels, pillarPixels, portalFramePixels, starfieldPixels,
} from '../src/render/endSprites';

const OUT = '/tmp/claude-0/-home-user-MinecraftSurvivor/74add153-26c0-588e-aacc-8787347bdfd4/scratchpad/prev/';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** Compose buffers on a dark background at integer scale. */
function sheet(name: string, items: PixBuffer[], scale = 3, bg = [20, 14, 30]): void {
  const pad = 6;
  const w = items.reduce((a, b) => a + b.w + pad, pad);
  const h = Math.max(...items.map((b) => b.h)) + pad * 2;
  const W = w * scale;
  const H = h * scale;
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i*4]=bg[0]!; out[i*4+1]=bg[1]!; out[i*4+2]=bg[2]!; out[i*4+3]=255; }
  let ox = pad;
  for (const b of items) {
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const c = b.data[y*b.w+x] ?? 0;
      const a = c >>> 24;
      if (a === 0) continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const px = ((pad + y) * scale + sy) * W + (ox + x) * scale + sx;
        out[px*4] = c & 255; out[px*4+1] = (c>>>8)&255; out[px*4+2] = (c>>>16)&255; out[px*4+3]=255;
      }
    }
    ox += b.w + pad;
  }
  writeFileSync(OUT + name, png(W, H, out));
}
it('preview', () => {
  sheet('dragon.png', [
    dragonPixels({ flap: 1, mode: 'fly', mouth: false, tail: 0 }),
    dragonPixels({ flap: 0, mode: 'fly', mouth: true, tail: 0.5 }),
  ], 2);
  sheet('dragon2.png', [
    dragonPixels({ flap: 0.5, mode: 'dive', mouth: false, tail: 0 }),
    dragonPixels({ flap: 0.5, mode: 'perch', mouth: false, tail: 0 }),
  ], 2);
  sheet('misc.png', [
    pillarPixels(), crystalPixels(0), crystalPixels(1), crystalPixels(2), crystalPixels(3), cagePixels(), eggPixels(), portalFramePixels(true), portalFramePixels(false), starfieldPixels(2),
  ], 4);
});
