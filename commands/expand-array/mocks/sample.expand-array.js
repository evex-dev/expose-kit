const a = [0, 1, -2, "x", true, null, undefined, () => 0];
const b = 0 + -2;
const c = "x";
const d = true ? "yes" : "no";
const e = null;
const f = undefined;
const g = () => 0;
const h = a[-1];
const k = 1;
const l = 1 * 2;
const m = 1;
const n = a[8];
function demo() {
  const a = ["shadow"];
  return a[0];
}
console.log(b, c, d, e, f, g(), h, k, l, m, n, demo());