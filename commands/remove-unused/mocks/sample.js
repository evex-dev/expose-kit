const keepValue = 1;
const unusedVar = 2;
const keepSum = keepValue + 3;

let alsoUnused;

function helper() {
	const innerUsed = keepSum;
	const anotherUnused = 10;
	const singleUnused = 5;
	return innerUsed;
}

console.log(keepValue, keepSum, helper());
