declare module 'word-extractor' {
  interface WordDocument {
    getBody(): string;
    getHeader(): string;
    getFooter(): string;
  }
  export default class WordExtractor {
    extract(buffer: Buffer): Promise<WordDocument>;
  }
}
