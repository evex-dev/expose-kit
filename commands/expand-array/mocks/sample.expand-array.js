const a = [0, 1, -2, "x", true, null, undefined];
const b = 0 + -2;
const c = "x";
const d = true ? "yes" : "no";
const e = null;
const f = undefined;
const g = a[7];
const h = a[-1];
const i = ++a[1];
const i2 = a[1]++;
const j = a[1] += 2;
const k = 1;
const l = 1 * 2;
const m = 1;
function demo() {
  const a = ["shadow"];
  return a[0];
}
console.log(b, c, d, e, f, g, h, i, i2, j, k, l, m, demo());