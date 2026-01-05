import chalk from "chalk";
import readline from "node:readline";

const PREFIX = chalk.bold(chalk.gray("?"));
// polyfill for nodejs
const _prompt =
  "prompt" in globalThis
    ? globalThis.prompt
    : (question: string, defaultValue?: string): Promise<string | null> => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        return new Promise((resolve) => {
          const q = defaultValue
            ? `${question} (${defaultValue}): `
            : `${question}: `;

          rl.question(q, (answer) => {
            rl.close();
            resolve(answer || defaultValue || "");
          });
        });
      };

export const createPrompt = async (...args: Parameters<typeof _prompt>) => {
  const question = args.shift();
  if (!question) {
    throw new Error("Question is required");
  }
  const defaultAnswer = args.shift();
  const answer = defaultAnswer
    ? _prompt(`${PREFIX} ${question}`, defaultAnswer)
    : _prompt(`${PREFIX} ${question}`);
  return await answer;
};
