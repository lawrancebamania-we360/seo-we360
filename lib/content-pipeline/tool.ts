// Calculator / Tool library — shared, client-safe types + constants. Kept free
// of any server-only import so both the client editor and the server data/action
// modules can use it. The tool is a reusable spec (free-text content/inputs/
// output/formula) plus an uploaded HTML code bundle (.zip) in Storage.

// A post (topic_cluster_items) can carry at most this many calculators.
export const MAX_TOOLS_PER_ITEM = 3;

export const TOOL_BUNDLE_BUCKET = "content-tool-bundles";
export const TOOL_BUNDLE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const TOOL_BUNDLE_ACCEPT = [
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "multipart/x-zip",
];

export interface ContentTool {
  id: string;
  name: string;
  content: string | null;
  inputs: string | null;
  output: string | null;
  formula: string | null;
  bundlePath: string | null;
  bundleName: string | null;
  embedUrl: string | null;
}

/** The editable spec fields (everything except the id + bundle), for forms. */
export interface ContentToolSpec {
  name: string;
  content: string;
  inputs: string;
  output: string;
  formula: string;
  embedUrl: string;
}

export const EMPTY_TOOL_SPEC: ContentToolSpec = {
  name: "", content: "", inputs: "", output: "", formula: "", embedUrl: "",
};
