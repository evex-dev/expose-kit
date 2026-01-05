import chalk from "chalk";

const PREFIX = chalk.bold(chalk.gray("?"));

export const createPrompt = (...args: Parameters<typeof prompt>) => {
	const question = args.shift();
	if (!question) {
		throw new Error("Question is required");
	}
	const defaultAnswer = args.shift();
    const answer = defaultAnswer ? prompt(`${PREFIX} ${question}`, defaultAnswer) : prompt(`${PREFIX} ${question}`);
	return answer;
};
