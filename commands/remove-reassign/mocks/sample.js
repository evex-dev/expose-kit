const a = 0;
const b = a;
const c = b;

function base(x) {
	return x + 1;
}

const d = { 0: "zero", 1: "one" };

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

const log = callBase(0);
const log2 = accessD(1);
const obj = { b };
console.log(c, log, log2, demo(), obj);
