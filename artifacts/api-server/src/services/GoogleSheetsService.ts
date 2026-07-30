/**
 * Google Sheets connection test service.
 *
 * Uses the Firebase service account (same JSON) to obtain a Sheets read-only
 * OAuth2 token, then performs a safe metadata-only GET on the target
 * spreadsheet.  No data is written or read from any cell.
 */

import type { ServiceAccount } from "../lib/firestore/auth";
import { getAccessTokenForSheets } from "../lib/firestore/auth";

export type SheetTestCode =
  | "SUCCESS"
  | "NOT_FOUND"
  | "WORKSHEET_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "INVALID_ID"
  | "API_ERROR";

export interface SheetTestResult {
  connected: boolean;
  message: string;
  code: SheetTestCode;
}

interface SpreadsheetsMetadata {
  sheets?: Array<{ properties: { title: string } }>;
}

export class GoogleSheetsService {
  constructor(private readonly sa: ServiceAccount) {}

  /**
   * Tests that:
   *  1. The service account can authenticate with Google APIs
   *  2. The spreadsheet exists and is accessible
   *  3. The named worksheet exists inside that spreadsheet
   *
   * Only fetches spreadsheet metadata (sheet titles). Does NOT read or write
   * any cell data.
   */
  async testConnection(sheetId: string, worksheetName: string): Promise<SheetTestResult> {
    // ── 1. Authenticate ────────────────────────────────────────────────────
    let token: string;
    try {
      token = await getAccessTokenForSheets(this.sa);
    } catch (err) {
      return {
        connected: false,
        message: "❌ Google API Error: Failed to authenticate with the service account",
        code: "API_ERROR",
      };
    }

    // ── 2. Fetch spreadsheet metadata (read-only, fields=sheets.properties.title) ──
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
      `?fields=sheets.properties.title`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      return {
        connected: false,
        message: "❌ Google API Error: Network request to Sheets API failed",
        code: "API_ERROR",
      };
    }

    // ── 3. Interpret HTTP status ───────────────────────────────────────────
    if (res.status === 400) {
      return {
        connected: false,
        message: "❌ Invalid Spreadsheet ID",
        code: "INVALID_ID",
      };
    }
    if (res.status === 403) {
      return {
        connected: false,
        message:
          "❌ Permission Denied: Share the spreadsheet with the service account email",
        code: "PERMISSION_DENIED",
      };
    }
    if (res.status === 404) {
      return {
        connected: false,
        message: "❌ Spreadsheet Not Found",
        code: "NOT_FOUND",
      };
    }
    if (!res.ok) {
      return {
        connected: false,
        message: `❌ Google API Error: HTTP ${res.status}`,
        code: "API_ERROR",
      };
    }

    // ── 4. Check worksheet exists ──────────────────────────────────────────
    const meta = (await res.json()) as SpreadsheetsMetadata;
    const sheetTitles = (meta.sheets ?? []).map((s) => s.properties.title);
    const worksheetExists = sheetTitles.includes(worksheetName);

    if (!worksheetExists) {
      const available = sheetTitles.length
        ? sheetTitles.join(", ")
        : "none found";
      return {
        connected: false,
        message: `❌ Worksheet Not Found: "${worksheetName}" does not exist. Available: ${available}`,
        code: "WORKSHEET_NOT_FOUND",
      };
    }

    return {
      connected: true,
      message: "✅ Connection Successful",
      code: "SUCCESS",
    };
  }
}
