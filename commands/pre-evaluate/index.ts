import { createCommand } from "@/utils/cli/createCommand";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parse } from "@babel/parser";
import traverse, { type Binding, type NodePath } from "@babel/traverse";
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
		return `${inputPath}.pre-evaluate.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.pre-evaluate${ext}`);
};

type LiteralValue = number | string;
type ArrayReturnInfo = {
	binding: Binding;
	arrayNode: t.ArrayExpression;
	replacementName: string;
	used: boolean;
};

type EvalState = {
	bindingValues: Map<Binding, LiteralValue>;
	bindingStack: Set<Binding>;
};

const isSupportedNumberOperator = (
	operator: t.BinaryExpression["operator"],
) => {
	return (
		operator === "-" ||
		operator === "*" ||
		operator === "/" ||
		operator === "%" ||
		operator === "**" ||
		operator === "<<" ||
		operator === ">>" ||
		operator === ">>>" ||
		operator === "|" ||
		operator === "&" ||
		operator === "^"
	);
};

const resolveBindingValue = (
	binding: Binding,
	state: EvalState,
): LiteralValue | null => {
	if (!binding.constant || binding.kind !== "const") {
		return null;
	}
	const cached = state.bindingValues.get(binding);
	if (cached !== undefined) {
		return cached;
	}
	if (state.bindingStack.has(binding)) {
		return null;
	}
	state.bindingStack.add(binding);
	let value: LiteralValue | null = null;
	if (binding.path.isVariableDeclarator()) {
		if (binding.path.node.init) {
			const initPath = binding.path.get("init");
			if (!Array.isArray(initPath) && initPath.isExpression()) {
				value = evaluateExpression(initPath, state);
			}
		}
	}
	state.bindingStack.delete(binding);
	if (value !== null) {
		state.bindingValues.set(binding, value);
	}
	return value;
};

const evaluateExpression = (
	path: NodePath<t.Expression>,
	state: EvalState,
): LiteralValue | null => {
	if (path.isNumericLiteral()) {
		return path.node.value;
	}
	if (path.isStringLiteral()) {
		return path.node.value;
	}
	if (path.isParenthesizedExpression()) {
		const inner = path.get("expression");
		if (!Array.isArray(inner) && inner.isExpression()) {
			return evaluateExpression(inner, state);
		}
		return null;
	}
	if (path.isIdentifier()) {
		const binding = path.scope.getBinding(path.node.name);
		if (!binding) return null;
		return resolveBindingValue(binding, state);
	}
	if (path.isUnaryExpression()) {
		const argumentPath = path.get("argument");
		if (Array.isArray(argumentPath) || !argumentPath.isExpression()) {
			return null;
		}
		const argument = evaluateExpression(argumentPath, state);
		if (argument === null || typeof argument !== "number") {
			return null;
		}
		if (path.node.operator === "+") return +argument;
		if (path.node.operator === "-") return -argument;
		if (path.node.operator === "~") return ~argument;
		return null;
	}
	if (path.isBinaryExpression()) {
		const leftPath = path.get("left");
		const rightPath = path.get("right");
		if (
			Array.isArray(leftPath) ||
			Array.isArray(rightPath) ||
			!leftPath.isExpression() ||
			!rightPath.isExpression()
		) {
			return null;
		}
		const left = evaluateExpression(leftPath, state);
		const right = evaluateExpression(rightPath, state);
		if (left === null || right === null) {
			return null;
		}
		if (path.node.operator === "+") {
			if (typeof left === "string" || typeof right === "string") {
				return `${left}${right}`;
			}
			if (typeof left === "number" && typeof right === "number") {
				return left + right;
			}
			return null;
		}
		if (
			typeof left !== "number" ||
			typeof right !== "number" ||
			!isSupportedNumberOperator(path.node.operator)
		) {
			return null;
		}
		switch (path.node.operator) {
			case "-":
				return left - right;
			case "*":
				return left * right;
			case "/":
				return left / right;
			case "%":
				return left % right;
			case "**":
				return left ** right;
			case "<<":
				return left << right;
			case ">>":
				return left >> right;
			case ">>>":
				return left >>> right;
			case "|":
				return left | right;
			case "&":
				return left & right;
			case "^":
				return left ^ right;
			default:
				return null;
		}
	}
	return null;
};

