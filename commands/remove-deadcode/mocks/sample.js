const cond = true;
let value = 0;

if (true) {
	value += 1;
}

if (false) {
	value += 2;
} else {
	value += 3;
}

if ("") {
	value += 4;
} else {
	value += 5;
}

if ([]) {
	value += 6;
}

if ({}) {
	value += 7;
}

const a = true ? "yes" : "no";
const b = false ? "no" : "yes";
const c = cond ? true : false;
const d = cond ? false : true;
const e = cond ? true : true;
const f = cond ? false : false;
const g = [] ? 1 : 2;

console.log(value, a, b, c, d, e, f, g);
