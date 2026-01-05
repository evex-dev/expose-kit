import _traverse from "@babel/traverse";

// https://github.com/babel/babel/discussions/13093
export const patchTraverse = (traverse: unknown) => {
	return (traverse as { default: typeof _traverse }).default;
};