const shouldSkipReferencedIdentifier = (path: NodePath<t.Identifier>) => {
	const parent = path.parentPath;
	if (!parent) return false;
	if (parent.isObjectProperty()) {
		if (parent.node.shorthand) return true;
		if (parent.get("key") === path && !parent.node.computed) {
			return true;
		}
	}
	if (parent.isObjectMethod()) {
		if (parent.get("key") === path && !parent.node.computed) {
			return true;
		}
	}
	return false;
};

const getArrayReturnExpression = (
	node:
		| t.FunctionDeclaration
		| t.FunctionExpression
		| t.ArrowFunctionExpression,
): t.ArrayExpression | null => {
	if (node.params.length !== 0) return null;
	if (t.isBlockStatement(node.body)) {
		if (node.body.body.length !== 1) return null;
		const statement = node.body.body[0];
		if (!t.isReturnStatement(statement) || !statement.argument) return null;
		return t.isArrayExpression(statement.argument) ? statement.argument : null;
	}
	return t.isArrayExpression(node.body) ? node.body : null;
};

const isSafeArrayElement = (node: t.Expression | null): boolean => {
	if (!node) return true;
	if (
		t.isNumericLiteral(node) ||
		t.isStringLiteral(node) ||
		t.isBooleanLiteral(node) ||
		t.isNullLiteral(node)
	) {
		return true;
	}
	if (
		t.isUnaryExpression(node) &&
		(node.operator === "-" || node.operator === "+") &&
		t.isNumericLiteral(node.argument)
	) {
		return true;
	}
	if (t.isArrayExpression(node)) {
		return node.elements.every((element) => {
			if (element === null) return true;
			if (t.isSpreadElement(element)) return false;
			return isSafeArrayElement(element);
		});
	}
	return false;
};

const isSafeArrayExpression = (node: t.ArrayExpression): boolean => {
	return node.elements.every((element) => {
		if (element === null) return true;
		if (t.isSpreadElement(element)) return false;
		return isSafeArrayElement(element);
	});
};

const collectArrayReturnFunctions = (ast: t.File): ArrayReturnInfo[] => {
	const results: ArrayReturnInfo[] = [];
	let counter = 0;

	patchDefault(traverse)(ast, {
		FunctionDeclaration(path) {
			if (!path.node.id) return;
			const arrayExpression = getArrayReturnExpression(path.node);
			if (!arrayExpression || !isSafeArrayExpression(arrayExpression)) return;
			const binding = path.scope.getBinding(path.node.id.name);
			if (!binding) return;
			const programScope = path.scope.getProgramParent();
			let replacementName = `${path.node.id.name}_${counter}`;
			counter += 1;
			while (programScope.hasBinding(replacementName)) {
				replacementName = `${path.node.id.name}_${counter}`;
				counter += 1;
			}
			results.push({
				binding,
				arrayNode: arrayExpression,
				replacementName,
				used: false,
			});
		},
		VariableDeclarator(path) {
			if (!t.isIdentifier(path.node.id)) return;
			const init = path.node.init;
			if (
				!init ||
				(!t.isFunctionExpression(init) && !t.isArrowFunctionExpression(init))
			) {
				return;
			}
			const arrayExpression = getArrayReturnExpression(init);
			if (!arrayExpression || !isSafeArrayExpression(arrayExpression)) return;
			const binding = path.scope.getBinding(path.node.id.name);
			if (!binding || !binding.constant || binding.kind !== "const") return;
			const programScope = path.scope.getProgramParent();
			let replacementName = `${path.node.id.name}_${counter}`;
			counter += 1;
			while (programScope.hasBinding(replacementName)) {
				replacementName = `${path.node.id.name}_${counter}`;
				counter += 1;
			}
			results.push({
				binding,
				arrayNode: arrayExpression,
				replacementName,
				used: false,
			});
		},
	});

	return results;
};

