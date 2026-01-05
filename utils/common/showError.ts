import chalk from "chalk";

export const showError = (message: string) => {
	console.error(`${chalk.red("✖")} ${message}`);
};
