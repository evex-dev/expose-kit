const obj = {
  a: 1,
  b: 2,
  c: "x",
  truthy: true,
  nil: null,
  undef: undefined,
  func: () => 3,
  1: "one"
};
const dynamicKey = "b";
const a = 1 + 2;
const b = 2;
const c = "x";
const d = true ? "yes" : "no";
const e = null;
const f = undefined;
const g = () => 3;
const h = "one";
const i = "one";
const j = obj[dynamicKey];
const k = obj.missing;
const o = 1;
const p = 1 * 2;
function demo() {
  const obj = {
    a: "shadow"
  };
  return obj.a;
}
console.log(a, b, c, d, e, f, g(), h, i, j, k, o, p, demo());