import { createCommand } from "@/utils/cli/createCommand";
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import loading from "loading-cli";
import { sleep } from "@/utils/common/sleep";
import { createPrompt } from "@/utils/common/createPrompt";
import { createParseOptions } from "@/utils/babel/createParseOptions";
import { timeout } from "@/utils/common/timeout";
import { showError } from "@/utils/common/showError";

export default createCommand((program) => {
	program
		.command("parsable")
		.description("Check if the file is parsable")
		.argument("[file]", "The file to check")
		.option("--input, --file <file>", "The file to check")
		.option("--unlimited", "Unlimited timeout")
		.action(
			async (fileArgument: string | undefined, options: { file?: string; unlimited?: boolean }) => {
				await timeout(
					async ({ finish }) => {
						const filename =
							fileArgument ??
							options.file ??
							await createPrompt("Enter the file path:");

						if (!filename) {
							showError("No file provided");
							return finish();
						}

						try {
							const fileContent = readFileSync(filename, "utf8");
							const loader = loading(
								"Checking if the file is parsable...",
							).start();

							try {
								parse(fileContent, createParseOptions(filename));

								// Patch memory
								await sleep(500);
								loader.succeed("File is parsable");

								return finish();
							} catch (error: unknown) {
								loader.fail("File is not parsable");
								showError(
									`Error parsing file '${filename}': ${
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
					options.unlimited ? Infinity : 30 * 1000,
				);
			},
		);
});
