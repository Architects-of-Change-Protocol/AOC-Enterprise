export interface PolicyPackScope {
  readonly trustDomainIds?: readonly string[];
  readonly jurisdictions?: readonly string[];
  readonly countries?: readonly string[];
  readonly regions?: readonly string[];
  readonly industries?: readonly string[];
  readonly customerIds?: readonly string[];
  readonly domains?: readonly string[];
  readonly actions?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly resourceScopes?: readonly string[];
  readonly actorTypes?: readonly string[];
  readonly dataDomains?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
