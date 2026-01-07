(() => {
	const _0x1 = "a|b|c".split("|");
	let _0x2 = 0;

	while (true) {
		switch (_0x1[_0x2++]) {
			case "a":
				console.log("while-a");
				continue;
			case "b":
				console.log("while-b");
				continue;
		case "c":
			console.log("while-c");
		}
		break;
	}

	const _0x3 = "x|y|z".split("|");
	for (let _0x4 = 0;;) {
		switch (_0x3[_0x4++]) {
			case "x":
				console.log("for-x");
				continue;
			case "y":
				console.log("for-y");
				continue;
			case "z":
				console.log("for-z");
				return;
		}
		break;
	}
})();
