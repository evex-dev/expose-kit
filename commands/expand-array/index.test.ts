import { Command } from "commander";
import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import expandArray from ".";

const sampleMockFileAbsolutePath = join(__dirname, "mocks", "sample.js");
const sampleExpandArrayAbsolutePath = join(
	__dirname,
	"mocks",
	"sample.expand-array.js",
);

describe("Expand Array Command", () => {
	let program: Command;

	beforeEach(() => {
		program = new Command();
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Should expand primitive array access safely", async () => {
		expandArray(program);

		await program.parseAsync([
			"_",
			"_",
			"expand-array",
			sampleMockFileAbsolutePath,
			"--target",
			"a",
			"--output",
			sampleExpandArrayAbsolutePath,
			"--unlimited",
		]);

		const output = readFileSync(sampleExpandArrayAbsolutePath, "utf8");

		expect(output).toInclude('const b = 0 + -2;');
		expect(output).toInclude('const c = "x";');
		expect(output).toInclude('const d = true ? "yes" : "no";');
		expect(output).toInclude("const e = null;");
		expect(output).toInclude("const f = undefined;");
		expect(output).toInclude("const k = 1;");
		expect(output).toInclude("const l = 1 * 2;");
		expect(output).toInclude("const m = 1;");

		expect(output).toMatch(/a\[7\]/);
		expect(output).toMatch(/a\[-1\]/);
		expect(output).toMatch(/\+\+a\[1\]/);
		expect(output).toMatch(/a\[1\]\s*\+=\s*2/);
		expect(output).toInclude("return a[0];");
	});
});
