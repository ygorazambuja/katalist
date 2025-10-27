import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { rm, writeFile } from "fs/promises";
import { join } from "path";
import { katalist } from "../src/katalist";
import type { UpdatePostInputSchemaType } from "../http-schemas/UpdatePostInput";
import type { FinalUpdateInputSchemaType } from "../http-schemas/FinalUpdateInput";
import type { ComplexUpdateInputSchemaType } from "../http-schemas/ComplexUpdateInput";

describe("Katalist PUT method", () => {
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

	test("should make a basic PUT request", async () => {
		const testData = {
			id: 1,
			title: "Updated Post",
			body: "This post has been updated",
			userId: 1,
		};

		const response = await client.put(
			"https://jsonplaceholder.typicode.com/posts/1",
			testData,
		);

		expect(response).toBeDefined();
		expect(typeof response.json).toBe("function");

		const data = await response.json();
		expect(data.id).toBe(1);
		expect(data.title).toBe(testData.title);
		expect(data.body).toBe(testData.body);
	});

	test("should generate output schema when generateSchema is true", async () => {
		const testData = {
			id: 1,
			title: "Updated Post",
			body: "Updated content",
			userId: 1,
		};

		const tempSourceFile = join(process.cwd(), "temp-put-output-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		const response = await client.put(
			"https://jsonplaceholder.typicode.com/posts/1",
			testData,
			{},
		);

		expect(response).toBeDefined();

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Check if schema file was generated
		const schemaPath = join(httpSchemasDir, "UpdatedPost.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const UpdatedPostSchema");
		expect(schemaContent).toContain("export type UpdatedPostSchemaType");
	});

	test("should generate input schema when generateInputSchema is true", async () => {
		const testData = {
			title: "Updated Title",
			body: "Updated body content",
			userId: 1,
		};

		await client.put("https://jsonplaceholder.typicode.com/posts/1", testData, {
			generateInputSchema: true,
			inputInterfaceName: "UpdatePostInput",
		});

		const schemaPath = join(httpSchemasDir, "UpdatePostInput.ts");
		expect(existsSync(schemaPath)).toBe(true);

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const UpdatePostInputSchema");
		expect(schemaContent).toContain("export type UpdatePostInputSchemaType");
		expect(schemaContent).toContain("title: z.string()");
		expect(schemaContent).toContain("body: z.string()");
	});

	test("should generate both input and output schemas", async () => {
		const testData = {
			title: "Final Update",
			body: "Final update content",
			userId: 1,
		};

		const tempSourceFile = join(process.cwd(), "temp-put-both-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		await client.put(
			"https://jsonplaceholder.typicode.com/posts/1",
			testData,
			{},
		);

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(existsSync(join(httpSchemasDir, "FinalUpdateInput.ts"))).toBe(true);
		expect(existsSync(join(httpSchemasDir, "FinalUpdateResponse.ts"))).toBe(
			true,
		);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}
	});

	test("should handle partial updates", async () => {
		const partialData = {
			title: "Partial Update",
		};

		const response = await client.put(
			"https://jsonplaceholder.typicode.com/posts/1",
			partialData,
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.title).toBe(partialData.title);
	});

	test("should handle complex nested data", async () => {
		const complexData = {
			user: {
				name: "Updated Name",
				settings: {
					theme: "dark",
					notifications: true,
				},
			},
			content: {
				title: "Complex Update",
				sections: [
					{ type: "text", content: "Section 1" },
					{ type: "image", url: "image.jpg" },
				],
			},
		};

		await client.put(
			"https://jsonplaceholder.typicode.com/posts/1",
			complexData,
			{
				generateInputSchema: true,
				inputInterfaceName: "ComplexUpdateInput",
			},
		);

		const schemaPath = join(httpSchemasDir, "ComplexUpdateInput.ts");
		expect(existsSync(schemaPath)).toBe(true);

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("ComplexUpdateInputSchema");
	});

	test("should work with different resource IDs", async () => {
		const testData = { title: "Update for ID 5", body: "Content for ID 5" };

		const response = await client.put(
			"https://jsonplaceholder.typicode.com/posts/5",
			testData,
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.id).toBe(5);
	});

	test("should handle headers correctly", async () => {
		const testData = { title: "Header Test", body: "Testing headers" };

		const response = await client.put(
			"https://jsonplaceholder.typicode.com/posts/1",
			testData,
			{
				headers: {
					Authorization: "Bearer test-token",
					"X-API-Version": "1.0",
				},
			},
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(200);
	});

	test("should not generate schemas when flags are false", async () => {
		const testData = { title: "No Schema", body: "Should not generate" };

		await client.put("https://jsonplaceholder.typicode.com/posts/1", testData, {
			generateInputSchema: false,
			generateSchema: false,
		});

		// No schemas should be generated
		expect(existsSync(join(httpSchemasDir, "UpdatePostInput.ts"))).toBe(false);
		expect(existsSync(join(httpSchemasDir, "UpdatedPost.ts"))).toBe(false);
	});
});
