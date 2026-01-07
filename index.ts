import { Command } from "commander";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import parsable from "@/commands/parsable";
import safeScope from "@/commands/safe-scope";
import expandArray from "@/commands/expand-array";
import expandObject from "@/commands/expand-object";
import objectPacker from "@/commands/object-packer";
import preEvaluate from "@/commands/pre-evaluate";
import removeUpdater from "@/commands/remove-updater";
import removeReassign from "@/commands/remove-reassign";
import removeUnused from "@/commands/remove-unused";
import removeDeadcode from "@/commands/remove-deadcode";
import controlFlowPacker from "@/commands/control-flow-packer";
import fnInliner from "@/commands/fn-inliner";
import sequenceSplit from "@/commands/sequence-split";
import { showCredit } from "@/utils/cli/showCredit";
import { readFileSync } from "node:fs";
import updateNotifier from 'update-notifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const notifier = updateNotifier({
	pkg,
	updateCheckInterval: 1000 * 60 * 60 * 24 * 3 // 3 days
});

console.log(showCredit(pkg.version, notifier.update));
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

const commands = [
	parsable,
	safeScope,
	expandArray,
	expandObject,
	objectPacker,
	preEvaluate,
	removeUpdater,
	removeReassign,
	removeDeadcode,
	controlFlowPacker,
	fnInliner,
	removeUnused,
	sequenceSplit,
];

for (const command of commands) {
	command(program);
}

program.parse();
