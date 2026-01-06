export function diff(before: string, after: string): number[] {
	const b = before.split(/\r?\n/);
	const a = after.split(/\r?\n/);

	const n = b.length;
	const m = a.length;

	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		Array(m + 1).fill(0),
	);

	for (let i = 0; i < n; i++) {
		for (let j = 0; j < m; j++) {
			if (b[i] === a[j]) {
				(dp[i + 1] || [])[j + 1] = (dp[i]?.[j] ?? 0) + 1;
			} else {
				(dp[i + 1] || [])[j + 1] = Math.max(
					dp[i]?.[j + 1] ?? 0,
					dp[i + 1]?.[j] ?? 0,
				);
			}
		}
	}

	// backtrack
	const changed: number[] = [];
	let i = n;
	let j = m;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && b[i - 1] === a[j - 1]) {
			i--;
			j--;
			continue;
		}

		if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
			changed.push(j); // 1-based
			j--;
		} else {
			i--;
		}
	}

	return changed.reverse();
}
