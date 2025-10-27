import type { BuildConfig } from "bun";
import dts from "bun-plugin-dts";

const defaultBuildConfig: BuildConfig = {
	entrypoints: ["./index.ts"],
	outdir: "./dist",
	external: [
		"@biomejs/biome",
		"@biomejs/js-api",
		"@biomejs/wasm-nodejs",
		"generate-schema",
		"json-schema-to-zod",
		"ky",
		"pino",
		"prettier",
		"ts-morph",
		"zod",
		"typescript",
		"ky",
		"pino",
		"prettier",
		"ts-morph",
		"zod",
		"typescript",
	],
};

await Promise.all([
	Bun.build({
		...defaultBuildConfig,
		target: "bun",
		plugins: [dts()],
		format: "esm",
		naming: "[dir]/[name].js",
	}),
	Bun.build({
		...defaultBuildConfig,
		target: "bun",
		format: "cjs",
		naming: "[dir]/[name].cjs",
	}),
]);
