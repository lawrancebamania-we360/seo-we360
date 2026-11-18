// A minimal, dependency-light .xlsx writer: enough OOXML to hand Excel / Google
// Sheets a multi-tab workbook of plain values, no styling. Values are written as
// numbers (<v>) or inline strings (<is><t>), so there's no shared-strings table
// to keep in sync. Built on adm-zip (an .xlsx is just a zip of XML parts).
//
// Used by the Blog Clusters export (one "All" overview tab + one detailed tab
// per cluster). Kept framework-free so it can be unit-tested directly.

import AdmZip from "adm-zip";

export interface Sheet {
  name: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
}

const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 0 -> "A", 25 -> "Z", 26 -> "AA" ...
export function columnLetter(index: number): string {
  let n = index, out = "";
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
}

// Excel sheet-name rules: 1..31 chars, none of : \ / ? * [ ], not blank. Caller
// still de-dupes across a workbook (names must be unique).
export function sanitizeSheetName(raw: string): string {
  const cleaned = (raw || "Sheet").replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

/** Unique, Excel-legal tab names for a list of raw names, in order. */
export function uniqueSheetNames(rawNames: string[]): string[] {
  const used = new Set<string>();
  return rawNames.map((raw) => {
    const base = sanitizeSheetName(raw);
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      const suffix = ` ${i}`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function cellXml(ref: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

function rowXml(rowIndex: number, values: (string | number | null | undefined)[]): string {
  const cells = values.map((v, c) => cellXml(`${columnLetter(c)}${rowIndex}`, v)).join("");
  return `<row r="${rowIndex}">${cells}</row>`;
}

function sheetXml(sheet: Sheet): string {
  const header = rowXml(1, sheet.columns);
  const body = sheet.rows.map((r, i) => rowXml(i + 2, r)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${header}${body}</sheetData></worksheet>`;
}

/** Build an .xlsx workbook (as a Buffer) from the given sheets, in order. */
export function buildXlsx(sheets: Sheet[]): Buffer {
  const list = sheets.length ? sheets : [{ name: "Sheet1", columns: [], rows: [] }];
  const names = uniqueSheetNames(list.map((s) => s.name));

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `</Relationships>`;

  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes, "utf8"));
  zip.addFile("_rels/.rels", Buffer.from(rootRels, "utf8"));
  zip.addFile("xl/workbook.xml", Buffer.from(workbook, "utf8"));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(workbookRels, "utf8"));
  list.forEach((sheet, i) => zip.addFile(`xl/worksheets/sheet${i + 1}.xml`, Buffer.from(sheetXml(sheet), "utf8")));
  return zip.toBuffer();
}
