export type CitationAnchorType = 'document' | 'section' | 'clause' | 'page' | 'line' | 'field' | 'record' | 'event' | 'manual';

/**
 * A stable, manually-declared location within a source document. This
 * runtime never extracts an anchor from document content (no parsing, no
 * OCR) -- anchors are always supplied by the caller.
 */
export interface CitationAnchor {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly type: CitationAnchorType;
  readonly label: string;
  readonly locator?: string;
  readonly textHash?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
