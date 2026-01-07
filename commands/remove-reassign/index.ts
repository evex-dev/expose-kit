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
		return `${inputPath}.remove-reassign.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.remove-reassign${ext}`);
};

type AliasInfo = {
	aliasBinding: Binding;
	targetName: string;
	targetBinding: Binding;
};

type WrapperInfo =
	| {
			kind: "call";
			wrapperBinding: Binding;
			targetName: string;
			targetBinding: Binding;
			paramNames: string[];
	  }
	| {
			kind: "member";
			wrapperBinding: Binding;
			targetName: string;
			targetBinding: Binding;
	  };

const isShorthandObjectKey = (path: NodePath<t.Identifier>) => {
	const parent = path.parentPath;
	if (!parent || !parent.isObjectProperty()) return false;
	return parent.node.shorthand && parent.get("key") === path;
};

const resolveFinalAlias = (
	binding: Binding,
	getBinding: (name: string) => Binding | undefined,
) => {
	const visited = new Set<Binding>();
	let currentBinding: Binding | undefined = binding;
	let currentName: string | null = null;

	while (currentBinding && !visited.has(currentBinding)) {
		visited.add(currentBinding);
		if (!t.isVariableDeclarator(currentBinding.path.node)) break;
		const init = currentBinding.path.node.init;
		if (!init || !t.isIdentifier(init)) break;
		const nextBinding = getBinding(init.name);
		if (!nextBinding || !nextBinding.constant) break;
		currentBinding = nextBinding;
		currentName = init.name;
	}

	if (!currentBinding || !currentName) {
		return null;
	}

	return { targetBinding: currentBinding, targetName: currentName };
};

const getReturnExpression = (
	functionPath:
		| NodePath<t.FunctionDeclaration>
		| NodePath<t.FunctionExpression>
		| NodePath<t.ArrowFunctionExpression>,
) => {
	const body = functionPath.node.body;
	if (!t.isBlockStatement(body)) {
		return body;
	}
	if (body.body.length !== 1) return null;
	const statement = body.body[0];
	if (!t.isReturnStatement(statement) || !statement.argument) return null;
	return statement.argument;
};

const getWrapperInfo = (
	functionPath:
		| NodePath<t.FunctionDeclaration>
		| NodePath<t.FunctionExpression>
		| NodePath<t.ArrowFunctionExpression>,
	wrapperBinding: Binding,
): WrapperInfo | null => {
	const params = functionPath.node.params;
	if (params.length === 0) return null;
	const paramNames: string[] = [];
	for (const param of params) {
		if (!t.isIdentifier(param)) return null;
		paramNames.push(param.name);
	}

	const expression = getReturnExpression(functionPath);
	if (!expression) return null;

	if (t.isCallExpression(expression)) {
		if (!t.isIdentifier(expression.callee)) return null;
		if (expression.arguments.length !== paramNames.length) return null;
		for (let i = 0; i < expression.arguments.length; i++) {
			const arg = expression.arguments[i];
			if (!t.isIdentifier(arg)) return null;
			if (arg.name !== paramNames[i]) return null;
		}

		const targetBinding = functionPath.scope.getBinding(expression.callee.name);
		if (!targetBinding) return null;
		return {
			kind: "call",
			wrapperBinding,
			targetName: expression.callee.name,
			targetBinding,
			paramNames,
		};
	}

	if (
		t.isMemberExpression(expression) &&
		expression.computed &&
		t.isIdentifier(expression.object) &&
		t.isIdentifier(expression.property) &&
		paramNames.length === 1 &&
		expression.property.name === paramNames[0]
	) {
		const targetBinding = functionPath.scope.getBinding(expression.object.name);
		if (!targetBinding) return null;
		return {
			kind: "member",
			wrapperBinding,
			targetName: expression.object.name,
			targetBinding,
		};
	}

	return null;
};

