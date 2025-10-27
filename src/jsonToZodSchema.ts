import { file, write } from "bun";
import generateSchema from "generate-schema";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { format } from "prettier";

export const jsonToZodSchema = (json: unknown, title: string) => {
  const jsonSchema = jsontoJsonSchema(json, title);
  return jsonSchemaToZodSchema(jsonSchema);
};

export const writeZodSchema = async (
  zodSchema: string,
  title: string,
  path: string
) => {
  const formatted = await format(zodSchema, { parser: "typescript" });

  const fileContent = `import { z } from "zod"

export const ${title}Schema = ${formatted}
export type ${title}SchemaType = z.infer<typeof ${title}Schema>;`;

  await write(path, fileContent);
};

export const readJsonFile = async (
  path: string
): Promise<Record<string, unknown>> => {
  const fileInstance = file(path);
  const json = await fileInstance.json();
  return json as Record<string, unknown>;
};

export const jsontoJsonSchema = (
  json: unknown,
  title: string
) => {
  // @ts-expect-error - generate-schema can handle arrays but TypeScript typing doesn't reflect that
  const jsonSchema = generateSchema.json(json);

  jsonSchema.title = title;
  delete jsonSchema.$schema;

  // Add required array to make all properties required by default
  addRequiredToAllObjects(jsonSchema);

  return jsonSchema as Record<string, unknown>;
};

// Helper function to recursively add required arrays to all objects
const addRequiredToAllObjects = (schema: Record<string, unknown>): void => {
  if (schema.type === "object" && schema.properties) {
    // Add required array for current object, excluding null properties
    const requiredProps = Object.entries(schema.properties)
      .filter(([_, prop]) => {
        const propObj = prop as Record<string, unknown>;
        return propObj.type !== "null";
      })
      .map(([key]) => key);

    if (requiredProps.length > 0) {
      schema.required = requiredProps;
    }

    // Recursively process nested objects
    for (const prop of Object.values(schema.properties)) {
      if (typeof prop === "object" && prop !== null) {
        addRequiredToAllObjects(prop as Record<string, unknown>);
      }
    }
  }
};

export const jsonSchemaToZodSchema = (
  jsonSchema: Record<string, unknown>
): string => {
  return jsonSchemaToZod(jsonSchema, {
    withoutDescribes: false,
    depth: Number.MAX_SAFE_INTEGER,
  });
};
