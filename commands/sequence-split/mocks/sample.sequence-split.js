const log = value => console.log(value);
log("a");
log("b");
const seqValue = 3;
log("c");
log("d");
const arrow = () => (log("skip"), 10);
const arrow2 = () => true ? log("t") : log("f");
const cond = true;
if (cond) {
  log("e");
} else {
  log("f");
}
if (false) {
  log("g");
}
if (!true) {
  log("h");
}
if (cond) {
  log("i");
} else {
  log("j");
}
var i = 0;
for (var j = 1; i < 1; i++) {
  log(i + j);
}
while (false) {
  log("w");
}
do {
  log("d");
} while (false);
const a = 1;
const b = 2;
console.log(seqValue, arrow(), arrow2(), a + b);