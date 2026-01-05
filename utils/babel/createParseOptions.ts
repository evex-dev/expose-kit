import type { ParserOptions } from "@babel/parser";

export const createParseOptions = (filename: string) => {
  const isTypeScript = filename.endsWith(".ts") || filename.endsWith(".tsx");

  return {
    sourceType: "module",
    allowAwaitOutsideFunction: true,
    plugins: isTypeScript ? ["typescript", "jsx"] : ["jsx"],
  } as ParserOptions;
};
