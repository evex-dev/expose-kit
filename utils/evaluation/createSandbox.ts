import * as vm from "node:vm";

export const createSandbox = (context: vm.Context) => {
	const sandbox = vm.createContext(context);
	return (code: string) => vm.runInContext(code, sandbox, {
        timeout: 10 * 1000, // 10 seconds
    });
};
