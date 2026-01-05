const MAX_TIMEOUT = 2_147_483_647; // 25 days

export const timeout = (
	fn: (ctx: {
		finish: () => void;
		aborted: () => boolean;
	}) => void | Promise<void>,
	ms: number | null,
) => {
	let aborted = false;
	const { resolve, reject, promise } = Promise.withResolvers<void>();

	const timer = setTimeout(() => {
		aborted = true;
		reject(new Error("Hang detected, please report to the developer"));
	}, ms ?? MAX_TIMEOUT);

	const finish = () => {
		clearTimeout(timer);
		resolve();
	};

	fn({
		finish,
		aborted: () => aborted,
	});

	return promise;
};
