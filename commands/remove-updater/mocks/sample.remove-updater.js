let a = 0;
a += 1;
+a;
a -= 1;
a -= 1;
const b = a++ + 1;
const c = ++a + 1;
for (let i = 0; i < 2; i += 1) {
  a += i;
}
for (let j = 0; j < 2; j += 1) {
  a += j;
}
console.log(a, b, c);