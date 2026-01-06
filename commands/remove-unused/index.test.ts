import { Command } from "commander";
import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import removeUnused from ".";
import { createSandbox } from "@/utils/evaluation/createSandbox";

const sampleMockFileAbsolutePath = join(__dirname, "mocks", "sample.js");
const sampleRemoveUnusedAbsolutePath = join(
	__dirname,
	"mocks",
	"sample.remove-unused.js",
);

const runScript = (filePath: string) => {
	const code = readFileSync(filePath, "utf8");
	const logSpy = vi.fn();
	const errorSpy = vi.fn();
	const sandbox = createSandbox({
		console: {
			log: logSpy,
			error: errorSpy,
		},
		Error,
	});

	try {
		sandbox(code, { filename: filePath });
		return {
			exitCode: 0,
			logCalls: logSpy.mock.calls,
			errorCalls: errorSpy.mock.calls,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			exitCode: 1,
			logCalls: logSpy.mock.calls,
			errorCalls: [...errorSpy.mock.calls, [message]],
		};
	}
};

describe("Remove Unused Command", () => {
	let program: Command;

	beforeEach(() => {
		program = new Command();
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Should remove unused declarations", async () => {
		removeUnused(program);

		await program.parseAsync([
			"_",
			"_",
			"remove-unused",
			sampleMockFileAbsolutePath,
			"--output",
			sampleRemoveUnusedAbsolutePath,
			"--unlimited",
		]);

		const output = readFileSync(sampleRemoveUnusedAbsolutePath, "utf8");

		expect(output).not.toInclude("unusedVar");
		expect(output).not.toInclude("anotherUnused");
		expect(output).not.toInclude("alsoUnused");
		expect(output).toInclude("console.log(keepValue, keepSum, helper());");
	});

	it("Should keep runtime behavior after transformation", async () => {
		removeUnused(program);

		await program.parseAsync([
			"_",
			"_",
			"remove-unused",
			sampleMockFileAbsolutePath,
			"--output",
			sampleRemoveUnusedAbsolutePath,
			"--unlimited",
		]);

		const originalResult = runScript(sampleMockFileAbsolutePath);
		const transformedResult = runScript(sampleRemoveUnusedAbsolutePath);

		expect(originalResult.exitCode).toBe(0);
		expect(transformedResult.exitCode).toBe(0);
		expect(originalResult.errorCalls).toEqual([]);
		expect(transformedResult.errorCalls).toEqual([]);
		expect(transformedResult.logCalls).toEqual(originalResult.logCalls);
	});
});
