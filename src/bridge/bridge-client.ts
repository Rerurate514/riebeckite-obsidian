import type { Disposable } from "../lifecycle/resource-registry";

export type BridgeConnectionState =
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "connected"; status: BridgeStatus }
  | { kind: "incompatible"; message: string }
  | { kind: "unauthorized"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

export type BridgeStatus = {
  protocolVersion: 1;
  server: { id: string; version: string };
  capabilities: readonly string[];
  development: {
    available: boolean;
    revision: number;
    build: { status: "ready"; completedAt: number } | { status: "unavailable" };
  };
  inspection: { available: boolean };
  identity?: BridgeIdentity;
};

export type BridgeIdentity = {
  siteId: string;
  siteName: string;
  contentRootId: string;
  contentSourceKind:
    | "integrated"
    | "separate-local"
    | "separate-git"
    | "custom-mapping";
};

export type BridgePage = {
  source: string;
  page: string;
  visibility: "public" | "unlisted" | "draft" | "scheduled";
  routable: boolean;
  discoverable: boolean;
  locale: string | null;
  publishAt: string | null;
  revision: number;
  productionUrl: string | null;
};

export type BridgePageResult =
  | { kind: "resolved"; page: BridgePage; previewUrl: string }
  | { kind: "unavailable" }
  | { kind: "not-found" }
  | { kind: "invalid-source" }
  | { kind: "error" };

export type BridgePublication = {
  source: string;
  permalink: string;
  locale: string | null;
  visibility: "public" | "unlisted" | "draft" | "scheduled";
  routable: boolean;
  discoverable: boolean;
  publishAt: string | null;
  publicLocation: unknown;
  canonicalUrl: string | null;
  redirects: readonly BridgeRedirect[];
  reasons: readonly string[];
  revision: number;
  seo?: BridgePublicationSeo;
};

export type BridgePublicationSeo = {
  title: string;
  description: string | null;
  canonicalUrl: string | null;
  indexable: boolean;
  issues: readonly string[];
};

export type BridgeRedirect = { from: string; to: string; status: number };

export type BridgeDiagnostic = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  category: string;
  source: { path: string; line?: number; column?: number } | undefined;
  related: readonly { target: string }[];
  fix: { kind: string; description: string } | undefined;
};

export type BridgeImpact = {
  completeness: "complete" | "unknown";
  affectedOutputs: readonly BridgeImpactOutput[];
  unchangedOutputs: readonly BridgeImpactOutput[];
  removedOutputs: readonly BridgeImpactOutput[];
  fullRegenerationRequired: boolean;
};

export type BridgeImpactOutput = {
  path: string;
  producer: string;
  dependencies: readonly { type: string; slug?: string }[];
  reason: { type: string; slug?: string };
};

export type BridgeInspectionResult<T> =
  | { kind: "resolved"; value: T; revision: number }
  | { kind: "unavailable" }
  | { kind: "not-found" }
  | { kind: "unsupported" }
  | { kind: "error" };

export type BridgeRequest = (input: {
  url: string;
  method: string;
  headers: Record<string, string>;
  throw: boolean;
  body?: string;
}) => Promise<{ status: number; json: unknown }>;

export type BridgeMutationPlan = {
  id: string;
  changes: readonly unknown[];
  warnings: readonly unknown[];
};

export type BridgeMutationResult = {
  planId: string;
  applied: boolean;
  conflicts: readonly { code: string }[];
};

export type BridgeMutationResponse<T> =
  | { kind: "resolved"; value: T }
  | { kind: "unauthorized" }
  | { kind: "unavailable" }
  | { kind: "conflict" }
  | { kind: "expired" }
  | { kind: "not-found" }
  | { kind: "error" };

export class BridgeClient implements Disposable {
  private state: BridgeConnectionState = { kind: "disconnected" };
  private connection: Promise<BridgeConnectionState> | undefined;
  private disposed = false;
  private generation = 0;
  private privateOrigin: string | undefined;

  constructor(
    private readonly request: BridgeRequest,
    private readonly timeoutMs = 5_000,
  ) {}

  getState(): BridgeConnectionState {
    return this.state;
  }

