/**
 * Escape a single CSV field according to RFC 4180.
 * - null becomes empty string
 * - numbers are stringified without quoting
 * - strings are quoted if they contain comma, double quote, CR, or LF
 * - double quotes are escaped by doubling
 */
export function escapeCsvField(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  const str = String(value);

  // Check if field needs quoting: contains comma, quote, CR, or LF
  const needsQuoting =
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\r") ||
    str.includes("\n");

  if (!needsQuoting) {
    return str;
  }

  // Escape double quotes by doubling them, then wrap in quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Convert headers and rows to CSV format according to RFC 4180.
 * - Records are separated by CRLF
 * - Each field is escaped using escapeCsvField
 * - Empty rows result in just headers (no trailing CRLF)
 */
export function toCsv(
  headers: string[],
  rows: (string | number | null)[][]
): string {
  const escapedHeaders = headers.map(escapeCsvField).join(",");

  if (rows.length === 0) {
    return escapedHeaders;
  }

  const escapedRows = rows.map((row) =>
    row.map(escapeCsvField).join(",")
  );

  return escapedHeaders + "\r\n" + escapedRows.join("\r\n");
}
