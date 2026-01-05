import { Command } from "commander";
import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import parsable from ".";
import { join } from "node:path";

const successMockFileAbsolutePath = join(__dirname, "mocks", "success.js");
const failMockFileAbsolutePath = join(__dirname, "mocks", "fail.ts");

describe("Parsable Command", () => {
	let program: Command;

	beforeEach(() => {
		program = new Command();

		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Should be parsable", async () => {
		const loadingCliSpy = vi.spyOn(process.stderr, "write");
		parsable(program);

		await program.parseAsync([
			"_",
			"_",
			"parsable",
			successMockFileAbsolutePath,
		]);
		const calls = loadingCliSpy.mock.calls;

		const output = calls.at(-1)?.[0];
		expect(output).toInclude("File is parsable");
	});

	it("Should be not parsable", async () => {
		const loadingCliSpy = vi.spyOn(process.stderr, "write");
		parsable(program);

		await program.parseAsync(["_", "_", "parsable", failMockFileAbsolutePath]);
		const calls = loadingCliSpy.mock.calls;

		const output = calls.at(-1)?.[0];
		expect(output).toInclude("File is not parsable");
	});
});