const insertArrayReturnDeclarations = (
	ast: t.File,
	functions: ArrayReturnInfo[],
) => {
	const declarations = functions
		.filter((info) => info.used)
		.map((info) =>
			t.variableDeclaration("var", [
				t.variableDeclarator(
					t.identifier(info.replacementName),
					t.cloneNode(info.arrayNode, true),
				),
			]),
		);

	if (declarations.length === 0) return;

	const body = ast.program.body;
	let insertIndex = 0;
	while (
		insertIndex < body.length &&
		t.isExpressionStatement(body[insertIndex]) &&
		"directive" in (body[insertIndex] || {})
	) {
		insertIndex += 1;
	}
	body.splice(insertIndex, 0, ...declarations);
};

const preEvaluate = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	const state: EvalState = {
		bindingValues: new Map(),
		bindingStack: new Set(),
	};
	let replacedCount = 0;
	const arrayReturnFunctions = collectArrayReturnFunctions(ast);
	const arrayReturnMap = new Map<Binding, ArrayReturnInfo>();
	for (const info of arrayReturnFunctions) {
		arrayReturnMap.set(info.binding, info);
	}

	patchDefault(traverse)(ast, {
		CallExpression(path) {
			if (!t.isIdentifier(path.node.callee)) return;
			if (path.node.arguments.length !== 0) return;
			const binding = path.scope.getBinding(path.node.callee.name);
			if (!binding) return;
			const info = arrayReturnMap.get(binding);
			if (!info) return;
			path.replaceWith(t.identifier(info.replacementName));
			info.used = true;
			replacedCount += 1;
		},
		ReferencedIdentifier(path) {
			if (shouldSkipReferencedIdentifier(path as NodePath<t.Identifier>)) {
				return;
			}
			const value = evaluateExpression(path as NodePath<t.Expression>, state);
			if (value === null) return;
			if (typeof value === "number") {
				path.replaceWith(t.numericLiteral(value));
			} else {
				path.replaceWith(t.stringLiteral(value));
			}
			replacedCount += 1;
		},
		UnaryExpression: {
			exit(path) {
				const value = evaluateExpression(path as NodePath<t.Expression>, state);
				if (value === null) return;
				if (typeof value === "number") {
					path.replaceWith(t.numericLiteral(value));
				} else {
					path.replaceWith(t.stringLiteral(value));
				}
				replacedCount += 1;
			},
		},
		BinaryExpression: {
			exit(path) {
				const value = evaluateExpression(path as NodePath<t.Expression>, state);
				if (value === null) return;
				if (typeof value === "number") {
					path.replaceWith(t.numericLiteral(value));
				} else {
					path.replaceWith(t.stringLiteral(value));
				}
				replacedCount += 1;
			},
		},
		ParenthesizedExpression: {
			exit(path) {
				const value = evaluateExpression(path as NodePath<t.Expression>, state);
				if (value === null) return;
				if (typeof value === "number") {
					path.replaceWith(t.numericLiteral(value));
				} else {
					path.replaceWith(t.stringLiteral(value));
				}
				replacedCount += 1;
			},
		},
	});

	insertArrayReturnDeclarations(ast, arrayReturnFunctions);

	return {
		code: patchDefault(generate)(ast).code,
		replacedCount,
	};
};

export default createCommand((program) => {
	program
		.command("pre-evaluate")
		.description("Pre-evaluate const numeric/string expressions")
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
							const loader = loading("Pre-evaluating constants...").start();

							try {
								const { code: output, replacedCount } = preEvaluate(
									fileContent,
									filename,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved pre-evaluate file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${replacedCount} replacements)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply pre-evaluate transform");
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
