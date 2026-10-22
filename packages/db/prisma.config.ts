import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generating the client needs no database; migrations read the URL from the environment.
  datasource: { url: process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/darksouls" },
});
