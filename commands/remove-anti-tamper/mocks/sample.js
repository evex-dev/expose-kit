var wrapper = (function () {
    var guard = true;
    return function (ctx, fn) {
        var thunk = guard
            ? function () {
                  if (fn) {
                      var result = fn.apply(ctx, arguments);
                      fn = null;
                      return result;
                  }
              }
            : function () {};
        guard = false;
        return thunk;
    };
})();

var defender = wrapper(this, function () {
    return defender.toString().search("guard");
});

function debugProtection(state) {
    if (state === "init") {
        return function () {
            debugger;
        };
    }
    return function () {
        return false;
    };
}

wrapper(this, function () {
    var hook = debugProtection("init");
    hook();
})();

wrapper(this, function () {
    var host;
    try {
        host = Function("return this")();
    } catch (_error) {
        host = window;
    }
    var consoleObj = (host.console = host.console || {});
    var methods = ["log", "warn"];
    for (var i = 0; i < methods.length; i++) {
        var bound = wrapper.constructor.prototype.bind(wrapper);
        var methodName = methods[i];
        var original = consoleObj[methodName] || bound;
        bound.__proto__ = wrapper.bind(wrapper);
        bound.toString = original.toString.bind(original);
        consoleObj[methodName] = bound;
    }
})();

console.log("safe");
