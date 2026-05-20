import { config } from "dotenv";
config({ path: ".env.local" });

// Debug: confirm env var is loaded + which client_email is being used
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
console.log("GOOGLE_SERVICE_ACCOUNT_JSON length:", raw?.length ?? 0);
try {
  const o = JSON.parse(raw ?? "{}");
  console.log("client_email:", o.client_email);
  console.log("project_id:", o.project_id);
} catch (e) { console.log("JSON parse error:", e instanceof Error ? e.message : e); }

// Try the SA fetch directly with verbose error surfacing
import { google } from "googleapis";
(async () => {
  const docId = "1RCirDrWEK9RKd0WhxmEUBjQ0tk-AdyaCd04CF0GmWBw";
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/documents.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });
    const resp = await drive.files.export(
      { fileId: docId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    console.log("OK - text length:", String(resp.data ?? "").length);
    console.log("Preview:", String(resp.data ?? "").slice(0, 200));
  } catch (e) {
    console.log("SA FETCH ERROR:", e instanceof Error ? e.message : e);
    if (e instanceof Error && "response" in e) {
      console.log("RESPONSE BODY:", (e as { response?: { data?: unknown } }).response?.data);
    }
  }
  process.exit(0);
})();
