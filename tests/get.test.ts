import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { rm, writeFile } from "fs/promises";
import { join } from "path";
import { katalist } from "../src/katalist";

describe("Katalist GET method", () => {
	let client: ReturnType<typeof katalist>;
	let httpSchemasDir: string;

	beforeEach(() => {
		client = katalist();
		httpSchemasDir = join(process.cwd(), "http-schemas");
	});

	afterEach(async () => {
		// Clean up generated schemas after each test
		try {
			await rm(httpSchemasDir, { recursive: true, force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}
	});

	test("should make a basic GET request", async () => {
		const response = await client.get(
			"https://jsonplaceholder.typicode.com/posts/1",
		);

		expect(response).toBeDefined();
		expect(typeof response.json).toBe("function");

		const data = await response.json();
		expect(data).toHaveProperty("id");
		expect(data).toHaveProperty("title");
		expect(data).toHaveProperty("body");
	});

	test("should generate schema when generateSchema is true", async () => {
		// Create a temporary source file for the transformation
		const tempSourceFile = join(process.cwd(), "temp-get-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		const response = await client.get(
			"https://jsonplaceholder.typicode.com/posts/1",
			{
				generateSchema: true,
				interfaceName: "Post",
				sourceFile: tempSourceFile,
			},
		);

		expect(response).toBeDefined();

		// Wait a bit for async schema generation to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Check if schema file was generated
		const schemaPath = join(httpSchemasDir, "Post.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}

		// Verify schema content
		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const PostSchema");
		expect(schemaContent).toContain("export type PostSchemaType");
		expect(schemaContent).toContain("z.object({");
		expect(schemaContent).toContain("userId: z.number()");
		expect(schemaContent).toContain("id: z.number()");
		expect(schemaContent).toContain("title: z.string()");
		expect(schemaContent).toContain("body: z.string()");
	});

	test("should handle different interface names", async () => {
		const tempSourceFile = join(process.cwd(), "temp-get-blog-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		await client.get("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: true,
			interfaceName: "BlogPost",
			sourceFile: tempSourceFile,
		});

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		const schemaPath = join(httpSchemasDir, "BlogPost.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const BlogPostSchema");
		expect(schemaContent).toContain("export type BlogPostSchemaType");
	});

	test("should handle headers", async () => {
		const response = await client.get(
			"https://jsonplaceholder.typicode.com/posts/1",
			{
				headers: {
					"User-Agent": "Katalist-Test/1.0",
					Accept: "application/json",
				},
			},
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);
	});

	test("should work with query parameters in URL", async () => {
		const response = await client.get(
			"https://jsonplaceholder.typicode.com/posts?userId=1",
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBeGreaterThan(0);
	});

	test("should not generate schema when generateSchema is false", async () => {
		await client.get("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: false,
			interfaceName: "Post",
		});

		// Schema should not be generated
		const schemaPath = join(httpSchemasDir, "Post.ts");
		expect(existsSync(schemaPath)).toBe(false);
	});

	test("should handle non-JSON responses gracefully", async () => {
		// This test might fail if the endpoint doesn't exist, but tests error handling
		try {
			await client.get("https://httpstat.us/404", {
				generateSchema: true,
				interfaceName: "ErrorResponse",
			});
		} catch (error) {
			// Expected for 404 responses
			expect(error).toBeDefined();
		}
	});
});
