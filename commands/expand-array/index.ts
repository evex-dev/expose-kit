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
		return `${inputPath}.expand-array.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.expand-array${ext}`);
};

const isPrimitiveValue = (node: t.Expression) => {
	if (t.isNumericLiteral(node)) return true;
	if (t.isStringLiteral(node)) return true;
	if (t.isBooleanLiteral(node)) return true;
	if (t.isNullLiteral(node)) return true;
	if (t.isIdentifier(node, { name: "undefined" })) return true;
	if (t.isUnaryExpression(node, { operator: "-" })) {
		return t.isNumericLiteral(node.argument);
	}
	return false;
};

const isPrimitiveArray = (arrayNode: t.ArrayExpression) => {
	return arrayNode.elements.every((element) => {
		if (!element || t.isSpreadElement(element)) {
			return false;
		}
		return isPrimitiveValue(element);
	});
};

const getIndexFromProperty = (property: t.Expression): number | null => {
	if (t.isNumericLiteral(property) && Number.isInteger(property.value)) {
		return property.value;
	}
	if (t.isStringLiteral(property)) {
		if (!/^-?\d+$/.test(property.value)) {
			return null;
		}
		return Number.parseInt(property.value, 10);
	}
	if (
		t.isUnaryExpression(property, { operator: "-" }) &&
		t.isNumericLiteral(property.argument)
	) {
		return -property.argument.value;
	}
	return null;
};

const isAssignmentTarget = (path: NodePath<t.MemberExpression>) => {
	const parent = path.parentPath;
	if (!parent) return false;
	if (parent.isUpdateExpression()) return true;
	if (parent.isAssignmentExpression() && parent.get("left") === path) {
		return true;
	}
	if (parent.isForInStatement() && parent.get("left") === path) {
		return true;
	}
	if (parent.isForOfStatement() && parent.get("left") === path) {
		return true;
	}
	return false;
};

type ArrayInfo = {
	binding: Binding | null;
	arrayNode: t.ArrayExpression;
};

const findTargetArray = (ast: t.File, targetName: string): ArrayInfo | null => {
	let found: ArrayInfo | null = null;
	patchDefault(traverse)(ast, {
		VariableDeclarator(path) {
			if (found) return;
			if (!t.isIdentifier(path.node.id, { name: targetName })) return;
			if (!t.isArrayExpression(path.node.init)) return;
			if (!isPrimitiveArray(path.node.init)) return;
			found = {
				binding: path.scope.getBinding(targetName) ?? null,
				arrayNode: path.node.init,
			};
		},
		AssignmentExpression(path) {
			if (found) return;
			if (!t.isIdentifier(path.node.left, { name: targetName })) return;
			if (!t.isArrayExpression(path.node.right)) return;
			if (!isPrimitiveArray(path.node.right)) return;
			found = {
				binding: path.scope.getBinding(targetName) ?? null,
				arrayNode: path.node.right,
			};
		},
	});
	return found;
};

const expandArrayAccess = (
	code: string,
	filename: string,
	targetName: string,
) => {
	const ast = parse(code, createParseOptions(filename));
	const targetArray = findTargetArray(ast, targetName);

	if (!targetArray) {
		throw new Error(`Target array '${targetName}' is not a primitive array`);
	}

	const candidates: Array<{
		path: NodePath<t.MemberExpression>;
		replacement: t.Expression;
	}> = [];

	patchDefault(traverse)(ast, {
		MemberExpression(path) {
			if (!path.node.computed) return;
			if (isAssignmentTarget(path)) return;
			if (!t.isIdentifier(path.node.object, { name: targetName })) return;
			if (
				targetArray.binding &&
				path.scope.getBinding(targetName) !== targetArray.binding
			) {
				return;
			}
			if (!t.isExpression(path.node.property)) return;
			const index = getIndexFromProperty(path.node.property);
			if (index === null || index < 0) return;
			const element = targetArray.arrayNode.elements[index];
			if (!element || t.isSpreadElement(element)) return;
			if (!isPrimitiveValue(element)) return;
			candidates.push({
				path,
				replacement: t.cloneNode(element, true),
			});
		},
	});

	let replacedCount = 0;

	for (const candidate of candidates) {
		const original = t.cloneNode(candidate.path.node, true);
		candidate.path.replaceWith(t.cloneNode(candidate.replacement, true));
		const nextCode = patchDefault(generate)(ast).code;
		try {
			parse(nextCode, createParseOptions(filename));
			replacedCount += 1;
		} catch {
			candidate.path.replaceWith(original);
		}
	}

	return {
		code: patchDefault(generate)(ast).code,
		replacedCount,
	};
};

export default createCommand((program) => {
	program
		.command("expand-array")
		.description("Expand array index access for primitive values")
		.argument("[file]", "The file to transform")
		.option("--input, --file <file>", "The file to transform")
		.option("--target <name>", "Target array variable name")
		.option("--o, --output <file>", "Output file path")
		.option("--unlimited", "Unlimited timeout")
		.action(
			async (
				fileArgument: string | undefined,
				options: {
					file?: string;
					target?: string;
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

						const targetName =
							options.target ??
							(await createPrompt("Enter the target variable name:"));

						if (!targetName) {
							showError("No target variable provided");
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
							const loader = loading("Expanding array access...").start();

							try {
								const { code: output, replacedCount } = expandArrayAccess(
									fileContent,
									filename,
									targetName,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved expand-array file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${replacedCount} replacements)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply expand-array transform");
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
