const obj = {
  a: 0,
  d: 5,
  e: 5,
  "b": 1,
  2: "two"
};
obj.c = obj.a + obj.b;
obj.f = 6;
const result = [obj.a, obj.b, obj[2], obj.c, obj.d, obj.e, obj.f].join(",");
console.log(result);