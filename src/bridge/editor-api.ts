import type {
  BridgeClient,
  BridgeDiagnostic,
  BridgeImpact,
  BridgeInspectionResult,
  BridgeMutationPlan,
  BridgeMutationResponse,
  BridgeMutationResult,
  BridgePublication,
} from "./bridge-client";

export class EditorApi {
  constructor(
    private readonly bridge: BridgeClient,
    private readonly token: () => string,
    private readonly mutationToken: () => string | undefined,
    private readonly source: (path: string) => string | undefined = (path) =>
      path,
    private readonly mutationsAllowed: () => boolean = () => true,
  ) {}

  get revision(): number | undefined {
    return this.bridge.getRevision();
  }

  supports(
    capability: "publication" | "diagnostics" | "build-impact",
  ): boolean {
    return this.bridge.hasCapability(capability);
  }

  publication(
    source: string,
  ): Promise<BridgeInspectionResult<BridgePublication>> {
    return this.inspect(source, (path) =>
      this.bridge.inspectPublication(this.token(), path),
    );
  }

  diagnostics(
    source: string,
  ): Promise<BridgeInspectionResult<readonly BridgeDiagnostic[]>> {
    return this.inspect(source, (path) =>
      this.bridge.inspectDiagnostics(this.token(), path),
    );
  }

  impact(source: string): Promise<BridgeInspectionResult<BridgeImpact>> {
    return this.inspect(source, (path) =>
      this.bridge.inspectImpact(this.token(), path),
    );
  }

  planFrontmatter(
    source: string,
    set: Record<string, unknown>,
    remove: readonly string[],
  ): Promise<BridgeMutationResponse<BridgeMutationPlan>> {
    const path = this.source(source);
    const mutationToken = this.mutationToken();
    return path && mutationToken && this.mutationsAllowed()
      ? this.bridge.planFrontmatter(
          this.token(),
          mutationToken,
          path,
          set,
          remove,
        )
      : Promise.resolve({ kind: "unavailable" });
  }

  applyMutation(
    planId: string,
  ): Promise<BridgeMutationResponse<BridgeMutationResult>> {
    const mutationToken = this.mutationToken();
    return mutationToken && this.mutationsAllowed()
      ? this.bridge.applyMutation(this.token(), mutationToken, planId)
      : Promise.resolve({ kind: "unavailable" });
  }

  private inspect<T>(
    source: string,
    inspect: (path: string) => Promise<BridgeInspectionResult<T>>,
  ): Promise<BridgeInspectionResult<T>> {
    const path = this.source(source);
    return path ? inspect(path) : Promise.resolve({ kind: "not-found" });
  }
}
