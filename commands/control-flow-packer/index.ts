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
		return `${inputPath}.control-flow-packer.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.control-flow-packer${ext}`);
};

type StateArrayExpression = t.CallExpression & {
	callee: t.MemberExpression & { object: t.StringLiteral };
	arguments: { [0]: t.StringLiteral };
};

type FlatteningLoopBody = t.BlockStatement & {
	body: [
		t.SwitchStatement & {
			discriminant: t.MemberExpression & {
				object: t.Identifier;
				property: t.UpdateExpression & { argument: t.Identifier };
			};
			cases: (t.SwitchCase & { test: t.StringLiteral })[];
		},
		t.BreakStatement,
	];
};

type FlatteningForLoop = t.ForStatement & {
	init: DeclarationOrAssignmentExpression;
	body: FlatteningLoopBody;
};

type FlatteningWhileLoop = t.WhileStatement & {
	test: t.BooleanLiteral;
	body: FlatteningLoopBody;
};

type DeclarationOrAssignmentExpression =
	| (t.AssignmentExpression & { left: t.Identifier; right: t.NumericLiteral })
	| (t.VariableDeclaration & {
			declarations: [
				t.VariableDeclarator & {
					id: t.Identifier;
					init: t.NumericLiteral;
				},
			];
	  });

const isDeclarationOrAssignmentExpression = (
	node: t.Node,
): node is DeclarationOrAssignmentExpression => {
	if (t.isAssignmentExpression(node)) {
		return t.isIdentifier(node.left) && t.isNumericLiteral(node.right);
	}
	if (
		t.isVariableDeclaration(node) &&
		node.declarations.length === 1 &&
		t.isIdentifier(node.declarations[0].id) &&
		node.declarations[0].init &&
		t.isNumericLiteral(node.declarations[0].init)
	) {
		return true;
	}
	return false;
};

const extractCounterInfo = (
	node: DeclarationOrAssignmentExpression,
): { counterName: string; initialValue: number } => {
	if (t.isAssignmentExpression(node)) {
		return {
			counterName: node.left.name,
			initialValue: node.right.value,
		};
	}
	const declaration = node.declarations[0];
	return {
		counterName: declaration.id.name,
		initialValue: declaration.init.value,
	};
};

const isStateArrayExpression = (node: t.Node): node is StateArrayExpression => {
	return (
		t.isCallExpression(node) &&
		t.isMemberExpression(node.callee) &&
		t.isStringLiteral(node.callee.object) &&
		((t.isStringLiteral(node.callee.property) && node.callee.property.value === "split") ||
			(t.isIdentifier(node.callee.property) && node.callee.property.name === "split")) &&
		node.arguments.length === 1 &&
		t.isStringLiteral(node.arguments[0])
	);
};

const isFlatteningLoopBody = (
	node: t.Node,
	statesName: string,
	counterName: string,
): node is FlatteningLoopBody => {
	return (
		t.isBlockStatement(node) &&
		node.body.length === 2 &&
		t.isBreakStatement(node.body[1]) &&
		t.isSwitchStatement(node.body[0]) &&
		t.isMemberExpression(node.body[0].discriminant) &&
		t.isIdentifier(node.body[0].discriminant.object) &&
		node.body[0].discriminant.object.name === statesName &&
		t.isUpdateExpression(node.body[0].discriminant.property) &&
		t.isIdentifier(node.body[0].discriminant.property.argument) &&
		node.body[0].discriminant.property.argument.name === counterName &&
		node.body[0].cases.every(
			(c) => c.test && t.isStringLiteral(c.test),
		)
	);
};

const isFlatteningForLoop = (
	node: t.Node,
	statesName: string,
): node is FlatteningForLoop => {
	return (
		t.isForStatement(node) &&
		node.init !== null &&
		isDeclarationOrAssignmentExpression(node.init) &&
		isFlatteningLoopBody(
			node.body,
			statesName,
			t.isAssignmentExpression(node.init)
				? node.init.left.name
				: node.init.declarations[0].id.name,
		)
	);
};

