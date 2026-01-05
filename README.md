# Expose Kit
![release workflow](https://github.com/evex-dev/linejs/actions/workflows/release.yml/badge.svg)
[![](https://dcbadge.limes.pink/api/server/evex)](https://discord.gg/evex)  

> A universal toolkit for deobfuscating JavaScript  
---

##### <center>❓ Question: Join our [Discord community](https://evex.land)</center>
---

## Concept
JavaScript deobfuscation tools are *everywhere*.  
<img width="145.2" height="113.5" alt="image" src="https://github.com/relative/synchrony/blob/master/.github/hm.png?raw=true" />


But many of them are **too aggressive**, rewriting code until it breaks.  

<img width="654" height="24" alt="image" src="https://github.com/user-attachments/assets/fd11d250-0163-4cd2-b36c-5514137fe087" />

Expose Kit takes *a different path*.

Instead of brute force, it works **step by step**.

Alongside deobfuscation, Expose Kit includes a collection of practical utilities.    

Everything you need is documented right here in this [README](README.md).

---

##### If the feature you’re looking for doesn’t exist, please create an [issue](https://github.com/EdamAme-x/expose-kit/issues).  
##### If you know what you want to do but aren’t sure which feature to use, join our [Discord community](https://evex.land) and ask for help.
---

## Installation
*Just one step*  
<!-- For Highlight -->
```regex
npm i -g expose-kit
```

<!-- For Highlight -->
```regex
expose --help
expose parsable sample.js
```

## Docs
By default, the first argument should be the file name (alternatively, `--file` or `--input` can be used).  
Options such as `--output` are also available.  

If no options are provided, this tool will prompt you for the required values.  

To avoid memory leaks and hung processes, a reasonable timeout is set by default.  
When long-running execution is expected, the timeout can be disabled with `--unlimited`.

### Commands

#### `expose parsable`


## Authors
- [EdamAme-x](https://github.com/EdamAme-x)

Built for research, not abuse.  
Want stronger obfuscation? Then make something this tool can’t reverse.
