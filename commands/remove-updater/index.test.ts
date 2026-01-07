import { Command } from "commander";
import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import removeUpdater from ".";
import { createSandbox } from "@/utils/evaluation/createSandbox";

const sampleMockFileAbsolutePath = join(__dirname, "mocks", "sample.js");
const sampleRemoveUpdaterAbsolutePath = join(
	__dirname,
	"mocks",
	"sample.remove-updater.js",
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

describe("Remove Updater Command", () => {
	let program: Command;

	beforeEach(() => {
		program = new Command();
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Should keep runtime behavior after transformation", async () => {
		removeUpdater(program);

		await program.parseAsync([
			"_",
			"_",
			"remove-updater",
			sampleMockFileAbsolutePath,
			"--output",
			sampleRemoveUpdaterAbsolutePath,
			"--unlimited",
		]);

		const originalResult = runScript(sampleMockFileAbsolutePath);
		const transformedResult = runScript(sampleRemoveUpdaterAbsolutePath);

		expect(originalResult.exitCode).toBe(0);
		expect(transformedResult.exitCode).toBe(0);
		expect(originalResult.errorCalls).toEqual([]);
		expect(transformedResult.errorCalls).toEqual([]);
		expect(transformedResult.logCalls).toEqual(originalResult.logCalls);
	});
});
