import type {
  BridgeClient,
  BridgeDiagnostic,
  BridgeInspectionResult,
  BridgePublication,
} from "./bridge-client";

export class EditorApi {
  constructor(
    private readonly bridge: BridgeClient,
    private readonly token: () => string,
  ) {}

  get revision(): number | undefined {
    return this.bridge.getRevision();
  }

  supports(capability: "publication" | "diagnostics"): boolean {
    return this.bridge.hasCapability(capability);
  }

  publication(
    source: string,
  ): Promise<BridgeInspectionResult<BridgePublication>> {
    return this.bridge.inspectPublication(this.token(), source);
  }

  diagnostics(
    source: string,
  ): Promise<BridgeInspectionResult<readonly BridgeDiagnostic[]>> {
    return this.bridge.inspectDiagnostics(this.token(), source);
  }
}
