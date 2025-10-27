import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { rm, writeFile } from "fs/promises";
import { join } from "path";
import { katalist } from "../src/katalist";
import type { CreatePostInputSchemaType } from "../http-schemas/CreatePostInput";
import type { CreatePostInputSchemaType } from "../http-schemas/CreatePostInput";
import type { ComplexPostInputSchemaType } from "../http-schemas/ComplexPostInput";
import type { NewPostDataSchemaType } from "../http-schemas/NewPostData";

describe("Katalist POST method", () => {
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

	test("should make a basic POST request", async () => {
		const testData = {
			title: "Test Post",
			body: "This is a test post",
			userId: 1,
		};

		const response = await client.post(
			"https://jsonplaceholder.typicode.com/posts",
			testData,
		);

		expect(response).toBeDefined();
		expect(typeof response.json).toBe("function");

		const data = await response.json();
		expect(data).toHaveProperty("id");
		expect(data.title).toBe(testData.title);
		expect(data.body).toBe(testData.body);
		expect(data.userId).toBe(testData.userId);
	});

	test("should generate output schema when generateSchema is true", async () => {
		const testData = {
			title: "Test Post",
			body: "This is a test post",
			userId: 1,
		};

		const tempSourceFile = join(process.cwd(), "temp-post-output-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		const response = await client.post(
			"https://jsonplaceholder.typicode.com/posts",
			testData,
			{},
		);

		expect(response).toBeDefined();

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Check if schema file was generated
		const schemaPath = join(httpSchemasDir, "CreatedPost.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}

		// Verify schema content
		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const CreatedPostSchema");
		expect(schemaContent).toContain("export type CreatedPostSchemaType");
		expect(schemaContent).toContain("z.object({");
	});

	test("should generate input schema when generateInputSchema is true", async () => {
		const testData = {
			title: "Test Post",
			body: "This is a test post",
			userId: 1,
		};

		await client.post("https://jsonplaceholder.typicode.com/posts", testData, {
			generateInputSchema: true,
			inputInterfaceName: "CreatePostInput",
		});

		// Check if input schema file was generated
		const schemaPath = join(httpSchemasDir, "CreatePostInput.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Verify schema content
		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const CreatePostInputSchema");
		expect(schemaContent).toContain("export type CreatePostInputSchemaType");
		expect(schemaContent).toContain("title: z.string()");
		expect(schemaContent).toContain("body: z.string()");
		expect(schemaContent).toContain("userId: z.number()");
	});

	test("should generate both input and output schemas", async () => {
		const testData = {
			title: "Test Post",
			body: "This is a test post",
			userId: 1,
		};

		const tempSourceFile = join(process.cwd(), "temp-post-both-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		await client.post(
			"https://jsonplaceholder.typicode.com/posts",
			testData,
			{},
		);

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Check if both schema files were generated
		const inputSchemaPath = join(httpSchemasDir, "CreatePostInput.ts");
		const outputSchemaPath = join(httpSchemasDir, "CreatedPost.ts");

		expect(existsSync(inputSchemaPath)).toBe(true);
		expect(existsSync(outputSchemaPath)).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}

		// Verify both schemas
		const inputContent = await Bun.file(inputSchemaPath).text();
		const outputContent = await Bun.file(outputSchemaPath).text();

		expect(inputContent).toContain("CreatePostInputSchema");
		expect(outputContent).toContain("CreatedPostSchema");
	});

	test("should handle complex nested input data", async () => {
		const testData = {
			user: {
				name: "John Doe",
				email: "john@example.com",
				profile: {
					age: 30,
					hobbies: ["reading", "coding"],
				},
			},
			content: {
				title: "Complex Post",
				body: "This has nested objects and arrays",
				tags: ["test", "complex"],
			},
			metadata: {
				createdAt: "2024-01-01T00:00:00Z",
				isPublished: true,
			},
		};

		await client.post("https://jsonplaceholder.typicode.com/posts", testData, {
			generateInputSchema: true,
			inputInterfaceName: "ComplexPostInput",
		});

		const schemaPath = join(httpSchemasDir, "ComplexPostInput.ts");
		expect(existsSync(schemaPath)).toBe(true);

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("ComplexPostInputSchema");
		expect(schemaContent).toContain("z.object({");
	});

	test("should handle headers", async () => {
		const testData = { title: "Test", body: "Test body", userId: 1 };

		const response = await client.post(
			"https://jsonplaceholder.typicode.com/posts",
			testData,
			{
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "Katalist-Test/1.0",
				},
			},
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(201); // Created status for POST
	});

	test("should work with empty request body", async () => {
		const response = await client.post(
			"https://jsonplaceholder.typicode.com/posts",
			{},
		);

		expect(response).toBeDefined();
		expect(response.status).toBe(201);
	});

	test("should handle different interface names", async () => {
		const testData = { title: "Test", body: "Test body", userId: 1 };

		const tempSourceFile = join(process.cwd(), "temp-post-interface-test.ts");
		await writeFile(tempSourceFile, "// temp file for testing");

		await client.post(
			"https://jsonplaceholder.typicode.com/posts",
			testData,
			{},
		);

		// Wait for schema generation
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(existsSync(join(httpSchemasDir, "NewPostData.ts"))).toBe(true);
		expect(existsSync(join(httpSchemasDir, "PostResponse.ts"))).toBe(true);

		// Cleanup
		try {
			await rm(tempSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}
	});
});
