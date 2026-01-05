import { Command } from "commander";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import parsable from "@/commands/parsable";
import { showCredit } from "@/utils/cli/showCredit";
import pkg from "./package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
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

const commands = [parsable];

for (const command of commands) {
	command(program);
}

program.parse();
