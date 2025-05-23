import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.ts';

/**
 * Interface for CSV header column definition
 */
interface CsvHeaderItem {
  id: string;
  title: string;
}

/**
 * CSV Writer class for creating CSV files from object arrays
 */
export class ObjectCsvWriter {
  private path: string;
  private header: CsvHeaderItem[];
  private encoding: BufferEncoding;
  private append: boolean;

  /**
   * Creates a new CSV writer
   *
   * @param options Configuration for CSV writer
   * @param options.path Path to the output CSV file
   * @param options.header Array of column definitions (id and title)
   * @param options.encoding File encoding (default: 'utf8')
   * @param options.append Whether to append to existing file (default: false)
   */
  constructor(options: {
    path: string;
    header: CsvHeaderItem[];
    encoding?: BufferEncoding;
    append?: boolean;
  }) {
    this.path = options.path;
    this.header = options.header;
    this.encoding = options.encoding || 'utf8';
    this.append = options.append || false;

    // Create directory if it doesn't exist
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Write records to CSV file
   *
   * @param records Array of objects to write to CSV
   * @returns Promise that resolves when writing is complete
   */
  async writeRecords<T extends Record<string, any>>(
    records: T[]
  ): Promise<void> {
    try {
      // Generate CSV content
      const headerRow = this.header
        .map((column) => this.escapeValue(column.title))
        .join(',');
      const rows = records.map((record) => {
        return this.header
          .map((column) => {
            const value = record[column.id];
            return this.escapeValue(value);
          })
          .join(',');
      });

      // Combine header and data rows
      const content = [headerRow, ...rows].join('\n');

      // Write to file
      if (this.append && fs.existsSync(this.path)) {
        // If appending, don't include header if file exists
        const rowsOnly = rows.join('\n');
        await fs.promises.appendFile(this.path, '\n' + rowsOnly, {
          encoding: this.encoding,
        });
      } else {
        await fs.promises.writeFile(this.path, content, {
          encoding: this.encoding,
        });
      }

      logger.info(
        `Successfully wrote ${records.length} records to ${this.path}`
      );
    } catch (error) {
      logger.error(`Failed to write CSV file to ${this.path}:`, error);
      throw error;
    }
  }

  /**
   * Escape special characters in CSV values
   *
   * @param value Value to escape
   * @returns Escaped CSV value
   */
  private escapeValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Convert to string and clean up
    const stringValue = String(value)
      .replace(/[\r\n]+/g, ' ') // Replace line breaks with spaces
      .trim();

    // Check if value needs to be quoted
    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      // Escape quotes by doubling them and wrap in quotes
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }
}

/**
 * Create a CSV writer for objects
 *
 * @param options Configuration options
 * @returns ObjectCsvWriter instance
 */
export function createObjectCsvWriter(options: {
  path: string;
  header: CsvHeaderItem[];
  encoding?: BufferEncoding;
  append?: boolean;
}): ObjectCsvWriter {
  return new ObjectCsvWriter(options);
}

/**
 * Helper function to generate a CSV file from an array of objects
 *
 * @param records Array of objects to convert to CSV
 * @param filePath Output file path
 * @param headers Optional header definitions (if omitted, will use object keys)
 * @returns Promise resolving to true if successful
 */
export async function generateCsvFile<T extends Record<string, any>>(
  records: T[],
  filePath: string,
  headers?: CsvHeaderItem[]
): Promise<boolean> {
  try {
    // If headers not provided, generate from first record
    if (!headers && records.length > 0) {
      headers = Object.keys(records[0]).map((key) => ({
        id: key,
        title: key.toUpperCase(),
      }));
    }

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headers || [],
    });

    // Write records
    await csvWriter.writeRecords(records);
    logger.info(`Successfully generated CSV file: ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to generate CSV file:`, error);
    throw error;
  }
}
