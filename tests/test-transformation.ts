import { Katalist } from "..";
import type { PostSchemaType } from "../http-schemas/Post";

const katalist = Katalist();

await katalist
	.get<PostSchemaType>("https://jsonplaceholder.typicode.com/posts/1", {})
	.json();
