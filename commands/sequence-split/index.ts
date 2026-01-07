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
		return `${inputPath}.sequence-split.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.sequence-split${ext}`);
};

const isExcluded = (node: t.Node) => {
	return t.isIdentifier(node) && node.name === "eval";
};

const sequenceSplit = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	let changedCount = 0;
	const markChanged = () => {
		changedCount += 1;
	};

	walk(ast, {
		ConditionalExpression(path) {
			if (!path.parentPath || !path.parentPath.isExpressionStatement()) return;
			const replacement = t.ifStatement(
				path.node.test,
				t.expressionStatement(path.node.consequent),
				t.expressionStatement(path.node.alternate),
			);

			if (
				path.parentPath.parentPath &&
				path.parentPath.parentPath.key === "alternate" &&
				path.parentPath.parentPath.isBlockStatement() &&
				path.parentPath.parentPath.node.body.length === 1
			) {
				path.parentPath.parentPath.replaceWith(replacement);
			} else {
				path.parentPath.replaceWith(replacement);
			}
			path.skip();
			markChanged();
		},
		LogicalExpression(path) {
			if (!path.parentPath || !path.parentPath.isExpressionStatement()) return;
			if (path.node.operator !== "&&" && path.node.operator !== "||") return;

			const test =
				path.node.operator === "&&"
					? path.node.left
					: t.unaryExpression("!", path.node.left);
			const replacement = t.ifStatement(
				test,
				t.expressionStatement(path.node.right),
			);

			if (
				path.parentPath.parentPath &&
				path.parentPath.parentPath.key === "alternate" &&
				path.parentPath.parentPath.isBlockStatement() &&
				path.parentPath.parentPath.node.body.length === 1
			) {
				path.parentPath.parentPath.replaceWith(replacement);
			} else {
				path.parentPath.replaceWith(replacement);
			}
			path.skip();
			markChanged();
		},
		"ForStatement|WhileStatement|DoWhileStatement"(
			path: NodePath<t.ForStatement | t.WhileStatement | t.DoWhileStatement> | NodePath<t.Node>,
		) {
			if (!path.isForStatement() && !path.isWhileStatement() && !path.isDoWhileStatement()) return;
			if (t.isBlockStatement(path.node.body)) return;
			path.node.body = t.blockStatement([path.node.body]);
			markChanged();
		},
		IfStatement(path) {
			if (!t.isBlockStatement(path.node.consequent)) {
				path.node.consequent = t.blockStatement([path.node.consequent]);
				markChanged();
			}
			if (
				path.node.alternate &&
				!t.isBlockStatement(path.node.alternate) &&
				!t.isIfStatement(path.node.alternate)
			) {
				path.node.alternate = t.blockStatement([path.node.alternate]);
				markChanged();
			}
		},
		VariableDeclaration(path) {
			if (path.node.declarations.length <= 1) return;
			const replacements = path.node.declarations.map((declaration) =>
				t.variableDeclaration(path.node.kind, [declaration]),
			);

			if (
				path.parentPath?.isForStatement() &&
				path.parentKey === "init"
			) {
				const lastDeclaration = replacements.pop();
				if (lastDeclaration) {
					path.parentPath.insertBefore(replacements);
					path.parentPath.node.init = lastDeclaration;
				}
			} else {
				path.replaceWithMultiple(replacements);
			}
			markChanged();
		},
		SequenceExpression(path) {
			const expressions = path.node.expressions;
			if (expressions.length === 1 && expressions[0]) {
				path.replaceWith(expressions[0]);
				markChanged();
				return;
			}

			let outerPath: NodePath = path;
			while (!t.isStatement(outerPath.node)) {
				const parent = outerPath.parentPath;
				if (!parent) return;

				if (
					(parent.isConditionalExpression() &&
						(outerPath.key === "consequent" ||
							outerPath.key === "alternate")) ||
					(parent.isLogicalExpression() && outerPath.key === "right") ||
					(parent.isForStatement() &&
						(outerPath.key === "test" || outerPath.key === "update")) ||
					(parent.isDoWhileStatement() && outerPath.key === "test") ||
					(parent.isArrowFunctionExpression() && outerPath.key === "body")
				) {
					return;
				}

				outerPath = parent;
			}

			const lastExpression = expressions[expressions.length - 1];
			if (lastExpression && isExcluded(lastExpression)) {
				const firstExpressions = expressions.splice(0, expressions.length - 2);
				if (firstExpressions.length > 0) {
					const expressionStatements = firstExpressions.map((expression) =>
						t.expressionStatement(expression),
					);
					outerPath.insertBefore(expressionStatements);
					markChanged();
				}
			} else {
				const finalExpression = expressions.splice(expressions.length - 1, 1)[0];
				const expressionStatements = expressions.map((expression) =>
					t.expressionStatement(expression),
				);
				outerPath.insertBefore(expressionStatements);
				if (finalExpression) {
					path.replaceWith(finalExpression);
				}
				markChanged();
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
		.command("sequence-split")
		.description("Split sequence expressions into statements")
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
							const loader = loading("Splitting sequences...").start();

							try {
								const { code: output, changedCount } = sequenceSplit(
									fileContent,
									filename,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved sequence-split file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${changedCount} transforms)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply sequence-split transform");
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
