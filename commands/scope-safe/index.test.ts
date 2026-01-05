import { Command } from "commander";
import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import scopeSafe from ".";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const sampleMockFileAbsolutePath = join(__dirname, "mocks", "sample.js");
const sampleScopeSafeAbsolutePath = join(
	__dirname,
	"mocks",
	"sample.scope-safe.js",
);

const runScript = (filePath: string) => {
	const code = readFileSync(filePath, "utf8");
	const logSpy = vi.fn();
	const errorSpy = vi.fn();
	const context = vm.createContext({
		console: {
			log: logSpy,
			error: errorSpy,
		},
		Error,
	});

	try {
		vm.runInContext(code, context, { filename: filePath });
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

describe("Scope Safe Command", () => {
	let program: Command;

	beforeEach(() => {
		program = new Command();
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Should preserve execution output when regenerated", async () => {
		scopeSafe(program);

		await program.parseAsync([
			"_",
			"_",
			"scope-safe",
			sampleMockFileAbsolutePath,
			"--output",
			sampleScopeSafeAbsolutePath,
			"--unlimited",
		]);

		const originalResult = runScript(sampleMockFileAbsolutePath);
		const transformedResult = runScript(sampleScopeSafeAbsolutePath);

		expect(originalResult.exitCode).toBe(0);
		expect(transformedResult.exitCode).toBe(0);
		expect(originalResult.errorCalls).toEqual([]);
		expect(transformedResult.errorCalls).toEqual([]);
		expect(transformedResult.logCalls).toEqual(originalResult.logCalls);
	});
});
