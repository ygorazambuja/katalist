
# Katalist - TypeScript HTTP Client with Automatic Schema Generation

## Project Overview
Katalist is a TypeScript library that simplifies HTTP client development by automatically generating Zod schemas from API responses. It provides a fluent API for making HTTP requests while handling type safety and schema generation.

## Core Functionality
- **HTTP Client Wrapper**: `katalist()` returns an object with HTTP methods (`get`, etc.)
- **Automatic Schema Generation**: Intercepts API responses and generates Zod schemas
- **Code Transformation**: Uses AST manipulation to add types and clean up generated code
- **Bun-First Architecture**: Built specifically for Bun runtime using its native APIs

## Key Technologies
- **Bun**: Runtime, build tool, and file operations
- **TypeScript**: Type safety and development
- **Zod**: Runtime type validation schemas
- **ts-morph**: AST manipulation for code transformation
- **Biome**: Code formatting and linting
- **Ky**: Lightweight HTTP client
- **generate-schema + json-schema-to-zod**: Automatic schema generation pipeline

## Development Workflow
1. **Schema Generation**: Use `generateSchema: true` and `interfaceName` in HTTP calls
2. **Automatic Processing**: Library intercepts responses and generates schemas
3. **Code Transformation**: AST manipulation adds types and removes temporary options
4. **Production Ready**: Transformed code is clean and type-safe

## Code Style Guidelines
- **Bun APIs Only**: Use `Bun.file`, `Bun.serve`, `Bun.build`, etc. Never Node.js alternatives
- **TypeScript Strict**: Full type safety with Zod schemas
- **Biome Formatting**: 2-space indentation, double quotes, tabs for indentation
- **ES Modules**: Use ESM imports/exports throughout
- **No Comments**: Code should be self-documenting

## Common Patterns
```typescript
// Schema generation during development
const kat = katalist(); // or any variable name like: const client = katalist();
const response = await kat.get(url, {
  generateSchema: true,
  interfaceName: "User"
});

// Production code (after transformation)
const response = await kat.get<UserSchemaType>(url);
```

## Build & Run
- `bun run build`: Build to dist/ with CJS and ESM outputs
- `bun run index.ts`: Run the main entry point
- `bun install`: Install dependencies
- `bun test`: Run tests

## Project Structure
- `src/katalist.ts`: Main HTTP client API
- `src/jsonToZodSchema.ts`: Schema generation utilities
- `src/transformer.ts`: AST manipulation and code transformation
- `http-schemas/`: Generated Zod schema files
- `dist/`: Built distribution files

## Architecture Principles
- **Zero-Runtime Overhead**: Schema generation happens at development time
- **Type-First**: All HTTP calls are fully typed
- **Automatic**: Minimal developer intervention required
- **Bun Native**: Leverages Bun's performance and APIs

## How Automatic Transformation Works

### Caller File Detection
The library automatically detects which file is calling the katalist methods using stack trace analysis:

1. **In External Projects**: When installed as `node_modules/katalist`, it detects user files like `/myapp/src/api.ts`
2. **In Development**: When developing katalist itself, it detects test files like `/katalist/tests/test.ts`
3. **Cross-Platform**: Handles both Unix (`/`) and Windows (`\`) path separators

### Filtering Logic
The `getCallerFilePath()` function in `src/katalist.ts` filters out:
- Files inside `/node_modules/katalist/` (the library itself when installed)
- Files matching `/katalist/src/katalist.ts` (library source during development)
- Files matching `/katalist/dist/index.*` (built library files)
- All other `node_modules` files (dependencies like ky, ts-morph, etc.)

This ensures it only transforms **user code**, never library code.

### Transformation Flow
1. User calls `kat.get(url, { generateSchema: true, interfaceName: "User" })`
2. Library detects caller file path from stack trace
3. HTTP request completes and response is intercepted
4. Zod schema is generated and saved to `http-schemas/`
5. **Transformer automatically runs** on the caller file:
   - Adds type parameter: `<UserSchemaType>`
   - Removes `generateSchema` and `interfaceName` props
   - Adds import: `import type { UserSchemaType } from './http-schemas/User'`
6. File is formatted with Biome and saved

### Works in Any Project
This mechanism works whether katalist is:
- Installed via `npm install katalist` in an external project
- Being developed locally
- Used in monorepos or nested project structures

The key is that it uses **relative path patterns** to identify library files, not absolute paths.

## Bun Development Guidelines

### Commands
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

### APIs
- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

### Testing
Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```


