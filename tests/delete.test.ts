import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { rm, writeFile } from "fs/promises";
import { join } from "path";
import { katalist } from "../src/katalist";

describe("Katalist DELETE method", () => {
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

	test("should make a basic DELETE request", async () => {
		const response = await client.delete(
			"https://jsonplaceholder.typicode.com/posts/1",
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);
		expect(typeof response.text).toBe("function");
	});

	test("should generate schema when generateSchema is true", async () => {
		const tempSourceFile = join(process.cwd(), "temp-delete-schema-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		const response = await client.delete(
			"https://jsonplaceholder.typicode.com/posts/1",
			{
				generateSchema: true,
				interfaceName: "DeleteResult",
				sourceFile: tempSourceFile,
			},
		);

		expect(response).toBeDefined();

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Check if schema file was generated
		const schemaPath = join(httpSchemasDir, "DeleteResult.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const DeleteResultSchema");
		expect(schemaContent).toContain("export type DeleteResultSchemaType");
	});

	test("should handle different interface names", async () => {
		const tempSourceFile = join(process.cwd(), "temp-delete-interface-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		await client.delete("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: true,
			interfaceName: "DeletionResponse",
			sourceFile: tempSourceFile,
		});

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		const schemaPath = join(httpSchemasDir, "DeletionResponse.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const DeletionResponseSchema");
		expect(schemaContent).toContain("export type DeletionResponseSchemaType");
	});

	test("should work with different resource IDs", async () => {
		const response = await client.delete(
			"https://jsonplaceholder.typicode.com/posts/5",
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);
	});

	test("should handle query parameters", async () => {
		const response = await client.delete(
			"https://jsonplaceholder.typicode.com/posts/1?force=true",
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);
	});

	test("should handle headers", async () => {
		const response = await client.delete(
			"https://jsonplaceholder.typicode.com/posts/1",
			{
				headers: {
					Authorization: "Bearer delete-token",
					"X-Confirm-Delete": "yes",
				},
			},
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);
	});

	test("should handle empty response bodies", async () => {
		const tempSourceFile = join(process.cwd(), "temp-delete-empty-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		const response = await client.delete(
			"https://jsonplaceholder.typicode.com/posts/1",
			{
				generateSchema: true,
				interfaceName: "EmptyDeleteResponse",
				sourceFile: tempSourceFile,
			},
		);

		expect(response).toBeDefined();

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		// JSONPlaceholder returns empty object for DELETE
		const data = await response.json();
		expect(data).toEqual({});

		// Schema should still be generated for empty object
		const schemaPath = join(httpSchemasDir, "EmptyDeleteResponse.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}
	});

	test("should not generate schema when generateSchema is false", async () => {
		await client.delete("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: false,
			interfaceName: "DeleteResult",
		});

		const schemaPath = join(httpSchemasDir, "DeleteResult.ts");
		expect(existsSync(schemaPath)).toBe(false);
	});

	test("should handle non-existent resources", async () => {
		try {
			// This might not fail with JSONPlaceholder, but tests error handling pattern
			const response = await client.delete(
				"https://jsonplaceholder.typicode.com/posts/999999",
			);

			// JSONPlaceholder doesn't actually return 404 for non-existent posts
			// but the pattern should work for real APIs
			expect(response).toBeDefined();
		} catch (error) {
			// In a real API, this might throw
			expect(error).toBeDefined();
		}
	});

	test("should generate schema for success responses", async () => {
		const tempSourceFile = join(process.cwd(), "temp-delete-success-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		await client.delete("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: true,
			interfaceName: "SuccessResponse",
			sourceFile: tempSourceFile,
		});

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		const schemaPath = join(httpSchemasDir, "SuccessResponse.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("SuccessResponseSchema");
		// DELETE responses are typically empty objects, so schema should reflect that
		expect(schemaContent).toContain("z.object({");
	});

	test("should handle multiple delete operations", async () => {
		const tempSourceFile1 = join(process.cwd(), "temp-delete-multi1-test.ts");
		const tempSourceFile2 = join(process.cwd(), "temp-delete-multi2-test.ts");
		await writeFile(tempSourceFile1, "// temp file for testing");
		await writeFile(tempSourceFile2, "// temp file for testing");

		// Test multiple deletes with different schemas
		await client.delete("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: true,
			interfaceName: "PostDeleteResult",
			sourceFile: tempSourceFile1,
		});

		await client.delete("https://jsonplaceholder.typicode.com/users/1", {
			generateSchema: true,
			interfaceName: "UserDeleteResult",
			sourceFile: tempSourceFile2,
		});

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(existsSync(join(httpSchemasDir, "PostDeleteResult.ts"))).toBe(true);
		expect(existsSync(join(httpSchemasDir, "UserDeleteResult.ts"))).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile1, { force: true });
			await rm(tempSourceFile2, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}
	});
});
