const a = [0, 1, -2, "x", true, null, undefined];
const b = a[0] + a[2];
const c = a["3"];
const d = a[4] ? "yes" : "no";
const e = a[5];
const f = a[6];
const g = a[7];
const h = a[-1];
const i = ++a[1];
const i2 = a[1]++;
const j = (a[1] += 2);
const k = a[1];
const l = a[1] * 2;
const m = a["1"];

function demo() {
	const a = ["shadow"];
	return a[0];
}

console.log(b, c, d, e, f, g, h, i, i2, j, k, l, m, demo());
