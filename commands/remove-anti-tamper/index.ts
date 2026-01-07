import { createCommand } from "@/utils/cli/createCommand";
import { basename, dirname, extname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
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
		return `${inputPath}.remove-anti-tamper.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.remove-anti-tamper${ext}`);
};

const isWrapperDeclaration = (node: t.VariableDeclarator): boolean => {
	if (!t.isIdentifier(node.id)) return false;
	if (!node.init || !t.isCallExpression(node.init)) return false;

	const callee = node.init.callee;
	if (!t.isFunctionExpression(callee)) return false;
	if (callee.params.length !== 0) return false;
	const bodyStatements = callee.body.body;
	if (bodyStatements.length < 2) return false;

	const firstStatement = bodyStatements[0];
	if (
		!t.isVariableDeclaration(firstStatement) ||
		firstStatement.declarations.length !== 1
	) {
		return false;
	}

	const firstDecl = firstStatement.declarations[0];
	if (
		!t.isIdentifier(firstDecl.id) ||
		!t.isBooleanLiteral(firstDecl.init, { value: true })
	) {
		return false;
	}

	const returnStatement = bodyStatements.find((stmt) =>
		t.isReturnStatement(stmt),
	) as t.ReturnStatement | undefined;
	if (!returnStatement || !t.isFunctionExpression(returnStatement.argument)) {
		return false;
	}

	const innerFunction = returnStatement.argument;
	if (innerFunction.params.length < 2) {
		return false;
	}

	return true;
};

const removeReferencedFunctions = (
	callPath: NodePath<t.CallExpression>,
) => {
	const args = callPath.get("arguments");
	if (!args || args.length < 2) {
		return false;
	}

	const handler = args[1];
	if (!handler.isFunction()) {
		return false;
	}

	let removed = false;
	handler.traverse({
		CallExpression(innerPath) {
			const callee = innerPath.get("callee");
			if (!callee.isIdentifier()) return;
			const binding = callee.scope.getBinding(callee.node.name);
			if (!binding) return;
			const bindingPath = binding.path;
			if (
				bindingPath.isFunctionDeclaration() &&
				!bindingPath.removed
			) {
				bindingPath.remove();
				removed = true;
			}
		},
	});

	return removed;
};

const cleanEmptyVariableDeclaration = (path: NodePath<t.VariableDeclaration>) => {
	if (path.node.declarations.length === 0) {
		path.remove();
	}
};

const removeAntiTamperPatterns = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	let changed = false;

	walk(ast, {
		VariableDeclarator(path) {
			if (!isWrapperDeclaration(path.node)) return;
			const wrapperName = path.node.id;
			if (!t.isIdentifier(wrapperName)) return;

			const binding = path.scope.getBinding(wrapperName.name);
			if (!binding) return;

			let removedReference = false;
			const references = [...binding.referencePaths];
			for (const reference of references) {
				const callPath = reference.parentPath;
				if (!callPath?.isCallExpression()) continue;

				const removedDebug = removeReferencedFunctions(callPath);
				if (removedDebug) {
					changed = true;
				}

				const declaratorPath = callPath.findParent((p) =>
					p.isVariableDeclarator(),
				);
				if (declaratorPath && declaratorPath.isVariableDeclarator()) {
					const parentDecl = declaratorPath.parentPath;
					declaratorPath.remove();
					if (parentDecl?.isVariableDeclaration()) {
						cleanEmptyVariableDeclaration(parentDecl);
					}
					removedReference = true;
					changed = true;
					continue;
				}

				const statement = callPath.getStatementParent();
				if (statement) {
					statement.remove();
					removedReference = true;
					changed = true;
				}
			}

			if (removedReference && !path.removed) {
				path.remove();
				changed = true;
				const parentDecl = path.parentPath;
				if (parentDecl?.isVariableDeclaration()) {
					cleanEmptyVariableDeclaration(parentDecl);
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
		.command("remove-anti-tamper")
		.description("Drop anti-tamper wrapper calls and helpers")
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
							const loader = loading("Removing anti-tamper patterns...").start();

							try {
								const { code: output, changed } = removeAntiTamperPatterns(
									fileContent,
									filename,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved remove-anti-tamper file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed${changed ? ", removed anti-tamper code" : ""})`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply remove-anti-tamper transform");
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
