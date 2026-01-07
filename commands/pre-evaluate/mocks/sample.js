const a = 1;
const b = 2;
const c = a + b;
const d = a + 10;
const e = "hello" + " " + "world";
const f = "x" + b;
const g = -b;
const h = (a + b) * 2;
const i = ("x");
const j = ~1;
function getArray() {
  const p = [0, 1, 2];
  return p;
}
const arr = getArray();
const obj = { a };
const obj2 = { b: a, c: b + 1 };
let x = 3;
const y = x + 1;
const z = 0x3988592 ^ 0x12345678 & 0x12345678;
console.log(c, d, e, f, g, h, i, j, arr[0], arr[3], obj, obj2, y, z);
