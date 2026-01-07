import { createCommand } from "@/utils/cli/createCommand";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parse } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import loading from "loading-cli";
import { createPrompt } from "@/utils/common/createPrompt";
import { createParseOptions } from "@/utils/babel/createParseOptions";
import { timeout } from "@/utils/common/timeout";
import { showError } from "@/utils/common/showError";
import { patchDefault } from "@/utils/babel/patchDefault";
import { diff } from "@/utils/common/diff";

const createDefaultOutputPath = (inputPath: string) => {
	const ext = extname(inputPath);
	if (!ext) {
		return `${inputPath}.remove-updater.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.remove-updater${ext}`);
};

const isSafeStandaloneUpdate = (path: NodePath<t.UpdateExpression>) => {
	const parent = path.parentPath;
	if (!parent) return false;
	if (parent.isExpressionStatement()) return true;
	if (parent.isForStatement() && path.key === "update") return true;
	return false;
};

const removeUpdaters = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	let replacedCount = 0;

	patchDefault(traverse)(ast, {
		UpdateExpression(path) {
			if (!isSafeStandaloneUpdate(path)) return;
			const operator = path.node.operator === "++" ? "+=" : "-=";
			const left = t.cloneNode(path.node.argument, true);
			const replacement = t.assignmentExpression(
				operator,
				left,
				t.numericLiteral(1),
			);
			path.replaceWith(replacement);
			replacedCount += 1;
		},
	});

	return {
		code: patchDefault(generate)(ast).code,
		replacedCount,
	};
};

export default createCommand((program) => {
	program
		.command("remove-updater")
		.description("Replace safe update expressions with += or -=")
		.argument("[file]", "The file to transform")
		.option("--input, --file <file>", "The file to transform")
		.option("--o, --output <file>", "Output file path")
		.option("--unlimited", "Unlimited timeout")
		.action(
			async (
				fileArgument: string | undefined,
				options: {
					file?: string;
					output?: string;
					unlimited?: boolean;
				},
			) => {
				await timeout(
					async ({ finish }) => {
						const filename =
							fileArgument ??
							options.file ??
							(await createPrompt("Enter the file path:"));

						if (!filename) {
							showError("No file provided");
							return finish();
						}

						try {
							const fileContent = readFileSync(filename, "utf8");
							const defaultOutputPath = createDefaultOutputPath(filename);
							let outputPath = options.output;

							if (!outputPath) {
								const promptPath = (
									await createPrompt("Enter the output file path:")
								)?.trim();
								outputPath = promptPath || defaultOutputPath;
							}
							const loader = loading("Removing update expressions...").start();

							try {
								const { code: output, replacedCount } = removeUpdaters(
									fileContent,
									filename,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved remove-updater file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${replacedCount} updates replaced)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply remove-updater transform");
								showError(
									`Error transforming file '${filename}': ${
										error instanceof Error ? error.message : "Unknown error"
									}`,
								);
								return finish();
							}
						} catch (error: unknown) {
							showError(
								`Error reading file '${filename}': ${
									error instanceof Error ? error.message : "Unknown error"
								}`,
							);
							return finish();
						}
					},
					options.unlimited ? null : 120 * 1000,
				);
			},
		);
});
