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

const rainbow = (text: string) => {
	return text
		.split("")
		.map((char, index) => {
			return chalk.rgb(255 - index * 50, index * 50, 0)(char);
		})
		.join("");
};

const showCredit = (VERSION: string) => beautify`
${rainbow("Expose JS")} v${VERSION}
`;

console.log(showCredit("0.0.1"));
