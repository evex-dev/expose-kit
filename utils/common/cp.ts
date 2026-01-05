import { cp } from "node:fs/promises";

const src = Bun.argv[2];
const dest = Bun.argv[3];
console.log(`Copying ${src} to ${dest}`);

if (!src || !dest) {
    console.error("Usage: cp <src> <dest>");
    process.exit(1);
}

await cp(src, dest);