  connect(serverUrl: string, token: string): Promise<BridgeConnectionState> {
    if (this.disposed) return Promise.resolve({ kind: "disconnected" });
    if (this.connection) return this.connection;
    this.state = { kind: "connecting" };
    this.connection = this.connectOnce(serverUrl, token).finally(() => {
      this.connection = undefined;
    });
    return this.connection;
  }

  disconnect(): void {
    this.generation += 1;
    this.privateOrigin = undefined;
    this.state = { kind: "disconnected" };
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
  }

  async resolvePage(
    serverUrl: string,
    token: string,
    source: string,
  ): Promise<BridgePageResult> {
    const origin = this.privateOrigin;
    if (this.disposed || !origin || !isContentPath(source)) {
      return { kind: "unavailable" };
    }
    const generation = this.generation;
    try {
      const response = await this.requestWithTimeout({
        url: `${origin}/__riebeckite/bridge/v1/page?source=${encodeURIComponent(source)}`,
        method: "GET",
        headers: {
          "x-riebeckite-bridge-token": token,
          "x-riebeckite-bridge-protocol": "1",
        },
        throw: false,
      });
      if (this.disposed || generation !== this.generation)
        return { kind: "unavailable" };
      if (response.status !== 200 || !isRecord(response.json))
        return { kind: "error" };
      if (response.json.status === "unavailable")
        return { kind: "unavailable" };
      if (response.json.status === "not-found") return { kind: "not-found" };
      if (response.json.status === "invalid-source")
        return { kind: "invalid-source" };
      const page = parsePage(response.json);
      return page
        ? {
            kind: "resolved",
            page,
            previewUrl: new URL(page.page, serverUrl).toString(),
          }
        : { kind: "error" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  getRevision(): number | undefined {
    const state = this.state;
    return state.kind === "connected"
      ? state.status.development.revision
      : undefined;
  }

  hasCapability(capability: string): boolean {
    const state = this.state;
    return (
      state.kind === "connected" &&
      state.status.capabilities.includes(capability)
    );
  }

  async refreshStatus(token: string): Promise<BridgeConnectionState> {
    const origin = this.privateOrigin;
    if (this.disposed || !origin) return this.state;
    const generation = this.generation;
    try {
      const response = await this.requestWithTimeout({
        url: `${origin}/__riebeckite/bridge/v1`,
        method: "GET",
        headers: {
          "x-riebeckite-bridge-token": token,
          "x-riebeckite-bridge-protocol": "1",
        },
        throw: false,
      });
      if (this.disposed || generation !== this.generation) return this.state;
      if (response.status === 403)
        return this.setState({
          kind: "unauthorized",
          message: "Pairing was rejected.",
        });
      const status =
        response.status === 200 ? parseStatus(response.json) : undefined;
      return status
        ? this.setConnected(origin, status)
        : this.setState({
            kind: "unavailable",
            message: "Bridge is unavailable.",
          });
    } catch {
      if (this.disposed || generation !== this.generation) return this.state;
      return this.setState({
        kind: "unavailable",
        message: "Could not reach the Bridge.",
      });
    }
  }

  inspectPublication(
    token: string,
    source: string,
  ): Promise<BridgeInspectionResult<BridgePublication>> {
    return this.inspect("publication", token, source, parsePublication);
  }

  inspectDiagnostics(
    token: string,
    source: string,
  ): Promise<BridgeInspectionResult<readonly BridgeDiagnostic[]>> {
    return this.inspect("diagnostics", token, source, parseDiagnostics);
  }

  inspectImpact(
    token: string,
    source: string,
  ): Promise<BridgeInspectionResult<BridgeImpact>> {
    return this.inspect("impact", token, source, parseImpact);
  }

  planFrontmatter(
    token: string,
    mutationToken: string,
    path: string,
    set: Record<string, unknown>,
    remove: readonly string[],
  ): Promise<BridgeMutationResponse<BridgeMutationPlan>> {
    return this.mutate(
      "mutations/plan",
      token,
      mutationToken,
      {
        operations: [{ kind: "frontmatter", path, set, remove }],
      },
      parseMutationPlan,
    );
  }

  applyMutation(
    token: string,
    mutationToken: string,
    planId: string,
  ): Promise<BridgeMutationResponse<BridgeMutationResult>> {
    return this.mutate(
      `mutations/${encodeURIComponent(planId)}/apply`,
      token,
      mutationToken,
      {},
      parseMutationResult,
    );
  }

  private async mutate<T>(
    endpoint: string,
    token: string,
    mutationToken: string,
    body: Record<string, unknown>,
    parse: (value: unknown) => T | undefined,
  ): Promise<BridgeMutationResponse<T>> {
    const origin = this.privateOrigin;
    if (
      this.disposed ||
      !origin ||
      token.length < 32 ||
      mutationToken.length < 32
    )
      return { kind: "unavailable" };
    const generation = this.generation;
    try {
      const response = await this.requestWithTimeout({
        url: `${origin}/__riebeckite/bridge/v1/${endpoint}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-riebeckite-bridge-token": token,
          "x-riebeckite-bridge-protocol": "1",
          "x-riebeckite-bridge-mutation-token": mutationToken,
        },
        body: JSON.stringify(body),
        throw: false,
      });
      if (this.disposed || generation !== this.generation)
        return { kind: "unavailable" };
      if (response.status === 403) return { kind: "unauthorized" };
      const value = parse(response.json);
      const failure = mutationFailureKind(
        response.status,
        response.json,
        value,
      );
      if (failure) return { kind: failure };
      if (response.status !== 200) return { kind: "error" };
      return value ? { kind: "resolved", value } : { kind: "error" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  private async inspect<T>(
    capability: "publication" | "diagnostics" | "impact",
    token: string,
    source: string,
    parse: (value: Record<string, unknown>) => T | undefined,
  ): Promise<BridgeInspectionResult<T>> {
    const origin = this.privateOrigin;
    if (this.disposed || !origin || !isContentPath(source))
      return { kind: "unavailable" };
    if (
      !this.hasCapability(capability === "impact" ? "build-impact" : capability)
    )
      return { kind: "unsupported" };
    const generation = this.generation;
    try {
      const response = await this.requestWithTimeout({
        url: `${origin}/__riebeckite/bridge/v1/${capability}?path=${encodeURIComponent(source)}`,
        method: "GET",
        headers: {
          "x-riebeckite-bridge-token": token,
          "x-riebeckite-bridge-protocol": "1",
        },
        throw: false,
      });
      if (this.disposed || generation !== this.generation)
        return { kind: "unavailable" };
      if (response.status !== 200 || !isRecord(response.json))
        return { kind: "error" };
      if (response.json.status === "unavailable")
        return { kind: "unavailable" };
      if (response.json.status === "not-found") return { kind: "not-found" };
      if (response.json.status === "unsupported")
        return { kind: "unsupported" };
      const revision = response.json.revision;
      const value = parse(response.json);
      return value && typeof revision === "number" && Number.isInteger(revision)
        ? { kind: "resolved", value, revision }
        : { kind: "error" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  private async connectOnce(
    serverUrl: string,
    token: string,
  ): Promise<BridgeConnectionState> {
    const generation = this.generation;
    if (token.length < 32) {
      return this.setState({
        kind: "unauthorized",
        message: "A Bridge pairing token is required.",
      });
    }
    try {
      const bootstrap = await this.requestWithTimeout({
        url: `${serverUrl}/__riebeckite/bridge/bootstrap`,
        method: "GET",
        headers: { "x-riebeckite-bridge-token": token },
        throw: false,
      });
      if (this.disposed || generation !== this.generation) return this.state;
      if (bootstrap.status === 403) {
        return this.setState({
          kind: "unauthorized",
          message: "Pairing was rejected.",
        });
      }
      if (bootstrap.status !== 200) {
        return this.setState({
          kind: "unavailable",
          message: "Bridge is unavailable.",
        });
      }
      const origin = parseBootstrap(bootstrap.json);
      if (!origin) {
        return this.setState({
          kind: "error",
          message: "Bridge returned an invalid response.",
        });
      }
      const response = await this.requestWithTimeout({
        url: `${origin}/__riebeckite/bridge/v1`,
        method: "GET",
        headers: {
          "x-riebeckite-bridge-token": token,
          "x-riebeckite-bridge-protocol": "1",
        },
        throw: false,
      });
      if (this.disposed || generation !== this.generation) return this.state;
      if (response.status === 403) {
        return this.setState({
          kind: "unauthorized",
          message: "Pairing was rejected.",
        });
      }
      if (response.status === 426) {
        return this.setState({
          kind: "incompatible",
          message: "Bridge Protocol v1 is not supported.",
        });
      }
      if (response.status !== 200) {
        return this.setState({
          kind: "unavailable",
          message: "Bridge is unavailable.",
        });
      }
      const status = parseStatus(response.json);
      return status && !this.disposed && generation === this.generation
        ? this.setConnected(origin, status)
        : this.setState({
            kind: "error",
            message: "Bridge returned an invalid response.",
          });
    } catch {
      if (this.disposed || generation !== this.generation) return this.state;
      return this.setState({
        kind: "unavailable",
        message: "Could not reach the Bridge.",
      });
    }
  }

  private setState(state: BridgeConnectionState): BridgeConnectionState {
    if (!this.disposed) this.state = state;
    return this.state;
  }

  private setConnected(
    origin: string,
    status: BridgeStatus,
  ): BridgeConnectionState {
    this.privateOrigin = origin;
    return this.setState({ kind: "connected", status });
  }

  private async requestWithTimeout(
    input: Parameters<BridgeRequest>[0],
  ): Promise<Awaited<ReturnType<BridgeRequest>>> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.request(input),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Bridge timed out.")),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

function parsePage(value: Record<string, unknown>): BridgePage | undefined {
  if (
    value.status !== "resolved" ||
    typeof value.source !== "string" ||
    typeof value.page !== "string" ||
    !["public", "unlisted", "draft", "scheduled"].includes(
      String(value.visibility),
    ) ||
    typeof value.routable !== "boolean" ||
    typeof value.discoverable !== "boolean" ||
    !(typeof value.locale === "string" || value.locale === null) ||
    !(
      typeof value.publishAt === "string" ||
      value.publishAt === null ||
      value.publishAt === undefined
    ) ||
    !(
      typeof value.productionUrl === "string" || value.productionUrl === null
    ) ||
    !Number.isInteger(value.revision)
  )
    return undefined;
  if (value.identity !== undefined && !isBridgeIdentity(value.identity))
    return undefined;
  const { status: _, publishAt, ...page } = value;
  return { ...page, publishAt: publishAt ?? null } as unknown as BridgePage;
}

function isBridgeIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.siteId === "string" &&
    typeof value.siteName === "string" &&
    typeof value.contentRootId === "string" &&
    ["integrated", "separate-local", "separate-git", "custom-mapping"].includes(
      String(value.contentSourceKind),
    )
  );
}

function parsePublication(
  value: Record<string, unknown>,
): BridgePublication | undefined {
  if (
    value.status !== "resolved" ||
    !isRecord(value.entry) ||
    !isRecord(value.entry.source) ||
    typeof value.entry.source.path !== "string" ||
    typeof value.entry.permalink !== "string" ||
    !(typeof value.entry.locale === "string" || value.entry.locale === null) ||
    !isRecord(value.publication)
  )
    return undefined;
  const publication = value.publication;
  if (
    !["public", "unlisted", "draft", "scheduled"].includes(
      String(publication.visibility),
    ) ||
    typeof publication.routable !== "boolean" ||
    typeof publication.discoverable !== "boolean" ||
    !(
      typeof publication.publishAt === "string" ||
      publication.publishAt === null ||
      publication.publishAt === undefined
    ) ||
    !Array.isArray(publication.redirects) ||
    !publication.redirects.every(isRedirect) ||
    !Array.isArray(publication.reasons) ||
    !publication.reasons.every((reason) => typeof reason === "string")
  )
    return undefined;
  if (
    !(
      typeof publication.canonicalUrl === "string" ||
      publication.canonicalUrl == null
    )
  )
    return undefined;
  const seo =
    publication.seo === undefined
      ? undefined
      : parsePublicationSeo(publication.seo);
  return {
    source: value.entry.source.path,
    permalink: value.entry.permalink,
    locale: value.entry.locale,
    visibility: publication.visibility as BridgePublication["visibility"],
    routable: publication.routable,
    discoverable: publication.discoverable,
    publishAt: publication.publishAt ?? null,
    publicLocation: publication.publicLocation,
    canonicalUrl: publication.canonicalUrl ?? null,
    redirects: publication.redirects,
    reasons: publication.reasons,
    revision: value.revision as number,
    ...(seo === undefined ? {} : { seo }),
  };
}

function parsePublicationSeo(value: unknown): BridgePublicationSeo | undefined {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    !(typeof value.description === "string" || value.description === null) ||
    !(typeof value.canonicalUrl === "string" || value.canonicalUrl === null) ||
    typeof value.indexable !== "boolean" ||
    !Array.isArray(value.issues) ||
    !value.issues.every((issue) => typeof issue === "string")
  )
    return undefined;
  return {
    title: value.title,
    description: value.description,
    canonicalUrl: value.canonicalUrl,
    indexable: value.indexable,
    issues: value.issues,
  };
}

function parseDiagnostics(
  value: Record<string, unknown>,
): readonly BridgeDiagnostic[] | undefined {
  if (value.status !== "resolved" || !Array.isArray(value.diagnostics))
    return undefined;
  const diagnostics = value.diagnostics.map(parseDiagnostic);
  return diagnostics.every((diagnostic) => diagnostic !== undefined)
    ? (diagnostics as BridgeDiagnostic[])
    : undefined;
}

function parseImpact(value: Record<string, unknown>): BridgeImpact | undefined {
  if (value.status !== "resolved" || !isRecord(value.impact)) return undefined;
  const impact = value.impact;
  const outputs = [
    impact.affectedOutputs,
    impact.unchangedOutputs,
    impact.removedOutputs,
  ];
  if (
    !["complete", "unknown"].includes(String(impact.completeness)) ||
    typeof impact.fullRegenerationRequired !== "boolean" ||
    !outputs.every(
      (output) =>
        Array.isArray(output) &&
        output.every((item) => parseImpactOutput(item)),
    )
  )
    return undefined;
  return {
    completeness: impact.completeness as BridgeImpact["completeness"],
    affectedOutputs: (impact.affectedOutputs as unknown[]).map(
      parseImpactOutput,
    ) as BridgeImpactOutput[],
    unchangedOutputs: (impact.unchangedOutputs as unknown[]).map(
      parseImpactOutput,
    ) as BridgeImpactOutput[],
    removedOutputs: (impact.removedOutputs as unknown[]).map(
      parseImpactOutput,
    ) as BridgeImpactOutput[],
    fullRegenerationRequired: impact.fullRegenerationRequired,
  };
}

function parseMutationPlan(value: unknown): BridgeMutationPlan | undefined {
  return isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.changes) &&
    Array.isArray(value.warnings)
    ? { id: value.id, changes: value.changes, warnings: value.warnings }
    : undefined;
}

function parseMutationResult(value: unknown): BridgeMutationResult | undefined {
  if (
    !isRecord(value) ||
    typeof value.planId !== "string" ||
    typeof value.applied !== "boolean" ||
    !Array.isArray(value.conflicts) ||
    !value.conflicts.every(
      (conflict) => isRecord(conflict) && typeof conflict.code === "string",
    )
  )
    return undefined;
  return {
    planId: value.planId,
    applied: value.applied,
    conflicts: value.conflicts as { code: string }[],
  };
}

function mutationFailureKind(
  status: number,
  response: unknown,
  value: unknown,
): "conflict" | "expired" | "not-found" | undefined {
  const codes = mutationCodes(response);
  if (status === 410 || codes.some((code) => code.includes("expired")))
    return "expired";
  if (
    status === 404 ||
    codes.some(
      (code) =>
        code.includes("not-found") ||
        code.includes("not_found") ||
        code.includes("missing"),
    )
  )
    return "not-found";
  if (status === 409 || isRejectedMutationResult(value)) return "conflict";
  return undefined;
}

function mutationCodes(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const codes = [value.code, value.reason];
  if (Array.isArray(value.conflicts))
    codes.push(
      ...value.conflicts.map((conflict) =>
        isRecord(conflict) ? conflict.code : undefined,
      ),
    );
  return codes
    .filter((code): code is string => typeof code === "string")
    .map((code) => code.toLowerCase());
}

function isRejectedMutationResult(value: unknown): boolean {
  return isRecord(value) && value.applied === false;
}

function parseDiagnostic(value: unknown): BridgeDiagnostic | undefined {
  if (!isRecord(value)) return undefined;
  const source = value.source;
  if (
    typeof value.code !== "string" ||
    !["error", "warning", "info"].includes(String(value.severity)) ||
    typeof value.message !== "string" ||
    typeof value.category !== "string" ||
    !(source === undefined || isDiagnosticSource(source)) ||
    !(value.related === undefined || Array.isArray(value.related)) ||
    !(value.related ?? []).every(
      (related) => isRecord(related) && typeof related.target === "string",
    )
  )
    return undefined;
  if (
    value.fix !== undefined &&
    (!isRecord(value.fix) ||
      typeof value.fix.kind !== "string" ||
      typeof value.fix.description !== "string")
  )
    return undefined;
  return {
    code: value.code,
    severity: value.severity as BridgeDiagnostic["severity"],
    message: value.message,
    category: value.category,
    source: isRecord(source)
      ? {
          path: source.path as string,
          ...(typeof source.line === "number" ? { line: source.line } : {}),
          ...(typeof source.column === "number"
            ? { column: source.column }
            : {}),
        }
      : undefined,
    related: (value.related ?? []) as BridgeDiagnostic["related"],
    fix: value.fix as BridgeDiagnostic["fix"],
  };
}

function parseImpactOutput(value: unknown): BridgeImpactOutput | undefined {
  if (!isRecord(value) || typeof value.path !== "string") return undefined;
  if (value.producer !== undefined && typeof value.producer !== "string")
    return undefined;
  if (
    value.dependencies !== undefined &&
    (!Array.isArray(value.dependencies) ||
      !value.dependencies.every(
        (dependency) =>
          isRecord(dependency) &&
          typeof dependency.type === "string" &&
          (typeof dependency.slug === "string" ||
            dependency.slug === undefined),
      ))
  )
    return undefined;
  if (
    value.reason !== undefined &&
    (!isRecord(value.reason) ||
      typeof value.reason.type !== "string" ||
      (typeof value.reason.slug !== "string" &&
        value.reason.slug !== undefined))
  )
    return undefined;
  return {
    path: value.path,
    producer: value.producer ?? "unknown",
    dependencies: (value.dependencies ??
      []) as BridgeImpactOutput["dependencies"],
    reason: (value.reason ?? {
      type: "unavailable",
    }) as BridgeImpactOutput["reason"],
  } as BridgeImpactOutput;
}

function isDiagnosticSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    (typeof value.line === "number" || value.line === undefined) &&
    (typeof value.column === "number" || value.column === undefined)
  );
}

function isRedirect(value: unknown): value is BridgeRedirect {
  return (
    isRecord(value) &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    Number.isInteger(value.status)
  );
}

function isContentPath(value: string): boolean {
  return !(
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.split(/[\\/]+/).some((part) => part === ".." || part === "")
  );
}

function parseBootstrap(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.origin !== "string") return undefined;
  try {
    const url = new URL(value.origin);
    return url.protocol === "http:" && isLoopbackHost(url.hostname)
      ? url.toString().replace(/\/$/, "")
      : undefined;
  } catch {
    return undefined;
  }
}

function parseStatus(value: unknown): BridgeStatus | undefined {
  if (!isRecord(value) || value.protocolVersion !== 1) return undefined;
  if (
    !isRecord(value.server) ||
    typeof value.server.id !== "string" ||
    typeof value.server.version !== "string"
  )
    return undefined;
  if (
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every((item) => typeof item === "string")
  )
    return undefined;
  if (
    !isRecord(value.development) ||
    typeof value.development.available !== "boolean" ||
    !Number.isInteger(value.development.revision) ||
    !isRecord(value.development.build)
  )
    return undefined;
  const build = value.development.build;
  if (build.status === "ready" && typeof build.completedAt === "number") {
    return isRecord(value.inspection) &&
      typeof value.inspection.available === "boolean"
      ? (value as BridgeStatus)
      : undefined;
  }
  if (build.status === "unavailable" && Object.keys(build).length === 1) {
    return isRecord(value.inspection) &&
      typeof value.inspection.available === "boolean"
      ? (value as BridgeStatus)
      : undefined;
  }
  return undefined;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    /^127\.\d+\.\d+\.\d+$/.test(normalized)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