const removeReassign = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	const aliases: AliasInfo[] = [];
	const wrappers: WrapperInfo[] = [];

	patchDefault(traverse)(ast, {
		VariableDeclarator(path) {
			if (!t.isIdentifier(path.node.id)) return;
			if (!path.node.init || !t.isIdentifier(path.node.init)) return;
			const binding = path.scope.getBinding(path.node.id.name);
			if (!binding || !binding.constant) return;
			const targetBinding = path.scope.getBinding(path.node.init.name);
			if (!targetBinding || !targetBinding.constant) return;
			const resolved = resolveFinalAlias(binding, (name) =>
				path.scope.getBinding(name),
			);
			if (!resolved) return;
			aliases.push({
				aliasBinding: binding,
				targetBinding: resolved.targetBinding,
				targetName: resolved.targetName,
			});
		},
		FunctionDeclaration(path) {
			if (!path.node.id) return;
			const binding = path.scope.getBinding(path.node.id.name);
			if (!binding) return;
			const wrapper = getWrapperInfo(path, binding);
			if (wrapper) wrappers.push(wrapper);
		},
	});

	patchDefault(traverse)(ast, {
		VariableDeclarator(path) {
			if (!t.isIdentifier(path.node.id)) return;
			const initPath = path.get("init");
			if (
				!initPath ||
				(!initPath.isFunctionExpression() &&
					!initPath.isArrowFunctionExpression())
			) {
				return;
			}
			const binding = path.scope.getBinding(path.node.id.name);
			if (!binding || !binding.constant) return;
			const wrapper = getWrapperInfo(
				// TODO: fix this
				initPath as unknown as NodePath<t.FunctionDeclaration>,
				binding,
			);
			if (wrapper) wrappers.push(wrapper);
		},
	});

	let aliasReplacedCount = 0;
	let wrapperReplacedCount = 0;

	for (const alias of aliases) {
		for (const referencePath of alias.aliasBinding.referencePaths) {
			if (isShorthandObjectKey(referencePath as NodePath<t.Identifier>)) continue;
			const targetBinding = referencePath.scope.getBinding(alias.targetName);
			if (targetBinding !== alias.targetBinding) continue;
			referencePath.replaceWith(t.identifier(alias.targetName));
			aliasReplacedCount += 1;
		}
	}

	const wrapperMap = new Map<Binding, WrapperInfo>();
	for (const wrapper of wrappers) {
		wrapperMap.set(wrapper.wrapperBinding, wrapper);
	}

	patchDefault(traverse)(ast, {
		CallExpression(path) {
			if (!t.isIdentifier(path.node.callee)) return;
			const calleeBinding = path.scope.getBinding(path.node.callee.name);
			if (!calleeBinding) return;
			const wrapper = wrapperMap.get(calleeBinding);
			if (!wrapper) return;

			const targetBinding = path.scope.getBinding(wrapper.targetName);
			if (targetBinding !== wrapper.targetBinding) return;

			if (wrapper.kind === "call") {
				if (path.node.arguments.length !== wrapper.paramNames.length) return;
				for (const arg of path.node.arguments) {
					if (t.isSpreadElement(arg)) return;
				}
				const nextArgs = path.node.arguments.map((arg) =>
					t.cloneNode(arg, true),
				);
				path.replaceWith(
					t.callExpression(t.identifier(wrapper.targetName), nextArgs),
				);
				wrapperReplacedCount += 1;
				return;
			}

			if (path.node.arguments.length !== 1) return;
			const arg = path.node.arguments[0];
			if (!t.isExpression(arg) || t.isSpreadElement(arg)) return;
			path.replaceWith(
				t.memberExpression(
					t.identifier(wrapper.targetName),
					t.cloneNode(arg, true),
					true,
				),
			);
			wrapperReplacedCount += 1;
		},
	});

	return {
		code: patchDefault(generate)(ast).code,
		aliasReplacedCount,
		wrapperReplacedCount,
	};
};

export default createCommand((program) => {
	program
		.command("remove-reassign")
		.description("Inline safe alias assignments and wrapper calls")
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
							const loader = loading("Removing reassign aliases...").start();

							try {
								const {
									code: output,
									aliasReplacedCount,
									wrapperReplacedCount,
								} = removeReassign(fileContent, filename);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved remove-reassign file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${aliasReplacedCount} aliases, ${wrapperReplacedCount} calls inlined)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply remove-reassign transform");
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
