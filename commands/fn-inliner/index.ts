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

const walk = patchDefault(traverse);

const createDefaultOutputPath = (inputPath: string) => {
	const ext = extname(inputPath);
	if (!ext) {
		return `${inputPath}.fn-inliner.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.fn-inliner${ext}`);
};

export type ProxyFunctionExpression = t.Function & {
	params: t.Identifier[];
	body:
		| (t.BlockStatement & {
				body: {
					0: t.ReturnStatement & { argument: t.Expression | undefined };
				};
		  })
		| t.Expression;
};

const isProxyFunctionExpression = (
	node: t.Node,
): node is ProxyFunctionExpression => {
	return (
		t.isFunction(node) &&
		node.params.every((param) => t.isIdentifier(param)) &&
		((t.isBlockStatement(node.body) &&
			node.body.body.length === 1 &&
			t.isReturnStatement(node.body.body[0]) &&
			(node.body.body[0].argument === undefined ||
				(t.isExpression(node.body.body[0].argument) &&
					isProxyValue(node.body.body[0].argument)))) ||
			(t.isArrowFunctionExpression(node) &&
				t.isExpression(node.body) &&
				isProxyValue(node.body)))
	);
};

const isProxyValue = (node: t.Node): boolean => {
	if (
		t.isFunction(node) ||
		t.isBlockStatement(node) ||
		t.isSequenceExpression(node)
	) {
		return false;
	}
	let isValid = true;

	walk(node, {
		"SequenceExpression|BlockStatement|Function|AssignmentExpression"(path) {
			isValid = false;
			path.stop();
		},
		noScope: true,
	});

	return isValid;
};

const copyExpression = (expression: t.Expression) => {
	return t.cloneNode(expression, true);
};

type Argument = t.Expression;

class ProxyFunction {
	private readonly expression: ProxyFunctionExpression;

	constructor(expression: ProxyFunctionExpression) {
		this.expression = expression;
	}

	public getReplacement(args: Argument[]): t.Expression {
		const expression = t.isExpression(this.expression.body)
			? copyExpression(this.expression.body)
			: this.expression.body.body[0].argument
				? copyExpression(this.expression.body.body[0].argument)
				: t.identifier("undefined");
		this.replaceParameters(expression, args);
		return expression;
	}

	private replaceParameters(expression: t.Expression, args: Argument[]): void {
		const paramMap = new Map<string, t.Expression>(
			this.expression.params.map((param: t.Identifier, index: number) => [
				param.name,
				args[index] ?? t.identifier("undefined"),
			]),
		);
		const pathsToReplace: Array<[NodePath, t.Expression]> = [];

		walk(expression, {
			enter(path) {
				if (
					t.isIdentifier(path.node) &&
					!(path.parentPath?.isMemberExpression() && path.key === "property") &&
					paramMap.has(path.node.name)
				) {
					const replacement = paramMap.get(path.node.name) as t.Expression;
					pathsToReplace.push([path, replacement]);
				}
			},
			noScope: true,
		});

		for (const [path, replacement] of pathsToReplace) {
			path.replaceWith(t.cloneNode(replacement, true));
		}
	}
}

class ProxyFunctionVariable extends ProxyFunction {
	private readonly binding: Binding;

	constructor(binding: Binding, expression: ProxyFunctionExpression) {
		super(expression);
		this.binding = binding;
	}

	public getCalls(): NodePath[] {
		return this.binding.referencePaths;
	}

	public replaceCall(path: NodePath): boolean {
		if (
			!path.parentPath ||
			!path.parentPath.isCallExpression() ||
			path.key !== "callee"
		) {
			return false;
		}
		const argumentNodes = path.parentPath.node.arguments;
		const args: t.Expression[] = [];
		for (const argument of argumentNodes) {
			if (!t.isExpression(argument)) {
				return false;
			}
			args.push(t.cloneNode(argument, true));
		}
		const expression = this.getReplacement(args);
		path.parentPath.replaceWith(expression);
		return true;
	}
}

const collectProxyFunctions = (ast: t.File) => {
	const proxies: ProxyFunctionVariable[] = [];

	walk(ast, {
		FunctionDeclaration(path) {
			if (!path.node.id) return;
			if (!isProxyFunctionExpression(path.node)) return;
			const binding = path.scope.getBinding(path.node.id.name);
			if (!binding || !binding.constant) return;
			proxies.push(new ProxyFunctionVariable(binding, path.node));
		},
		VariableDeclarator(path) {
			if (!t.isIdentifier(path.node.id)) return;
			const init = path.node.init;
			if (!init || !isProxyFunctionExpression(init)) return;
			const binding = path.scope.getBinding(path.node.id.name);
			if (!binding || !binding.constant) return;
			proxies.push(new ProxyFunctionVariable(binding, init));
		},
	});

	return proxies;
};

const inlineProxyFunctions = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	const proxies = collectProxyFunctions(ast);
	let replacedCount = 0;

	for (const proxy of proxies) {
		for (const referencePath of proxy.getCalls()) {
			if (referencePath.removed) continue;
			if (proxy.replaceCall(referencePath)) {
				replacedCount += 1;
			}
		}
	}

	return {
		code: patchDefault(generate)(ast).code,
		replacedCount,
	};
};

export default createCommand((program) => {
	program
		.command("fn-inliner")
		.description("Inline proxy function calls into expressions")
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
							const loader = loading("Inlining proxy functions...").start();

							try {
								const { code: output, replacedCount } = inlineProxyFunctions(
									fileContent,
									filename,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved fn-inliner file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${replacedCount} replacements)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply fn-inliner transform");
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
