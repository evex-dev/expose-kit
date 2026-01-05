import { createCommand } from "@/utils/cli/createCommand";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parse } from "@babel/parser";
import traverse, { type Binding } from "@babel/traverse";
import generate from "@babel/generator";
import loading from "loading-cli";
import { createPrompt } from "@/utils/common/createPrompt";
import { createParseOptions } from "@/utils/babel/createParseOptions";
import { timeout } from "@/utils/common/timeout";
import { showError } from "@/utils/common/showError";

const createDefaultOutputPath = (inputPath: string) => {
	const ext = extname(inputPath);
	if (!ext) {
		return `${inputPath}.scope-safe.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.scope-safe${ext}`);
};

const renameBindingsByScope = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	const renamedBindings = new Set<Binding>();

	traverse(ast, {
		Scopable(path) {
			for (const [name, binding] of Object.entries(path.scope.bindings)) {
				if (renamedBindings.has(binding)) {
					continue;
				}
				const shouldRename = !!path.scope.parent?.hasBinding(name);
				if (!shouldRename) {
					renamedBindings.add(binding);
					continue;
				}
				const newName = path.scope.generateUid(name);
				if (newName !== name) {
					path.scope.rename(name, newName);
				}
				renamedBindings.add(binding);
			}
		},
	});

	return generate(ast).code;
};

export default createCommand((program) => {
	program
		.command("scope-safe")
		.description("Rename bindings per scope for safer transforms")
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
							await createPrompt("Enter the file path:");

						if (!filename) {
							showError("No file provided");
							return finish();
						}

						try {
							const fileContent = readFileSync(filename, "utf8");
                            const defaultOutputPath = createDefaultOutputPath(filename);
							let outputPath =
								options.output ??
								(await createPrompt(
									"Enter the output file path:",
								) || "").trim() ?? defaultOutputPath;
							const loader = loading("Renaming variables by scope...").start();

							try {
								const output = renameBindingsByScope(fileContent, filename);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(`Saved scope-safe file to: ${outputPath}`);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply scope-safe transform");
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
					options.unlimited ? Infinity : 120 * 1000,
				);
			},
		);
});
