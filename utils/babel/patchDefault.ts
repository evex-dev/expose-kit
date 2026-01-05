// https://github.com/babel/babel/discussions/13093
export const patchDefault = <T>(babelFn: T) => {
	return (babelFn as { default: T }).default;
};
