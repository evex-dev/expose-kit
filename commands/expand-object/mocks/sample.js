const obj = {
	a: 1,
	b: 2,
	c: "x",
	truthy: true,
	nil: null,
	undef: undefined,
	func: () => 3,
	1: "one",
};

const dynamicKey = "b";
const a = obj.a + obj.b;
const b = obj["b"];
const c = obj["c"];
const d = obj.truthy ? "yes" : "no";
const e = obj.nil;
const f = obj.undef;
const g = obj.func;
const h = obj[1];
const i = obj["1"];
const j = obj[dynamicKey];
const k = obj.missing;

const o = obj.a;
const p = obj.a * 2;

function demo() {
	const obj = { a: "shadow" };
	return obj.a;
}

console.log(a, b, c, d, e, f, g(), h, i, j, k, o, p, demo());
