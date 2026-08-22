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

/**
 * Pick the delimiter a CSV actually uses, by counting candidates outside
 * quoted sections of the first line. Norwegian-locale Excel writes `;`, not
 * `,` (the same locale quirk noted for the activity-table export above), and a
 * hand-maintained sheet may well be tab-separated — so the delimiter is
 * sniffed rather than assumed.
 */
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;

  for (const candidate of [",", ";", "\t"]) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i];
      if (char === '"') {
        // A doubled quote inside a quoted field is an escaped quote, not a
        // section boundary.
        if (inQuotes && firstLine[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === candidate && !inQuotes) {
        count += 1;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Parse CSV text into rows of fields, per RFC 4180.
 * - `delimiter` defaults to whatever sniffDelimiter finds
 * - handles quoted fields, doubled quotes, and delimiters/newlines inside them
 * - accepts CRLF, LF, or CR line endings
 * - strips a leading UTF-8 BOM (Excel writes one)
 * - drops trailing blank lines, but keeps blank fields
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sep = delimiter ?? sniffDelimiter(body);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (inQuotes) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      // CRLF or a lone CR both end the record; skip the LF half of a CRLF.
      if (body[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += char;
    }
  }

  // A file not ending in a newline still has one last record to flush.
  if (field !== "" || row.length) endRow();

  // Trailing newlines produce a final [""] row that means nothing.
  while (rows.length && rows[rows.length - 1].every((cell) => cell === "")) {
    rows.pop();
  }

  return rows;
}
