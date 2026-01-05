let x = 810;
((x) => {
	x += 1;
	console.log(x);
	try {
		throw new Error("test");
	} catch (x) {
		x = 2;
		console.log(x);

		for (let x = 0; x < 3; x++) {
			x += 1;
			console.log(x);
			noop((x = x), console.log(x));
			console.log([][x]);
			console.log([]?.[x]);
		}
	}
})(0);

noop((x = 114514), console.log(x));

function noop() {
	return;
}

noop(
	(x = 3),
	((x) => {
		console.log(x);
	})(222),
	console.log(x),
);

console.log(x);
