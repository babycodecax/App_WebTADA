/**
 * Khai báo kiểu cho 'pdf-parse/lib/pdf-parse.js' (CommonJS, không kèm types).
 * Import trực tiếp lib để tránh bug debug-mode của index.js (pdf-parse 1.1.1).
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseOptions {
    pagerender?: (pageData: unknown) => Promise<string> | string;
    max?: number;
    version?: string;
  }

  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
    version: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: PdfParseOptions): Promise<PdfParseResult>;

  export = pdfParse;
}
