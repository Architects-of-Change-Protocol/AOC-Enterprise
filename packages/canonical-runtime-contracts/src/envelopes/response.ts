export interface RuntimeApiSuccessResponse<T = unknown> {
  readonly success: true;
  readonly data: T;
  readonly requestId?: string;
  readonly timestamp: string;
}

export interface RuntimeApiErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly reasonCodes?: ReadonlyArray<string>;
    readonly details?: Readonly<Record<string, unknown>>;
  };
  readonly requestId?: string;
  readonly timestamp: string;
}

export type RuntimeApiResponse<T = unknown> =
  | RuntimeApiSuccessResponse<T>
  | RuntimeApiErrorResponse;

export interface PaginatedResponse<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export interface GovernanceDecisionResponse {
  readonly requestId: string;
  readonly allowed: boolean;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly decisionId: string;
  readonly timestamp: string;
}

export interface IngestionResponse {
  readonly accepted: boolean;
  readonly ingestionId?: string;
  readonly reasonCodes?: ReadonlyArray<string>;
  readonly timestamp: string;
}
