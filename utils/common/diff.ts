export function diff(before: string, after: string) {
    const beforeLines = before.split(/\r?\n/);
    const afterLines = after.split(/\r?\n/);
  
    const changed = [];
    const max = Math.max(beforeLines.length, afterLines.length);
  
    for (let i = 0; i < max; i++) {
      if (beforeLines[i] !== afterLines[i]) {
        changed.push(i + 1); // 行番号は1始まり
      }
    }
  
    return changed;
  }