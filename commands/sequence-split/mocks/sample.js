const log = (value) => console.log(value);

const seqValue = (log("a"), log("b"), 3);
(log("c"), log("d"));
const arrow = () => (log("skip"), 10);
const arrow2 = () => true ? log("t") : log("f");

const cond = true;
cond ? log("e") : log("f");
false && log("g");
true || log("h");

if (cond) log("i");
else log("j");

for (var i = 0, j = 1; i < 1; i++) log(i + j);

while (false) log("w");
do log("d"); while (false);

const a = 1, b = 2;

console.log(seqValue, arrow(), arrow2(), a + b);
