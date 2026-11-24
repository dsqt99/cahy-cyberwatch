const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cropPng } = require('../src/capture/png-crop');
const { cleanupOldScreenshots } = require('../src/capture');

function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}
// RGBA image where pixel (x,y) = [x, y, 7, 255]
function makePng(w, h) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) raw.set([x, y, 7, 255], y * (w * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('cropPng returns the requested pixel region and clamps to bounds', () => {
  const out = cropPng(makePng(20, 10), { x: 5, y: 2, width: 4, height: 3 });
  const ihdr = out.subarray(16, 29);
  assert.strictEqual(ihdr.readUInt32BE(0), 4);
  assert.strictEqual(ihdr.readUInt32BE(4), 3);
  // decode first pixel of IDAT
  const idatLen = out.readUInt32BE(33);
  const raw = zlib.inflateSync(out.subarray(41, 41 + idatLen));
  assert.deepStrictEqual([...raw.subarray(1, 5)], [5, 2, 7, 255]);

  const clamped = cropPng(makePng(20, 10), { x: 18, y: 8, width: 100, height: 100 });
  assert.strictEqual(clamped.subarray(16, 29).readUInt32BE(0), 2);
  assert.strictEqual(clamped.subarray(16, 29).readUInt32BE(4), 2);
  assert.strictEqual(cropPng(Buffer.from('png'), { x: 0, y: 0, width: 1, height: 1 }).toString(), 'png');
});

test('cleanupOldScreenshots removes only old images and is off at 0 days', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-'));
  fs.mkdirSync(path.join(dir, 'a'));
  const oldF = path.join(dir, 'a', 'old.png');
  const newF = path.join(dir, 'a', 'new.png');
  fs.writeFileSync(oldF, 'x'); fs.writeFileSync(newF, 'x');
  const past = new Date(Date.now() - 40 * 86400000);
  fs.utimesSync(oldF, past, past);
  assert.strictEqual(cleanupOldScreenshots(dir, 0), 0);
  assert.strictEqual(cleanupOldScreenshots(dir, 30), 1);
  assert.ok(!fs.existsSync(oldF) && fs.existsSync(newF));
});
