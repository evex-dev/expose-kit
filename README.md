# Expose Kit
![release workflow](https://github.com/evex-dev/linejs/actions/workflows/release.yml/badge.svg)
[![](https://dcbadge.limes.pink/api/server/evex)](https://discord.gg/evex)

> A universal toolkit for JavaScript deobfuscation

---

## What is this?

JavaScript deobfuscation tools are everywhere.  
But many of them are **too aggressive**, rewriting code until it breaks.

Expose Kit takes a **different approach**.

- No brute force
- Step-by-step, verifiable transforms
- Designed to *not* break your code silently

Each transformation is meant to be **checked and validated**, so you always know *when* something goes wrong.

Alongside deobfuscation, Expose Kit also provides a set of **practical utilities** for working with obfuscated JavaScript.

---

## Installation

Just one step:

```bash
npm i -g expose-kit
# or
bun i -g expose-kit
```

```bash
expose --help
expose parsable sample.js
```

---

## Usage Notes

### Default arguments

- The first argument is the input file  
  (`--file` / `--input` can also be used)
- If required options are missing, Expose Kit will **prompt you**
- A timeout is enabled by default to avoid hangs  
  Use `--unlimited` for long-running execution

---

## Recommended Workflow

First, an important premise:

> It is **impossible** to create a static deobfuscation tool that *never* breaks.

Reasons include:
- Unpredictable execution (`eval`, dynamic code)
- Bugs or edge cases in AST manipulation

Because of this, you should **verify the code at every step**.

### 1. Always verify with `parsable`

After each transformation, run:

```bash
expose parsable file.js
```

This ensures the syntax is still valid.

---

### 2. Make scopes safe first

One of the most common causes of breakage is **variable name confusion**.

If you try to write your own deobfuscation logic (e.g. in Python), you’ll quickly realize how painful it is to track scopes correctly.

That’s why you should **always start with**:

```bash
expose safe-scope input.js
```

This renames bindings per scope, producing code like:

```js
Before: var x = 810;((x) => console.log(x))(114514);
After:  var x = 810;((_x) => console.log(_x))(114514);
```
Example is [here](https://github.com/evex-dev/expose-kit/tree/main/commands/safe-scope/mocks).

With this alone:
- The code becomes far more resistant to breakage
- Writing custom deobfuscation logic becomes much easier
- You no longer need to worry about scope collisions

---

### 3. Apply transforms step by step

After `safe-scope`, combine common techniques like:
- `expand-array` and more
- legacy obfuscator-specific commands

After **each step**, run `parsable` again.

Expose Kit will also clearly indicate whether a **diff** exists, making inspection easy.

Repeat this process, and the original code will gradually reveal itself.

---

## Commands

### `expose parsable`

Check whether a file is syntactically valid.

```js
parsable:     const x = 810;
not parsable: cons x; = 810;
```

```bash
expose parsable path/to/file.js
```

Args:
- Default args only

---

### `expose safe-scope`

Rename bindings per scope for safer transformations.

```bash
expose safe-scope path/to/file.js --output path/to/file.safe-scope.js
```

Args:
- `--o, --output <file>`  
  Output file path  
  - No extension → `file.safe-scope.js`
  - With extension → `file.safe-scope.<ext>`

---

### `expose expand-array`

Expand array index access for primitive values.

```bash
expose expand-array path/to/file.js --target arrayName --output path/to/file.expand-array.js
```

Args:
- `--target <name>`  
  Target array variable name
- `--o, --output <file>`  
  Output file path  
  - No extension → `file.expand-array.js`
  - With extension → `file.expand-array.<ext>`

Notes:
- Each replacement is validated by reparsing; invalid replacements (e.g. `++a[0]` or `a[0]++`) are skipped.-
- Please carefully confirm that the original array has not undergone operations such as shuffling and is fixed.

---

## Community & Support

- Missing a feature? → [Create an issue](https://github.com/EdamAme-x/expose-kit/issues)
- Not sure which command to use? → Join our [Discord](https://evex.land)

---

## Author

- [EdamAme-x](https://github.com/EdamAme-x)

Built for research, not abuse.  
Want stronger obfuscation? Then build something this tool can’t reverse.
