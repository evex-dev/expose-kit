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
		return `${inputPath}.object-packer.js`;
	}
	const base = basename(inputPath, ext);
	return join(dirname(inputPath), `${base}.object-packer${ext}`);
};

type EmptyObjectExpression = t.ObjectExpression & { properties: [] };

const isEmptyObjectExpression = (
	node: t.Node,
): node is EmptyObjectExpression => {
	return t.isObjectExpression(node) && node.properties.length === 0;
};

const isPropertyAssignment = (
	node: t.Node,
	objectName: string,
): node is t.AssignmentExpression & { left: t.MemberExpression } => {
	return (
		t.isAssignmentExpression(node) &&
		t.isMemberExpression(node.left) &&
		t.isIdentifier(node.left.object, { name: objectName })
	);
};

const hasSelfReference = (
	value: t.Node,
	statementPath: NodePath,
	arrayIndex: number,
	binding: Binding,
	log: (message: string) => void,
): boolean => {
	try {
		const statementContainerPath = statementPath.parentPath?.get(
			`${statementPath.parentKey}.${arrayIndex}`,
		) as unknown as NodePath;
		let detected = false;

		patchDefault(traverse)(
			value,
			{
				Identifier(path) {
					if (detected) return;
					if (path.node.name !== binding.identifier.name) return;
					if (path.scope.getBinding(binding.identifier.name) === binding) {
						detected = true;
						path.stop();
					}
				},
			},
			statementContainerPath.scope,
			undefined,
			statementContainerPath,
		);

		return detected;
	} catch (error) {
		log(
			`Error looking for self reference when object packing: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return false;
	}
};

const packObjectProperties = (code: string, filename: string) => {
	const ast = parse(code, createParseOptions(filename));
	let packedCount = 0;
	let removedStatements = 0;
	const log = (message: string) => console.warn(message);

	patchDefault(traverse)(ast, {
		VariableDeclarator(path) {
			if (!t.isIdentifier(path.node.id)) return;
			if (!path.node.init || !isEmptyObjectExpression(path.node.init)) return;
			const binding = path.scope.getBinding(path.node.id.name);
			if (!binding || !binding.constant) return;
			const objectExpression = path.node.init;

			const statementPath = path.getStatementParent();
			if (
				!statementPath ||
				!statementPath.parentPath ||
				typeof statementPath.key !== "number"
			) {
				return;
			}

			const statements = (
				statementPath.parentPath.node as unknown as Record<
					string,
					t.Statement[] | undefined
				>
			)[statementPath.parentKey] as t.Statement[];
			let localRemoved = 0;
			let localPacked = 0;

			for (let i = statementPath.key + 1; i < statements.length; i++) {
				const node = statements[i];
				if (
					t.isExpressionStatement(node) &&
					isPropertyAssignment(node.expression, path.node.id.name)
				) {
					const assignment = node.expression;
					if (isPropertyAssignment(assignment.right, path.node.id.name)) {
						const properties = [assignment.left];
						let right: t.Expression = assignment.right;
						while (isPropertyAssignment(right, path.node.id.name)) {
							properties.push(right.left);
							right = right.right;
						}

						if (!t.isLiteral(right)) {
							break;
						}

						for (const { property } of properties) {
							if (t.isPrivateName(property)) {
								break;
							}
							const isComputed =
								!t.isStringLiteral(property) &&
								!t.isNumericLiteral(property) &&
								!t.isIdentifier(property);
							objectExpression.properties.push(
								t.objectProperty(
									t.cloneNode(property),
									t.cloneNode(right, true),
									isComputed,
								),
							);
							localPacked += 1;
						}
						localRemoved += 1;
					} else {
						const key = assignment.left.property;
						if (t.isPrivateName(key)) {
							break;
						}
						const isComputed =
							!t.isStringLiteral(key) &&
							!t.isNumericLiteral(key) &&
							!t.isIdentifier(key);

						if (
							hasSelfReference(assignment.right, statementPath, i, binding, log)
						) {
							break;
						}

						objectExpression.properties.push(
							t.objectProperty(
								t.cloneNode(key),
								t.cloneNode(assignment.right, true),
								isComputed,
							),
						);
						localPacked += 1;
						localRemoved += 1;
					}
				} else {
					break;
				}
			}

			if (localRemoved > 0) {
				statements.splice(statementPath.key + 1, localRemoved);
				packedCount += localPacked;
				removedStatements += localRemoved;
			}
		},
	});

	return {
		code: patchDefault(generate)(ast).code,
		packedCount,
		removedStatements,
	};
};

export default createCommand((program) => {
	program
		.command("object-packer")
		.description("Pack consecutive object property assignments into literals")
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
							const loader = loading("Packing object properties...").start();

							try {
								const {
									code: output,
									packedCount,
									removedStatements,
								} = packObjectProperties(fileContent, filename);
								writeFileSync(outputPath, output, "utf8");
								loader.succeed(
									`Saved object-packer file to: ${outputPath} (${
										diff(fileContent, output).length
									} lines changed, ${packedCount} properties packed, ${removedStatements} statements removed)`,
								);
								return finish();
							} catch (error: unknown) {
								loader.fail("Failed to apply object-packer transform");
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
