import * as XLSX from "xlsx";

export interface ParsedSubmissionFile {
  /** All non-empty raw values from Column A */
  allIds: string[];
  /** Deduplicated list — intra-file duplicates removed */
  uniqueIds: string[];
  /** Total count of non-empty Column A rows */
  totalIds: number;
  /** Count of intra-file duplicate rows */
  duplicateIds: number;
  /** Telegram file path (used to construct download URL) */
  filePath: string;
}

/**
 * Downloads a Telegram file and parses UIDs from Column A of the first sheet.
 *
 * Scanning strategy:
 *   - Always reads from A2 (index 1) downward.
 *   - Trusts !ref as a baseline but continues scanning beyond it to catch
 *     rows that fall outside the declared range in some Excel generators.
 *   - Stops only after seeing MAX_TRAILING_EMPTY consecutive empty Column A
 *     cells past the !ref boundary.
 *   - Handles string, number, formatted, and stub cell types.
 */
export async function downloadAndParseExcel(
  fileId: string,
  botToken: string,
): Promise<ParsedSubmissionFile> {
  // 1. Resolve Telegram file_path
  const infoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  if (!infoRes.ok) {
    throw new Error(`Telegram getFile request failed: ${infoRes.status}`);
  }
  const infoJson = (await infoRes.json()) as {
    ok: boolean;
    result?: { file_path: string };
    description?: string;
  };
  if (!infoJson.ok || !infoJson.result?.file_path) {
    throw new Error(
      `Telegram getFile error: ${infoJson.description ?? "unknown"}`,
    );
  }
  const filePath = infoJson.result.file_path;

  // 2. Download the binary content
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`,
  );
  if (!fileRes.ok) {
    throw new Error(`Failed to download Telegram file: ${fileRes.status}`);
  }
  const buffer = await fileRes.arrayBuffer();

  // 3. Parse with SheetJS (sparse / default mode)
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file contains no sheets.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Could not read the first sheet.");

  // 4. Determine the scan range
  //    !ref may underreport rows in some Excel generators, so we scan
  //    EXTRA_ROWS beyond it and stop on MAX_TRAILING_EMPTY consecutive empties.
  const ref = sheet["!ref"] ?? null;
  let refLastRow = -1;

  if (ref) {
    refLastRow = XLSX.utils.decode_range(ref).e.r;
  }

  console.log(`[Excel Debug] Worksheet !ref: ${ref ?? "none"}, refLastRow: ${refLastRow}`);

  const FIRST_DATA_ROW = 1;          // Row index 1 = A2 (skip header A1)
  const EXTRA_ROWS = 500;            // Rows to probe beyond !ref
  const MAX_TRAILING_EMPTY = 100;    // Stop after this many consecutive empty cells past !ref
  const ABSOLUTE_LIMIT = 100_000;    // Hard safety cap

  const scanLimit = refLastRow >= 0
    ? Math.min(refLastRow + EXTRA_ROWS, ABSOLUTE_LIMIT)
    : ABSOLUTE_LIMIT;

  const allIds: string[] = [];
  let skippedEmpty = 0;
  let totalScanned = 0;
  let trailingEmpty = 0;             // consecutive empty cells AFTER !ref boundary

  for (let rowIdx = FIRST_DATA_ROW; rowIdx <= scanLimit; rowIdx++) {
    // Past !ref: stop if we've seen too many consecutive empty cells
    if (rowIdx > refLastRow && trailingEmpty >= MAX_TRAILING_EMPTY) break;

    totalScanned++;
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c: 0 });
    const cell = sheet[addr] as XLSX.CellObject | undefined;

    // ── Missing / blank / error cells ─────────────────────────────────────
    if (!cell || cell.t === "z" || cell.t === "e" || cell.t === "b") {
      skippedEmpty++;
      if (rowIdx > refLastRow) trailingEmpty++;
      continue;
    }

    if (rowIdx > refLastRow) trailingEmpty = 0; // reset — found real data past !ref

    // ── Extract string value ───────────────────────────────────────────────
    let val = "";

    if (cell.t === "n") {
      // Numeric cell: prefer cell.w (formatted text) when it is a clean
      // digit-only string — this preserves leading zeros stored via
      // custom Excel number formats. Fall back to integer conversion.
      const w = typeof cell.w === "string" ? cell.w.trim() : "";
      if (/^\d+$/.test(w)) {
        val = w;
      } else {
        const num = cell.v as number;
        val = Number.isInteger(num) ? String(num) : String(Math.trunc(num));
      }
    } else if (cell.t === "s") {
      // String cell
      val = String(cell.v ?? "").trim();
    } else {
      // Fallback: try formatted then raw
      val = String(cell.w ?? cell.v ?? "").trim();
    }

    if (!val) {
      skippedEmpty++;
      if (rowIdx > refLastRow) trailingEmpty++;
      continue;
    }

    allIds.push(val);
  }

  console.log(`[Excel Debug] Total rows scanned: ${totalScanned}`);
  console.log(`[Excel Debug] Extracted IDs count: ${allIds.length}`);
  console.log(`[Excel Debug] Skipped empty/error rows: ${skippedEmpty}`);
  console.log(`[Excel Debug] First 10 IDs: ${JSON.stringify(allIds.slice(0, 10))}`);
  console.log(`[Excel Debug] Last 10 IDs: ${JSON.stringify(allIds.slice(-10))}`);

  // 5. Deduplicate (preserves first-occurrence order)
  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  let duplicateIds = 0;

  for (const id of allIds) {
    if (seen.has(id)) {
      duplicateIds++;
    } else {
      seen.add(id);
      uniqueIds.push(id);
    }
  }

  return { allIds, uniqueIds, totalIds: allIds.length, duplicateIds, filePath };
}
