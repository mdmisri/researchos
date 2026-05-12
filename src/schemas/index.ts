// schemas/ is the SINGLE SOURCE OF TRUTH for all data shapes.
// Every type in this project is derived from a Zod schema — never handwritten.
// Why? Zod gives us runtime validation + static types in one declaration.
// Rule: if it crosses a boundary (API ↔ agent, agent ↔ DB), it has a schema here.

export * from "./research";
export * from "./agent";
export * from "./rag";
