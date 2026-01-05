import type { Command } from "commander";

export const createCommand = (creator: (program: Command) => void) => {
	return (program: Command) => {
		creator(program);
	};
};
