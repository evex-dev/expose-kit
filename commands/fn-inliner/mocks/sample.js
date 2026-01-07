function add(a, b) {
  return a + b;
}

const double = (x) => x * 2;
const calc = (x, y) => x + y * 3;

const notProxy = (x) => {
  const y = x + 1;
  return y;
};

const withAssign = (x) => (x = 1);
const pick = (a) => obj.a;

const sum = add(1, 2);
const doubled = double(sum);
const mixed = calc(4, 5);
const untouched = notProxy(9);
const notInlined = withAssign(8);

const obj = { a: 7 };
const propValue = pick(10);

console.log(sum, doubled, mixed, untouched, notInlined, propValue);
