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

  // 3. Parse with SheetJS — dense: false so we can access cells directly
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", dense: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel file contains no sheets.");
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Could not read the first sheet.");
  }

  // 4. Determine the full worksheet range using !ref
  const ref = sheet["!ref"];
  if (!ref) {
    console.log("[Excel Debug] Worksheet has no !ref — empty sheet");
    return {
      allIds: [],
      uniqueIds: [],
      totalIds: 0,
      duplicateIds: 0,
      filePath,
    };
  }

  const range = XLSX.utils.decode_range(ref);
  const firstDataRow = 1; // Row index 1 = row 2 (skip header row 0)
  const lastRow = range.e.r;

  console.log(`[Excel Debug] Worksheet range: ${ref}`);
  console.log(`[Excel Debug] Total rows to scan: ${lastRow - firstDataRow + 1} (rows ${firstDataRow + 1}–${lastRow + 1})`);

  // 5. Scan EVERY row in Column A — never stop early
  const allIds: string[] = [];
  let skippedEmpty = 0;

  for (let rowIdx = firstDataRow; rowIdx <= lastRow; rowIdx++) {
    const cellAddress = XLSX.utils.encode_cell({ r: rowIdx, c: 0 }); // Column A
    const cell = sheet[cellAddress];

    // Skip truly empty / missing cells
    if (cell === undefined || cell === null) {
      skippedEmpty++;
      continue;
    }

    // Use cell.w (formatted text) when available to preserve leading zeros,
    // otherwise fall back to cell.v (raw value) converted safely to string.
    let val: string;
    if (cell.w !== undefined && cell.w !== null) {
      val = String(cell.w).trim();
    } else if (cell.v !== undefined && cell.v !== null) {
      val = String(cell.v).trim();
    } else {
      skippedEmpty++;
      continue;
    }

    if (val === "") {
      skippedEmpty++;
      continue;
    }

    allIds.push(val);
  }

  console.log(`[Excel Debug] Extracted IDs count: ${allIds.length}`);
  console.log(`[Excel Debug] Skipped empty rows: ${skippedEmpty}`);
  console.log(`[Excel Debug] First 10 IDs: ${JSON.stringify(allIds.slice(0, 10))}`);
  console.log(`[Excel Debug] Last 10 IDs: ${JSON.stringify(allIds.slice(-10))}`);

  // 6. Deduplicate (preserves first occurrence order)
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
