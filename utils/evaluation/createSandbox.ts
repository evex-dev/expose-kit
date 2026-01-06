import * as vm from "node:vm";

export const createSandbox = <T>(context: vm.Context) => {
	const sandbox = vm.createContext(context);
	return (
		code: string,
		options: vm.RunningCodeOptions,
		timeout: number = 10 * 1000,
	): T =>
		vm.runInContext(code, sandbox, {
			timeout,
			...options,
		});
};
