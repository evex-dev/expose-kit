const a = 0;
const b = a;
const c = a;
function base(x) {
  return x + 1;
}
const d = {
  0: "zero",
  1: "one"
};
function callBase(arg) {
  return base(arg);
}
function accessD(arg) {
  return d[arg];
}
function demo() {
  const a = 9;
  return c + a;
}
const log = base(0);
const log2 = d[1];
const obj = {
  b: a
};
console.log(a, log, log2, demo(), obj);