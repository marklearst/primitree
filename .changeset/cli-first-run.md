---
'@primitree/cli': patch
---

Make the first run easier to follow.

- `primitree build` prints the output directory relative to the working directory, such as `./generated`. Directories outside the working directory keep their absolute path.
- A missing `primitree.config.ts` now names the getting started guide, which has a starter config.
