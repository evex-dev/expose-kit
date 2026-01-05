const a = [0, 1, -2, "x", true, null, undefined, () => {}];
const b = 0 + -2;
const c = "x";
const d = true ? "yes" : "no";
const e = null;

// side effects
// const beast = (mr) => console.log(mr);
// beast(a);

const f = undefined;
const g = () => {};
const h = a[-1];
const i = ++a[1];
const i2 = a[1]++;
const j = a[1] += 2;
const k = a[1];
const l = a[1] * 2;
const m = a["1"];
const n = a[8];
function demo() {
  const a = ["shadow"];
  return a[0];
}
console.log(b, c, d, e, f, g, h, i, i2, j, k, l, m, n, demo());