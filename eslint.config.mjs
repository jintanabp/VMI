import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // แอปเสิร์ฟใต้ basePath /vmi — fetch("/api/...") จากฝั่ง client จะยิงไป root แล้วได้ 404
    // เคยเกิดจริง 2 ครั้ง (sales-orders-client ordersUrl, admin store-accounts remove())
    // และหายากเพราะ route อื่นในไฟล์เดียวกันใช้ appPath() ถูกต้องหมด
    files: ["components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='fetch'] > Literal[value=/^\\/(api|vmi)\\//]",
          message:
            "ใช้ appPath(\"/api/...\") จาก @/lib/paths — fetch ตรง ๆ ไม่ผ่าน basePath /vmi",
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] > TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/(api|vmi)\\//]",
          message:
            "ใช้ appPath(\"/api/...\") จาก @/lib/paths — fetch ตรง ๆ ไม่ผ่าน basePath /vmi",
        },
      ],
    },
  },
];

export default eslintConfig;
