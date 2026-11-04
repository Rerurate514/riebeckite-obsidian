import type {
  BridgeClient,
  BridgeDiagnostic,
  BridgeImpact,
  BridgeInspectionResult,
  BridgePublication,
} from "./bridge-client";

export class EditorApi {
  constructor(
    private readonly bridge: BridgeClient,
    private readonly token: () => string,
    private readonly source: (path: string) => string | undefined = (path) =>
      path,
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

  private inspect<T>(
    source: string,
    inspect: (path: string) => Promise<BridgeInspectionResult<T>>,
  ): Promise<BridgeInspectionResult<T>> {
    const path = this.source(source);
    return path ? inspect(path) : Promise.resolve({ kind: "not-found" });
  }
}
