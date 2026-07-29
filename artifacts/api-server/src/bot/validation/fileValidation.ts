export const DEFAULT_SUBMISSION_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const XLSX_EXTENSION = /\.xlsx$/i;
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/octet-stream",
]);

export interface TelegramDocumentMetadata {
  file_id: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function getSubmissionMaxFileSize(
  configuredValue?: string,
): number {
  const parsed = Number(configuredValue);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SUBMISSION_MAX_FILE_SIZE_BYTES;
}

export function validateSubmissionFile(
  document: TelegramDocumentMetadata | undefined,
  maxFileSizeBytes = DEFAULT_SUBMISSION_MAX_FILE_SIZE_BYTES,
): FileValidationResult {
  if (!document?.file_id || !document.file_name) {
    return { valid: false, error: "Please upload an .xlsx file." };
  }

  if (!XLSX_EXTENSION.test(document.file_name)) {
    return { valid: false, error: "Only .xlsx files are accepted." };
  }

  if (document.file_size === 0) {
    return { valid: false, error: "The uploaded file is empty." };
  }

  if (
    document.file_size !== undefined &&
    document.file_size > maxFileSizeBytes
  ) {
    const maxMegabytes = Math.round(maxFileSizeBytes / (1024 * 1024));
    return {
      valid: false,
      error: `The file is too large. Maximum allowed size is ${maxMegabytes} MB.`,
    };
  }

  if (document.mime_type && !XLSX_MIME_TYPES.has(document.mime_type)) {
    return { valid: false, error: "The uploaded file type is invalid." };
  }

  return { valid: true };
}