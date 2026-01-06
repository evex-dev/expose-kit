const a = [0, 1, -2, "x", true, null, undefined, () => 0];
const b = a[0] + a[2];
const c = a["3"];
const d = a[4] ? "yes" : "no";

const e = a[5];

const f = a[6];
const g = a[7];
const h = a[-1];
const k = a[1];
const l = a[1] * 2;
const m = a["1"];
const n = a[8];

function demo() {
  const a = ["shadow"];
  return a[0];
}

console.log(b, c, d, e, f, g(), h, k, l, m, n, demo());
