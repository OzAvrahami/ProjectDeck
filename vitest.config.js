import { defineConfig } from "vitest/config";
import { transform } from "esbuild";

export default defineConfig({
  plugins: [{
    name: "component-jsx",
    async transform(code, id) {
      if (id.replaceAll("\\", "/").includes("/components/") && id.endsWith(".js")) {
        return transform(code, { loader: "jsx", jsx: "automatic", sourcefile: id });
      }
    },
  }],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js", "tests/integration/**/*.test.js"],
  },
});
