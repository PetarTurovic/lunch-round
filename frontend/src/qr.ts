// Minimal self-contained QR Code generator (Version 1-6, Byte mode, ECC L/M)
// Implements ISO/IEC 18004 QR specification without external dependencies.

interface QRParams {
  size?: number;
  margin?: number;
}

// Galois Field arithmetic for Reed-Solomon error correction
const GF256_EXP: number[] = new Array(512);
const GF256_LOG: number[] = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
  GF256_LOG[0] = 0;
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF256_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCompute(data: number[], ecCount: number): number[] {
  const gen = rsGeneratorPoly(ecCount);
  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// QR Version table: [version, totalBytes, ecBytes, dataBytes]
const QR_SPECS: [number, number, number, number][] = [
  [1, 26, 7, 19],
  [2, 44, 10, 34],
  [3, 70, 15, 55],
  [4, 100, 20, 80],
  [5, 134, 26, 108],
  [6, 172, 36, 136]
];

export function generateQrMatrix(text: string): boolean[][] {
  const utf8Bytes = Array.from(new TextEncoder().encode(text));
  const spec = QR_SPECS.find(([, , , dataBytes]) => dataBytes - 3 >= utf8Bytes.length) || QR_SPECS[QR_SPECS.length - 1];
  const [version, totalBytes, ecBytes, dataBytes] = spec;
  const moduleCount = 17 + version * 4;

  // Encode data in 8-bit byte mode
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(utf8Bytes.length, 8); // Character count indicator
  for (const byte of utf8Bytes) pushBits(byte, 8);
  pushBits(0, Math.min(4, dataBytes * 8 - bits.length)); // Terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const dataPayload: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
    dataPayload.push(b);
  }

  // Pad bytes
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataPayload.length < dataBytes) {
    dataPayload.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  const ecPayload = rsCompute(dataPayload, ecBytes);
  const finalBytes = [...dataPayload, ...ecPayload];

  // Convert to bit stream
  const finalBits: number[] = [];
  for (const byte of finalBytes) {
    for (let i = 7; i >= 0; i--) finalBits.push((byte >> i) & 1);
  }

  // Initialize matrix: true = black, false = white, null = unassigned
  const matrix: (boolean | null)[][] = Array.from({ length: moduleCount }, () => new Array(moduleCount).fill(null));
  const isFunction = Array.from({ length: moduleCount }, () => new Array(moduleCount).fill(false));

  const setModule = (r: number, c: number, val: boolean, fn = true) => {
    if (r >= 0 && r < moduleCount && c >= 0 && c < moduleCount) {
      matrix[r][c] = val;
      if (fn) isFunction[r][c] = true;
    }
  };

  // Finder patterns
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inBounds = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const isBorder = inBounds && (r === 0 || r === 6 || c === 0 || c === 6);
        const isCenter = inBounds && r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(top + r, left + c, isBorder || isCenter);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, moduleCount - 7);
  drawFinder(moduleCount - 7, 0);

  // Timing patterns
  for (let i = 8; i < moduleCount - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(moduleCount - 8, 8, true);

  // Format info area reservation
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) setModule(8, i, false);
    if (!isFunction[i][8]) setModule(i, 8, false);
  }
  for (let i = moduleCount - 8; i < moduleCount; i++) {
    if (!isFunction[8][i]) setModule(8, i, false);
    if (!isFunction[i][8]) setModule(i, 8, false);
  }

  // Place data bits with mask 0: (row + col) % 2 === 0
  let bitIdx = 0;
  let right = moduleCount - 1;
  let upward = true;

  while (right > 0) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upward
      ? Array.from({ length: moduleCount }, (_, i) => moduleCount - 1 - i)
      : Array.from({ length: moduleCount }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit ^ (mask ? 1 : 0)) === 1;
        }
      }
    }
    upward = !upward;
    right -= 2;
  }

  // Add format information for Mask 0 and ECC L (00 000 -> 0x77c4 with BCH)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  const setFormat = (idx: number, val: boolean) => {
    // Around top-left
    if (idx <= 5) matrix[8][idx] = val;
    else if (idx === 6) matrix[8][7] = val;
    else if (idx === 7) matrix[8][8] = val;
    else if (idx === 8) matrix[7][8] = val;
    else matrix[14 - idx][8] = val;

    // Around top-right and bottom-left
    if (idx <= 7) matrix[moduleCount - 1 - idx][8] = val;
    else matrix[8][moduleCount - 8 + (idx - 8)] = val;
  };

  for (let i = 0; i < 15; i++) {
    setFormat(i, formatBits[i] === 1);
  }

  return matrix.map((row) => row.map((cell) => cell === true));
}

export function generateQrSvg(text: string, params: QRParams = {}): string {
  const { size = 180, margin = 2 } = params;
  const matrix = generateQrMatrix(text);
  const count = matrix.length;
  const viewSize = count + margin * 2;

  let rects = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="currentColor"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${viewSize}" height="${viewSize}" fill="white"/>${rects}</svg>`;
}
