import { createCommand } from "@/utils/cli/createCommand";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import loading from "loading-cli";
import { createPrompt } from "@/utils/common/createPrompt";
import { createParseOptions } from "@/utils/babel/createParseOptions";
import { timeout } from "@/utils/common/timeout";
import { showError } from "@/utils/common/showError";
import { patchDefault } from "@/utils/babel/patchDefault";
import { diff } from "@/utils/common/diff";

const walk = patchDefault(traverse);

const createDefaultOutputPath = (inputPath: string) => {
	const ext = extname(inputPath);
	if (!ext) {
		return `${inputPath}.key-simplify.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.key-simplify${ext}`);
};

const simplifyStringComputedKeys = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	let changedCount = 0;

	walk(ast, {
		MemberExpression(path) {
			if (!path.node.computed) return;
			if (!t.isStringLiteral(path.node.property)) return;
			const name = path.node.property.value;
			if (!name || !t.isValidIdentifier(name)) return;
			const replacement = t.memberExpression(
				path.node.object,
				t.identifier(name),
				false,
				path.node.optional,
			);
			path.replaceWith(replacement);
			changedCount += 1;
		},
	});

	return {
		code: patchDefault(generate)(ast).code,
		changedCount,
	};
};

export default createCommand((program) => {
	program
		.command("key-simplify")
		.description("Replace safe string literal property accesses with dots")
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
							const loader = loading("Simplifying computed keys...").start();

							try {
								const { code: output, changedCount } =
									simplifyStringComputedKeys(fileContent, filename);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved key-simplify file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${changedCount} access${changedCount === 1 ? "" : "es"} simplified)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply key-simplify transform");
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
