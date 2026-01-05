export function diff(before: string, after: string, lookahead = 3) {
	const b = before.split(/\r?\n/);
	const a = after.split(/\r?\n/);

	const changed: number[] = [];
	let i = 0,
		j = 0;

	while (i < b.length || j < a.length) {
		if (b[i] === a[j]) {
			i++;
			j++;
			continue;
		}

		let matched = false;

		for (let k = 1; k <= lookahead; k++) {
			if (b[i] === a[j + k]) {
				changed.push(j + 1);
				j += k;
				matched = true;
				break;
			}
		}

		if (!matched) {
			for (let k = 1; k <= lookahead; k++) {
				if (b[i + k] === a[j]) {
					changed.push(j + 1);
					i += k;
					matched = true;
					break;
				}
			}
		}

		if (!matched) {
			changed.push(j + 1);
			i++;
			j++;
		}
	}

	return [...new Set(changed)];
}
