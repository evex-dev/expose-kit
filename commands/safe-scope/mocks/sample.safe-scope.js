let x = 810;
(_x => {
  _x += 1;
  console.log(_x);
  try {
    throw new Error("test");
  } catch (_x2) {
    _x2 = 2;
    console.log(_x2);
    for (let _x3 = 0; _x3 < 3; _x3++) {
      _x3 += 1;
      console.log(_x3);
      noop(_x3 = _x3, console.log(_x3));
      console.log([][_x3]);
      console.log([]?.[_x3]);
    }
  }
})(0);
noop(x = 114514, console.log(x));
function noop() {
  return;
}
noop(x = 3, (_x4 => {
  console.log(_x4);
})(222), console.log(x));
console.log(x);