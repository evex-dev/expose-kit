import chalk from "chalk";

// `\naaa\n` => `aaa`
const beautify = <T>(strings: TemplateStringsArray, ...values: T[]) => {
	let result = "";
	for (let i = 0; i < strings.length; i++) {
		result += strings[i];
		if (i < values.length) {
			result += values[i];
		}
	}
	result = result.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
	return result;
};

const isNoColor = () => {
	return (
		Bun.env.NO_COLOR !== undefined && Bun.argv.includes("--no-color")
	);
};

const calmGradienrain = (text: string) => {
	if (isNoColor()) {
		return text;
	}

	const startHue = 210;
	const endHue = 300;
	const saturation = 0.45;
	const value = 0.8;

	const ease = (t: number) => t * t * (3 - 2 * t);

	return text
		.split("")
		.map((char, i) => {
			const t = ease(i / Math.max(text.length - 1, 1));
			const hue = startHue + (endHue - startHue) * t;

			const c = value * saturation;
			const h = hue / 60;
			const x = c * (1 - Math.abs((h % 2) - 1));
			const m = value - c;

			let r = 0,
				g = 0,
				b = 0;

			if (h < 1) [r, g, b] = [c, x, 0];
			else if (h < 2) [r, g, b] = [x, c, 0];
			else if (h < 3) [r, g, b] = [0, c, x];
			else if (h < 4) [r, g, b] = [0, x, c];
			else if (h < 5) [r, g, b] = [x, 0, c];
			else [r, g, b] = [c, 0, x];

			return chalk.rgb(
				Math.round((r + m) * 255),
				Math.round((g + m) * 255),
				Math.round((b + m) * 255),
			)(char);
		})
		.join("");
};

export const showCredit = (VERSION: string) => beautify`
${calmGradienrain(`Expose Kit v${VERSION}`)}
`;
