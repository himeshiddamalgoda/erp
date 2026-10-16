import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : entry.name.endsWith(".js")
          ? [join(directory, entry.name)]
          : [],
    ),
  );
  return nested.flat();
}
const paths = (await Promise.all(["src", "scripts", "test"].map(files))).flat();
for (const path of paths) {
  const result = spawnSync(process.execPath, ["--check", path], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${paths.length} JavaScript files`);