const isFlatteningWhileLoop = (
	node: t.Node,
	statesName: string,
	counterName: string,
): node is FlatteningWhileLoop => {
	return (
		t.isWhileStatement(node) &&
		t.isBooleanLiteral(node.test) &&
		node.test.value === true &&
		isFlatteningLoopBody(node.body, statesName, counterName)
	);
};

const getStates = (expression: StateArrayExpression): string[] => {
	const delimiter = expression.arguments[0].value;
	return expression.callee.object.value.split(delimiter);
};

const collectStatements = (
	cases: (t.SwitchCase & { test: t.StringLiteral })[],
	states: string[],
	initialValue: number,
): t.Statement[] => {
	const casesMap = new Map<string, t.Statement[]>(
		cases.map((c) => [c.test.value, c.consequent]),
	);

	const statements: t.Statement[] = [];
	for (let index = initialValue; index < states.length; index++) {
		const state = states[index];
		if (state === undefined || !casesMap.has(state)) {
			break;
		}

		const blockStatements = casesMap.get(state) as t.Statement[];
		for (const statement of blockStatements) {
			if (t.isContinueStatement(statement)) {
				continue;
			}
			statements.push(t.cloneNode(statement, true));
		}

		const lastStatement = blockStatements[blockStatements.length - 1];
		if (lastStatement && t.isReturnStatement(lastStatement)) {
			break;
		}
	}

	return statements;
};

const packControlFlow = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	let changedCount = 0;

	walk(ast, {
		VariableDeclarator(path) {
			if (!path.node.init || !t.isIdentifier(path.node.id)) {
				return;
			}
			if (!isStateArrayExpression(path.node.init)) {
				return;
			}

			const statementPath = path.getStatementParent();
			if (!statementPath?.isVariableDeclaration()) {
				return;
			}

			if (statementPath.node.declarations.length !== 1) {
				return;
			}

			const stateVariableName = path.node.id.name;
			const states = getStates(path.node.init);
			let nextPath = statementPath.getNextSibling();
			if (!nextPath) {
				return;
			}

			let loopPath:
				| NodePath<t.ForStatement>
				| NodePath<t.WhileStatement>
				| null = null;
			let initialValue: number | null = null;
			let counterName: string | undefined;

			if (
				nextPath.isForStatement() &&
				isFlatteningForLoop(nextPath.node, stateVariableName)
			) {
				loopPath = nextPath;
				const initNode = nextPath.node.init;
				if (!initNode || !isDeclarationOrAssignmentExpression(initNode)) {
					return;
				}
				const counterInfo = extractCounterInfo(initNode);
				initialValue = counterInfo.initialValue;
				counterName = counterInfo.counterName;
			} else if (isDeclarationOrAssignmentExpression(nextPath.node)) {
				const counterInfo = extractCounterInfo(
					nextPath.node as DeclarationOrAssignmentExpression,
				);
				counterName = counterInfo.counterName;
				initialValue = counterInfo.initialValue;
				nextPath = nextPath.getNextSibling();
				if (!nextPath || !nextPath.isWhileStatement()) {
					return;
				}
				if (
					!isFlatteningWhileLoop(
						nextPath.node,
						stateVariableName,
						counterName,
					)
				) {
					return;
				}
				loopPath = nextPath;
			} else {
				return;
			}

			if (!loopPath || initialValue === null || counterName === undefined) {
				return;
			}

			const body = loopPath.node.body as FlatteningLoopBody;
			const cases = body.body[0].cases;
			const statements = collectStatements(cases, states, initialValue);
			if (statements.length === 0) {
				return;
			}

			statementPath.remove();
			loopPath.replaceWithMultiple(statements);
			loopPath.skip();
			changedCount += 1;
		},
	});

	return {
		code: patchDefault(generate)(ast).code,
		changedCount,
	};
};

export default createCommand((program) => {
	program
		.command("control-flow-packer")
		.description("Inline control-flow flattening loops")
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
							const loader = loading("Packing control flow...").start();

							try {
								const { code: output, changedCount } = packControlFlow(
									fileContent,
									filename,
								);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved control-flow-packer file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${changedCount} edits)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply control-flow-packer transform");
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
