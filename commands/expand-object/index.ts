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
		return `${inputPath}.expand-object.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.expand-object${ext}`);
};

const getPropertyKeyFromObjectProperty = (
	property: t.ObjectProperty,
): string | null => {
	if (t.isIdentifier(property.key)) {
		return property.key.name;
	}
	if (t.isStringLiteral(property.key)) {
		return property.key.value;
	}
	if (t.isNumericLiteral(property.key)) {
		return String(property.key.value);
	}
	return null;
};

const getPropertyKeyFromMemberExpression = (
	node: t.MemberExpression,
): string | null => {
	if (!node.computed && t.isIdentifier(node.property)) {
		return node.property.name;
	}
	if (!node.computed || !t.isExpression(node.property)) {
		return null;
	}
	if (t.isStringLiteral(node.property)) {
		return node.property.value;
	}
	if (t.isNumericLiteral(node.property)) {
		return String(node.property.value);
	}
	if (t.isTemplateLiteral(node.property) && node.property.expressions.length === 0) {
		return node.property.quasis[0]?.value.cooked ?? null;
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

const collectMutatedProperties = (ast: t.File, targetName: string) => {
	const mutatedProperties = new Set<string>();
	let hasUnknownMutations = false;

	patchDefault(traverse)(ast, {
		MemberExpression(path) {
			if (!t.isIdentifier(path.node.object, { name: targetName })) return;

			const parent = path.parentPath;
			if (!parent) return;

			const isMutationTarget =
				parent.isUpdateExpression() ||
				(parent.isAssignmentExpression() && parent.get("left") === path) ||
				(parent.isForInStatement() && parent.get("left") === path) ||
				(parent.isForOfStatement() && parent.get("left") === path);

			if (!isMutationTarget) return;

			const propertyKey = getPropertyKeyFromMemberExpression(path.node);
			if (!propertyKey) {
				hasUnknownMutations = true;
				return;
			}
			mutatedProperties.add(propertyKey);
		},
	});

	return { mutatedProperties, hasUnknownMutations };
};

type ObjectInfo = {
	binding: Binding | null;
	objectNode: t.ObjectExpression;
	propertyMap: Map<string, t.Expression>;
	hasRiskOfSideEffects?: boolean;
};

const getPropertyMap = (
	objectNode: t.ObjectExpression,
): Map<string, t.Expression> | null => {
	const map = new Map<string, t.Expression>();
	for (const property of objectNode.properties) {
		if (!t.isObjectProperty(property)) {
			return null;
		}
		if (property.computed) {
			return null;
		}
		if (!t.isExpression(property.value)) {
			return null;
		}
		const key = getPropertyKeyFromObjectProperty(property);
		if (!key) {
			return null;
		}
		map.set(key, property.value);
	}
	return map;
};

const findTargetObject = (ast: t.File, targetName: string): ObjectInfo | null => {
	let found: ObjectInfo | null = null;

	patchDefault(traverse)(ast, {
		VariableDeclarator(path) {
			if (found) return;
			if (!t.isIdentifier(path.node.id, { name: targetName })) return;
			if (!t.isObjectExpression(path.node.init)) return;
			const propertyMap = getPropertyMap(path.node.init);
			if (!propertyMap) return;
			found = {
				binding: path.scope.getBinding(targetName) ?? null,
				objectNode: path.node.init,
				propertyMap,
			};
		},
		AssignmentExpression(path) {
			if (found) return;
			if (!t.isIdentifier(path.node.left, { name: targetName })) return;
			if (!t.isObjectExpression(path.node.right)) return;
			const propertyMap = getPropertyMap(path.node.right);
			if (!propertyMap) return;
			found = {
				binding: path.scope.getBinding(targetName) ?? null,
				objectNode: path.node.right,
				propertyMap,
			};
		},
	});

	if (!found) return null;

	let hasRiskOfSideEffects = false;
	patchDefault(traverse)(ast, {
		MemberExpression(path) {
			if (hasRiskOfSideEffects) return;
			if (!t.isIdentifier(path.node.object, { name: targetName })) return;
			const parent = path.parentPath;
			if (!parent) return;
			if (isAssignmentTarget(path)) {
				hasRiskOfSideEffects = true;
			}
		},
		AssignmentExpression(path) {
			if (hasRiskOfSideEffects) return;
			const left = path.get("left");
			if (left.isIdentifier({ name: targetName })) {
				hasRiskOfSideEffects = true;
			}
		},
		UpdateExpression(path) {
			if (hasRiskOfSideEffects) return;
			if (t.isIdentifier(path.node.argument, { name: targetName })) {
				hasRiskOfSideEffects = true;
			}
		},
	});

	const result = found as ObjectInfo;
	result.hasRiskOfSideEffects = hasRiskOfSideEffects;
	return result;
};

const expandObjectAccess = async (
	code: string,
	filename: string,
	targetName: string,
) => {
	const ast = parse(code, createParseOptions(filename));
	const targetObject = findTargetObject(ast, targetName);

	if (!targetObject) {
		throw new Error(`Target object '${targetName}' is not a primitive object`);
	}

	if (targetObject.hasRiskOfSideEffects) {
		const continueAnswer = await createPrompt(
			"The target object has risk of side effects, do you want to continue? (y/n)",
		);
		if (continueAnswer !== "y") {
			throw new Error("User cancelled");
		}
	}

	const candidates: Array<{
		path: NodePath<t.MemberExpression>;
		replacement: t.Expression;
	}> = [];

	const mutatedInfo = collectMutatedProperties(ast, targetName);
	if (mutatedInfo.hasUnknownMutations) {
		return {
			code: patchDefault(generate)(ast).code,
			replacedCount: 0,
		};
	}

	patchDefault(traverse)(ast, {
		MemberExpression(path) {
			if (isAssignmentTarget(path)) return;
			if (!t.isIdentifier(path.node.object, { name: targetName })) return;
			if (
				targetObject.binding &&
				path.scope.getBinding(targetName) !== targetObject.binding
			) {
				return;
			}
			const propertyKey = getPropertyKeyFromMemberExpression(path.node);
			if (!propertyKey) return;
			if (mutatedInfo.mutatedProperties.has(propertyKey)) return;
			const replacement = targetObject.propertyMap.get(propertyKey);
			if (!replacement) return;
			candidates.push({
				path,
				replacement: t.cloneNode(replacement, true),
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
		.command("expand-object")
		.description("Expand object property access for primitive values")
		.argument("[file]", "The file to transform")
		.option("--input, --file <file>", "The file to transform")
		.option("--target <name>", "Target object variable name")
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
							const loader = loading("Expanding object access...").start();

							try {
								const { code: output, replacedCount } = await expandObjectAccess(
									fileContent,
									filename,
									targetName,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved expand-object file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${replacedCount} replacements)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply expand-object transform");
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
