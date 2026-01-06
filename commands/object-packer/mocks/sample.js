const obj = {};
obj.a = 0;
obj.d = obj.e = 5;
obj["b"] = 1;
obj[2] = "two";
obj.c = obj.a + obj.b;
obj.f = 6;
const result = [obj.a, obj.b, obj[2], obj.c, obj.d, obj.e, obj.f].join(",");
console.log(result);
