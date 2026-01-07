const key = "foo";
const obj = {
	foo: "foo",
	bar: "bar",
	"baz-qux": "baz",
	"class": "reserved",
};

obj["foo"] = "updated";
obj['bar'] = obj["foo"];

const baz = obj["baz-qux"];
const reserved = obj["class"];
console.log(obj["foo"], obj['bar'], baz, reserved, obj[key], obj["baz-qux"]);
