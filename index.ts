import { Command } from "commander";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import parsable from "@/commands/parsable";
import safeScope from "@/commands/safe-scope";
import expandArray from "@/commands/expand-array";
import preEvaluate from "@/commands/pre-evaluate";
import { showCredit } from "@/utils/cli/showCredit";
import { readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

console.log(showCredit(pkg.version));
console.log();

const program = new Command();

program
	.name("expose")
	.description("CLI for Deobfuscating")
	.version(
		chalk.bold("It's written above, lol"),
		"-v, --version",
		"display version number",
	);

const commands = [parsable, safeScope, expandArray, preEvaluate];

for (const command of commands) {
	command(program);
}

program.parse();
