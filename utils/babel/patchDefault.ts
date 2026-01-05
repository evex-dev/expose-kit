// https://github.com/babel/babel/discussions/13093
export const patchDefault = <T>(babelFn: T) => {
	if (typeof babelFn === "function") {
		return babelFn;
	}
	return (babelFn as { default: T }).default;
};
