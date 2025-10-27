// Test setup and utilities
import { afterAll, beforeAll } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

// Global test setup
beforeAll(async () => {
	// Ensure clean test environment
	const httpSchemasDir = join(process.cwd(), "http-schemas");
	const testSourceFile = join(process.cwd(), "test-source.ts");

	try {
		await rm(httpSchemasDir, { recursive: true, force: true });
		await rm(testSourceFile, { force: true });
	} catch (_error) {
		// Ignore cleanup errors during setup
	}

	// Create http-schemas directory for tests that need it
	try {
		await mkdir(httpSchemasDir, { recursive: true });
	} catch (_error) {
		// Directory might already exist
	}
});

afterAll(async () => {
	// Final cleanup
	const httpSchemasDir = join(process.cwd(), "http-schemas");
	const testSourceFile = join(process.cwd(), "test-source.ts");

	try {
		await rm(httpSchemasDir, { recursive: true, force: true });
		await rm(testSourceFile, { force: true });
	} catch (_error) {
		// Ignore cleanup errors
	}
});

// Mock implementations for testing (if needed in the future)
export const mockKyResponse = (data: any, status = 200) => {
	return {
		status,
		json: () => Promise.resolve(data),
		text: () => Promise.resolve(JSON.stringify(data)),
		headers: new Headers({ "content-type": "application/json" }),
		ok: status >= 200 && status < 300,
	};
};
