import { createCommand } from "@/utils/cli/createCommand";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parse } from "@babel/parser";
import traverse, { type Binding } from "@babel/traverse";
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
		return `${inputPath}.remove-unused.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.remove-unused${ext}`);
};

const removeUnusedVariables = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	let changed = false;

	patchDefault(traverse)(ast, {
		Scope(path) {
			for (const binding of Object.values(path.scope.bindings) as Binding[]) {
				if (
					!binding.referenced &&
					binding.constantViolations.length === 0 &&
					binding.path.key !== "handler" &&
					!binding.path.isFunctionExpression()
				) {
					if (
						t.isProgram(binding.scope.block) &&
						(binding.kind === "var" || binding.kind === "hoisted")
					) {
						continue;
					}

					const targets =
						binding.path.parentKey === "params"
							? [...binding.referencePaths, ...binding.constantViolations]
							: [
									binding.path,
									...binding.referencePaths,
									...binding.constantViolations,
								];

					for (const targetPath of targets) {
						if (
							targetPath.isVariableDeclarator() &&
							((t.isArrayPattern(targetPath.node.id) &&
								targetPath.node.id.elements.length > 1) ||
								(t.isObjectPattern(targetPath.node.id) &&
									targetPath.node.id.properties.length > 1))
						) {
							continue;
						}

						if (
							targetPath.key === "consequent" ||
							targetPath.key === "alternate" ||
							targetPath.key === "body"
						) {
							targetPath.replaceWith(t.blockStatement([]));
						} else {
							const parentPath = targetPath.parentPath;
							if (
								parentPath?.isVariableDeclaration() &&
								parentPath.node.declarations.length === 1
							) {
								parentPath.remove();
							} else {
								targetPath.remove();
							}
						}

						changed = true;
					}
				}
			}
		},
	});

	return {
		code: patchDefault(generate)(ast).code,
		changed,
	};
};

export default createCommand((program) => {
	program
		.command("remove-unused")
		.description("Remove unused variables and declarations")
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
							const loader = loading("Removing unused variables...").start();

							try {
								const { code: output, changed } = removeUnusedVariables(
									fileContent,
									filename,
								);
								writeFileSync(outputPath, output, "utf8");
								const diffLines = diff(fileContent, output).length;
								loader.succeed(
									`Saved remove-unused file to: ${outputPath} (${diffLines} lines changed${
										changed ? ", removed unused declarations" : ", no changes"
									})`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply remove-unused transform");
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
