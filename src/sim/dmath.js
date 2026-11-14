// Deterministic maths for the simulation.
//
// JavaScript leaves Math.sin, cos, atan2, exp and hypot "implementation-approximated":
// Chrome, Firefox and Safari may round them differently in the last bit, and over
// thousands of ticks a last bit becomes a different fight. A Weekly Echo run is
// checked by replaying it on a server, so the simulation must compute exactly the
// same numbers in every browser.
//
// These versions use only + - * / (exact IEEE 754 in every engine; JavaScript never
// fuses them), Math.round / Math.floor / Math.abs (exact) and Math.sqrt (correctly
// rounded square root, the hardware instruction everywhere). They follow the classic
// fdlibm algorithms and agree with Math.* to about 1e-16, so nothing feels different.
// The renderer may keep using Math.*: only the simulation needs this.

const PIO2_1 = 1.57079632673412561417e0; // first 33 bits of pi/2
const PIO2_1T = 6.07710050650619224932e-11; // pi/2 - PIO2_1
const INV_PIO2 = 6.36619772367581382433e-1; // 2/pi

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kSin(r) {
  const z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}
function kCos(r) {
  const z = r * r;
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}
/** x = n * pi/2 + r with |r| <= pi/4; returns [n mod 4, r]. Good for |x| up to about 1e6. */
function reduce(x) {
  const n = Math.round(x * INV_PIO2);
  const r = x - n * PIO2_1 - n * PIO2_1T;
  return [((n % 4) + 4) % 4, r];
}

export function dSin(x) {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < 0.7853981633974483) return kSin(x);
  const [q, r] = reduce(x);
  return q === 0 ? kSin(r) : q === 1 ? kCos(r) : q === 2 ? -kSin(r) : -kCos(r);
}

export function dCos(x) {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < 0.7853981633974483) return kCos(x);
  const [q, r] = reduce(x);
  return q === 0 ? kCos(r) : q === 1 ? -kSin(r) : q === 2 ? -kCos(r) : kSin(r);
}

const ATANHI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800e0];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2,
];

export function dAtan(x) {
  if (Number.isNaN(x)) return NaN;
  const neg = x < 0;
  let ax = Math.abs(x);
  if (ax >= 7.378697629483821e19) return neg ? -ATANHI[3] : ATANHI[3]; // 2^66
  let id = -1;
  if (ax < 0.4375) {
    if (ax < 1.862645149230957e-9) return x; // 2^-29
  } else if (ax < 1.1875) {
    if (ax < 0.6875) {
      id = 0;
      ax = (2 * ax - 1) / (2 + ax);
    } else {
      id = 1;
      ax = (ax - 1) / (ax + 1);
    }
  } else if (ax < 2.4375) {
    id = 2;
    ax = (ax - 1.5) / (1 + 1.5 * ax);
  } else {
    id = 3;
    ax = -1 / ax;
  }
  const z = ax * ax;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) {
    const v = ax - ax * (s1 + s2);
    return neg ? -v : v;
  }
  const v = ATANHI[id] - (ax * (s1 + s2) - ATANLO[id] - ax);
  return neg ? -v : v;
}

const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;

export function dAtan2(y, x) {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  // Zeros and infinities: the language defines these results exactly, so Math is safe here.
  if (y === 0 || x === 0 || !Number.isFinite(x) || !Number.isFinite(y)) return Math.atan2(y, x);
  const a = dAtan(Math.abs(y / x));
  if (x > 0) return y > 0 ? a : -a;
  return y > 0 ? PI - (a - PI_LO) : (a - PI_LO) - PI;
}

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e0;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;

/** 2^k for an integer k, by exact doubling and halving. */
function pow2(k) {
  let v = 1;
  if (k > 0) for (let i = 0; i < k; i++) v *= 2;
  else for (let i = 0; i < -k; i++) v *= 0.5;
  return v;
}

export function dExp(x) {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  if (Math.abs(x) < 3.725290298461914e-9) return 1 + x; // 2^-28
  const k = Math.round(x * INV_LN2);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  if (k < -1020) return y * pow2(k + 1000) * pow2(-1000); // stay out of denormals until the end
  return y * pow2(k);
}

/** sqrt(x*x + y*y). Plenty for distances in a game world. */
export function dHypot(x, y) {
  return Math.sqrt(x * x + y * y);
}
