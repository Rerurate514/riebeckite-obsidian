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
};

export type BridgeRequest = (input: {
  url: string;
  method: string;
  headers: Record<string, string>;
  throw: boolean;
}) => Promise<{ status: number; json: unknown }>;

export class BridgeClient implements Disposable {
  private state: BridgeConnectionState = { kind: "disconnected" };
  private connection: Promise<BridgeConnectionState> | undefined;
  private disposed = false;

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
    this.state = { kind: "disconnected" };
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
  }

  private async connectOnce(
    serverUrl: string,
    token: string,
  ): Promise<BridgeConnectionState> {
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
      return status
        ? this.setState({ kind: "connected", status })
        : this.setState({
            kind: "error",
            message: "Bridge returned an invalid response.",
          });
    } catch {
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
