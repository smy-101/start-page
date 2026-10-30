import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "preview/chrome-shim.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**"],
    languageOptions: { globals: { ...globals.node, chrome: "readonly" } },
  },
  {
    files: ["src/domain/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='round']",
          message:
            "几何取整一律 Math.floor:Math.round 会产生越过钳回边界的值(board-whiteboard/01 P1:811 > 810.67,迁移态往返被改写)。吸附取最近格点属 UI 层,不在本规则范围。",
        },
      ],
    },
  }
);
