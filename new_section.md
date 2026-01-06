### expose remove-unused

Drop unused bindings while leaving globals and multi-variable destructurings intact.

`ash
expose remove-unused path/to/file.js --output path/to/file.remove-unused.js
`

Args:
- --o, --output <file>  
  Output file path  
  - No extension -> ile.remove-unused.js
  - With extension -> ile.remove-unused.<ext>

Notes:
- Traverses each scope, skips program-level ar/hoisted bindings, and removes unused declarators safely.
- Run expose parsable afterward to ensure the cleaned file is still syntactically valid.
