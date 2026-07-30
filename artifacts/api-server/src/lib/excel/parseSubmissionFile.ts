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
 * Returns allIds (with duplicates), uniqueIds (deduplicated), counts, and
 * the Telegram file_path so the caller can store a stable reference.
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

  // 3. Parse with SheetJS — array mode so row[0] is Column A
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel file contains no sheets.");
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Could not read the first sheet.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  // 4. Extract non-empty Column A values
  const allIds: string[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const cell = row[0];
    if (cell === null || cell === undefined) continue;
    const val = String(cell).trim();
    if (val !== "") {
      allIds.push(val);
    }
  }

  // 5. Deduplicate (preserves first occurrence order)
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

  return {
    allIds,
    uniqueIds,
    totalIds: allIds.length,
    duplicateIds,
    filePath,
  };
}
