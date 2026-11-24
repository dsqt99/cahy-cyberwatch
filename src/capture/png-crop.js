// Pure-Node PNG cropper (zero native/Electron dependencies) using built-in zlib.
// Supports 8-bit non-interlaced PNGs (Grayscale, RGB, Grayscale+Alpha, RGBA).
const zlib = require('zlib');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BPP_BY_COLOR = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    const inRow = y * (stride + 1);
    const outRow = y * stride;
    const filter = raw[inRow];
    for (let i = 0; i < stride; i++) {
      const x = raw[inRow + 1 + i];
      const a = i >= bpp ? out[outRow + i - bpp] : 0;
      const b = y > 0 ? out[outRow - stride + i] : 0;
      const c = y > 0 && i >= bpp ? out[outRow - stride + i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 0xff;
      else if (filter === 2) val = (x + b) & 0xff;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) val = (x + paeth(a, b, c)) & 0xff;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`);
      out[outRow + i] = val;
    }
  }
  return out;
}

/**
 * Crop a PNG buffer to { x, y, width, height }.
 * Falls back to returning the original buffer if it is not a valid PNG.
 */
function cropPng(pngBuffer, rect) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 33 || !pngBuffer.subarray(0, 8).equals(PNG_SIG)) {
    return pngBuffer;
  }

  let ihdr = null;
  const idatChunks = [];
  let off = 8;
  while (off + 8 <= pngBuffer.length) {
    const len = pngBuffer.readUInt32BE(off);
    const type = pngBuffer.subarray(off + 4, off + 8).toString('ascii');
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > pngBuffer.length) break;
    const data = pngBuffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idatChunks.push(data);
    else if (type === 'IEND') break;
    off = dataEnd + 4;
  }

  if (!ihdr || ihdr.length < 13 || idatChunks.length === 0) return pngBuffer;

  const imgW = ihdr.readUInt32BE(0);
  const imgH = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  const bpp = BPP_BY_COLOR[colorType];
  if (bitDepth !== 8 || !bpp || interlace !== 0) {
    throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`);
  }

  const x = Math.max(0, Math.min(imgW - 1, Math.round(rect?.x || 0)));
  const y = Math.max(0, Math.min(imgH - 1, Math.round(rect?.y || 0)));
  const w = Math.max(1, Math.min(imgW - x, Math.round(rect?.width || imgW)));
  const h = Math.max(1, Math.min(imgH - y, Math.round(rect?.height || imgH)));

  if (x === 0 && y === 0 && w === imgW && h === imgH) return pngBuffer;

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = unfilter(raw, imgW, imgH, bpp);

  const srcStride = imgW * bpp;
  const dstStride = w * bpp;
  const outRaw = Buffer.allocUnsafe(h * (dstStride + 1));
  for (let row = 0; row < h; row++) {
    const dstOff = row * (dstStride + 1);
    outRaw[dstOff] = 0; // filter: None
    const srcOff = (y + row) * srcStride + x * bpp;
    pixels.copy(outRaw, dstOff + 1, srcOff, srcOff + dstStride);
  }

  const newIhdr = Buffer.from(ihdr);
  newIhdr.writeUInt32BE(w, 0);
  newIhdr.writeUInt32BE(h, 4);

  const compressed = zlib.deflateSync(outRaw, { level: 6 });
  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', newIhdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { cropPng };
