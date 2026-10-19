import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? files(join(dir, e.name))
          : /\.[jt]sx?$/.test(e.name)
            ? [join(dir, e.name)]
            : [],
      ),
    )
  ).flat();
}
describe("page-owned API architecture", () => {
  it("keeps HTTP and TanStack fetching out of reusable components", async () => {
    const paths = (
      await Promise.all(
        [
          "src/components",
          "src/features/quotations/components",
          "src/features/sales-orders/components",
          "src/features/customers/components",
        ].map(files),
      )
    ).flat();
    for (const path of paths) {
      const source = await readFile(path, "utf8");
      expect(source, path).not.toMatch(
        /from\s+['"](?:axios|@tanstack\/react-query|[^'"]*\/services\/|[^'"]*\/hooks\/use-(?:quotation|sales-order|customer))/,
      );
      expect(source, path).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
