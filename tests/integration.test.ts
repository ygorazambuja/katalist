import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { katalist } from "../src/katalist";

describe("Katalist Integration Tests", () => {
	let client: ReturnType<typeof katalist>;
	let httpSchemasDir: string;
	let testSourceFile: string;

	beforeEach(async () => {
		client = katalist();
		httpSchemasDir = join(process.cwd(), "http-schemas");

		// Create a test source file that we'll transform
		testSourceFile = join(process.cwd(), "test-source.ts");
		await writeFile(
			testSourceFile,
			`
// Test source file for transformation
import { Katalist } from "./index";

const katalist = Katalist();

const post = await katalist.get("https://jsonplaceholder.typicode.com/posts/1", {
	generateSchema: true,
	interfaceName: "Post"
});

const newPost = await katalist.post("https://jsonplaceholder.typicode.com/posts", {
	title: "Test Post",
	body: "Test content",
	userId: 1
}, {
	generateInputSchema: true,
	inputInterfaceName: "CreatePostInput",
	generateSchema: true,
	interfaceName: "Post"
});

const updatedPost = await katalist.put("https://jsonplaceholder.typicode.com/posts/1", {
	title: "Updated Post",
	body: "Updated content"
}, {
	generateInputSchema: true,
	inputInterfaceName: "UpdatePostInput",
	generateSchema: true,
	interfaceName: "Post"
});

const deleteResult = await katalist.delete("https://jsonplaceholder.typicode.com/posts/1", {
	generateSchema: true,
	interfaceName: "DeleteResult"
});
`,
		);
	});

	afterEach(async () => {
		// Clean up generated files after each test
		try {
			await rm(httpSchemasDir, { recursive: true, force: true });
			await rm(testSourceFile, { force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}
	});

	test("should perform complete workflow: request -> schema generation -> transformation", async () => {
		// The transformation happens during the HTTP requests due to afterResponse hooks
		await client.get("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: true,
			interfaceName: "Post",
			sourceFile: testSourceFile,
		});

		// Check if schema was generated
		const schemaPath = join(httpSchemasDir, "Post.ts");
		expect(existsSync(schemaPath)).toBe(true);

		// Verify schema content
		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("export const PostSchema");
		expect(schemaContent).toContain("export type PostSchemaType");
	});

	test("should generate multiple schemas for different operations", async () => {
		const testData = { title: "Test", body: "Test body", userId: 1 };

		// Generate input schema for POST
		await client.post("https://jsonplaceholder.typicode.com/posts", testData, {
			generateInputSchema: true,
			inputInterfaceName: "CreatePostInput",
			sourceFile: testSourceFile,
		});

		// Generate output schema for GET
		await client.get("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: true,
			interfaceName: "Post",
			sourceFile: testSourceFile,
		});

		// Generate schemas for PUT
		await client.put("https://jsonplaceholder.typicode.com/posts/1", testData, {
			generateInputSchema: true,
			inputInterfaceName: "UpdatePostInput",
			generateSchema: true,
			interfaceName: "UpdatedPost",
			sourceFile: testSourceFile,
		});

		// Generate schema for DELETE
		await client.delete("https://jsonplaceholder.typicode.com/posts/1", {
			generateSchema: true,
			interfaceName: "DeleteResult",
			sourceFile: testSourceFile,
		});

		// Check all schemas were generated
		expect(existsSync(join(httpSchemasDir, "CreatePostInput.ts"))).toBe(true);
		expect(existsSync(join(httpSchemasDir, "Post.ts"))).toBe(true);
		expect(existsSync(join(httpSchemasDir, "UpdatePostInput.ts"))).toBe(true);
		expect(existsSync(join(httpSchemasDir, "UpdatedPost.ts"))).toBe(true);
		expect(existsSync(join(httpSchemasDir, "DeleteResult.ts"))).toBe(true);
	});

	test("should handle schema generation from real API responses", async () => {
		// Test with different endpoints to get varied response structures
		await client.get("https://jsonplaceholder.typicode.com/users/1", {
			generateSchema: true,
			interfaceName: "User",
			sourceFile: testSourceFile,
		});

		await client.get(
			"https://jsonplaceholder.typicode.com/posts?userId=1&_limit=2",
			{
				generateSchema: true,
				interfaceName: "PostsArray",
				sourceFile: testSourceFile,
			},
		);

		const userSchemaPath = join(httpSchemasDir, "User.ts");
		const postsArraySchemaPath = join(httpSchemasDir, "PostsArray.ts");

		expect(existsSync(userSchemaPath)).toBe(true);
		expect(existsSync(postsArraySchemaPath)).toBe(true);

		// User schema should have user-specific fields
		const userSchema = await Bun.file(userSchemaPath).text();
		expect(userSchema).toContain("name: z.string()");
		expect(userSchema).toContain("email: z.string()");

		// Posts array schema should handle arrays
		const postsSchema = await Bun.file(postsArraySchemaPath).text();
		expect(postsSchema).toContain("z.array(");
	});

	test("should handle nested and complex data structures", async () => {
		const complexData = {
			user: {
				profile: {
					personal: {
						name: "John",
						age: 30,
					},
					professional: {
						role: "Developer",
						skills: ["TypeScript", "React", "Node.js"],
					},
				},
			},
			content: {
				metadata: {
					created: "2024-01-01",
					tags: ["tech", "programming"],
				},
			},
		};

		await client.post(
			"https://jsonplaceholder.typicode.com/posts",
			complexData,
			{
				generateInputSchema: true,
				inputInterfaceName: "ComplexDataInput",
				sourceFile: testSourceFile,
			},
		);

		const schemaPath = join(httpSchemasDir, "ComplexDataInput.ts");
		expect(existsSync(schemaPath)).toBe(true);

		const schemaContent = await Bun.file(schemaPath).text();
		expect(schemaContent).toContain("ComplexDataInputSchema");
		expect(schemaContent).toContain("z.object({");
		expect(schemaContent).toContain("user: z.object({");
		expect(schemaContent).toContain("profile: z.object({");
		expect(schemaContent).toContain("skills: z.array(z.string())");
		expect(schemaContent).toContain("tags: z.array(z.string())");
	});

	test("should handle error responses gracefully", async () => {
		// Test with an endpoint that might return errors
		try {
			await client.get("https://httpstat.us/404", {
				generateSchema: true,
				interfaceName: "ErrorResponse",
				sourceFile: testSourceFile,
			});
		} catch (error) {
			// Expected for error responses
			expect(error).toBeDefined();
		}

		// Schema generation should still work for error responses if they return JSON
		// Note: httpstat.us returns plain text, so no schema would be generated
	});

	test("should work with different content types and headers", async () => {
		const response = await client.get(
			"https://jsonplaceholder.typicode.com/posts/1",
			{
				headers: {
					Accept: "application/json",
					"User-Agent": "Katalist-Integration-Test/1.0",
					"X-Test-Header": "integration-test",
				},
				generateSchema: true,
				interfaceName: "HeaderTestPost",
				sourceFile: testSourceFile,
			},
		);

		expect(response.status).toBe(200);
		expect(existsSync(join(httpSchemasDir, "HeaderTestPost.ts"))).toBe(true);
	});

	test("should handle large response payloads", async () => {
		// Test with multiple posts to get a larger response
		const response = await client.get(
			"https://jsonplaceholder.typicode.com/posts?_limit=10",
			{
				generateSchema: true,
				interfaceName: "MultiplePosts",
				sourceFile: testSourceFile,
			},
		);

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(10);

		expect(existsSync(join(httpSchemasDir, "MultiplePosts.ts"))).toBe(true);
	});
});
