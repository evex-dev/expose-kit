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

const walk = patchDefault(traverse);

const createDefaultOutputPath = (inputPath: string) => {
	const ext = extname(inputPath);
	if (!ext) {
		return `${inputPath}.remove-deadcode.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.remove-deadcode${ext}`);
};

const isSemiLiteral = (
	node: t.Node,
): node is t.Literal | t.ArrayExpression | t.ObjectExpression => {
	return t.isLiteral(node) || t.isArrayExpression(node) || t.isObjectExpression(node);
};

const isTruthy = (
	literal: t.Literal | t.ArrayExpression | t.ObjectExpression,
): boolean => {
	if (t.isBooleanLiteral(literal) || t.isNumericLiteral(literal)) {
		return Boolean(literal.value);
	}
	if (t.isStringLiteral(literal)) {
		return literal.value.length > 0;
	}
	if (t.isNullLiteral(literal)) {
		return false;
	}
	if (t.isBigIntLiteral(literal)) {
		return literal.value !== "0";
	}
	return true;
};

const replaceWithStatements = (
	path: NodePath<t.Statement>,
	statements: t.Statement[],
) => {
	const parent = path.parentPath;
	if (parent?.isBlockStatement() || parent?.isProgram() || parent?.isSwitchCase()) {
		path.replaceWithMultiple(statements);
		return;
	}
	if (statements.length === 0) {
		path.remove();
		return;
	}
	if (statements.length === 1 && statements[0]) {
		path.replaceWith(statements[0]);
		return;
	}
	path.replaceWith(t.blockStatement(statements));
};

const removeDeadCode = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	let changedCount = 0;

	walk(ast, {
		IfStatement(path) {
			if (!isSemiLiteral(path.node.test)) return;

			if (isTruthy(path.node.test)) {
				const statements = t.isBlockStatement(path.node.consequent)
					? path.node.consequent.body
					: [path.node.consequent];
				replaceWithStatements(path, statements);
			} else {
				if (path.node.alternate) {
					if (t.isBlockStatement(path.node.alternate)) {
						replaceWithStatements(path, path.node.alternate.body);
					} else {
						replaceWithStatements(path, [path.node.alternate]);
					}
				} else {
					path.remove();
				}
			}
			changedCount += 1;
		},
		ConditionalExpression(path) {
			if (isSemiLiteral(path.node.test)) {
				const replacement = isTruthy(path.node.test)
					? path.node.consequent
					: path.node.alternate;
				path.replaceWith(replacement);
				changedCount += 1;
				return;
			}

			if (
				t.isBooleanLiteral(path.node.consequent) &&
				t.isBooleanLiteral(path.node.alternate)
			) {
				const consequent = path.node.consequent.value;
				const alternate = path.node.alternate.value;
				let replacement: t.Expression;

				if (consequent && !alternate) {
					replacement = t.unaryExpression(
						"!",
						t.unaryExpression("!", path.node.test),
					);
				} else if (!consequent && alternate) {
					replacement = t.unaryExpression("!", path.node.test);
				} else if (consequent && alternate) {
					replacement = t.sequenceExpression([
						path.node.test,
						t.booleanLiteral(true),
					]);
				} else {
					replacement = t.sequenceExpression([
						path.node.test,
						t.booleanLiteral(false),
					]);
				}

				path.replaceWith(replacement);
				changedCount += 1;
			}
		},
	});

	return {
		code: patchDefault(generate)(ast).code,
		changedCount,
	};
};

export default createCommand((program) => {
	program
		.command("remove-deadcode")
		.description("Remove unreachable branches and simplify conditional expressions")
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
							const loader = loading("Removing dead code...").start();

							try {
								const { code: output, changedCount } = removeDeadCode(
									fileContent,
									filename,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved remove-deadcode file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${changedCount} edits)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply remove-deadcode transform");
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
