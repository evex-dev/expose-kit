let a = 0;
a++;
+a;
a--;
--a;
const b = a++ + 1;
const c = ++a + 1;
for (let i = 0; i < 2; i++) {
	a += i;
}
for (let j = 0; j < 2; ++j) {
	a += j;
}
console.log(a, b, c);
