const keepValue = 1;
const keepSum = keepValue + 3;
function helper() {
  const innerUsed = keepSum;
  return innerUsed;
}
console.log(keepValue, keepSum, helper());