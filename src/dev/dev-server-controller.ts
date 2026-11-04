import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ansiEscapePattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);

export type DevServerState =
  | { kind: "not-configured" }
  | { kind: "stopped" }
  | { kind: "starting" }
  | { kind: "running"; serverUrl: string; siteId: string }
  | { kind: "stopping" }
  | { kind: "failed"; message: string };

export type DevServerLog = {
  stream: "stdout" | "stderr" | "system";
  text: string;
};

type ManagedDevEvent =
  | { type: "starting"; protocolVersion: 1; sessionId: string }
  | {
      type: "ready";
      protocolVersion: 1;
      sessionId: string;
      siteId: string;
      previewOrigin: string;
      capabilities: readonly string[];
    }
  | { type: "error"; protocolVersion: 1; sessionId: string; code: string };

export class DevServerController {
  private process: ChildProcess | undefined;
  private state: DevServerState = { kind: "stopped" };
  private readonly entries: DevServerLog[] = [];
  private token: string | undefined;
  private sessionId: string | undefined;
  private startTimeout: number | undefined;
  private stopCompletion: Promise<boolean> | undefined;
  private resolveStop: ((stopped: boolean) => void) | undefined;
  private readonly listeners = new Set<() => void>();

  getState(): DevServerState {
    return this.state;
  }

  getToken(): string | undefined {
    return this.token;
  }

  logs(): readonly DevServerLog[] {
    return this.entries;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(projectDirectory: string | undefined): boolean {
    if (
      this.process ||
      this.state.kind === "starting" ||
      this.state.kind === "running"
    )
      return false;
    const command = localCli(projectDirectory);
    if (!command) {
      this.setState(
        projectDirectory
          ? {
              kind: "failed",
              message:
                "This folder does not contain a compatible local Riebeckite CLI.",
            }
          : { kind: "not-configured" },
      );
      return false;
    }
    this.token = crypto.randomUUID();
    this.sessionId = crypto.randomUUID();
    this.setState({ kind: "starting" });
    this.write("system", "Starting Riebeckite development server.");
    this.startTimeout = window.setTimeout(() => {
      if (this.state.kind !== "starting") return;
      this.fail(
        "Riebeckite did not complete its managed development handshake.",
      );
      void this.stop();
    }, 30_000);
    const child = spawn(process.execPath, [command, "dev"], {
      cwd: projectDirectory,
      env: {
        ...process.env,
        RIEBECKITE_BRIDGE_TOKEN: this.token,
        RIEBECKITE_MANAGED_DEV_CONTROL_FD: "3",
        RIEBECKITE_MANAGED_DEV_SESSION: this.sessionId,
      },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process = child;
    child.stdout?.on("data", (data: Buffer) =>
      this.write("stdout", data.toString()),
    );
    child.stderr?.on("data", (data: Buffer) =>
      this.write("stderr", data.toString()),
    );
    let controlBuffer = "";
    child.stdio[3]?.on("data", (data: Buffer) => {
      controlBuffer += data.toString();
      const lines = controlBuffer.split("\n");
      controlBuffer = lines.pop() ?? "";
      for (const line of lines) this.handleControl(line);
    });
    child.once("error", () =>
      this.fail("Riebeckite could not start this project."),
    );
    child.once("exit", (code, signal) => {
      this.clearStartTimeout();
      const stopping = this.state.kind === "stopping";
      this.process = undefined;
      this.token = undefined;
      this.sessionId = undefined;
      this.resolveStop?.(true);
      this.resolveStop = undefined;
      this.stopCompletion = undefined;
      this.write(
        "system",
        stopping
          ? "Development server stopped."
          : `Development server exited (${signal ?? code ?? "unknown"}).`,
      );
      this.setState(
        stopping
          ? { kind: "stopped" }
          : {
              kind: "failed",
              message: "Development server stopped unexpectedly.",
            },
      );
    });
    return true;
  }

  async stop(): Promise<boolean> {
    const child = this.process;
    if (!child?.pid) return true;
    if (this.stopCompletion) return this.stopCompletion;
    this.setState({ kind: "stopping" });
    this.stopCompletion = new Promise<boolean>((resolve) => {
      this.resolveStop = resolve;
    });
    if (process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true },
      );
      killer.once("error", () => this.stopFailed());
      killer.once("exit", (code) => {
        if (code !== 0 && this.process) this.stopFailed();
      });
    } else {
      child.kill("SIGTERM");
    }
    return this.stopCompletion;
  }

  dispose(): void {
    void this.stop();
    this.listeners.clear();
  }

  private handleControl(line: string): void {
    const event = parseManagedDevEvent(line);
    if (!event || event.sessionId !== this.sessionId) return;
    if (event.protocolVersion !== 1) {
      this.fail(
        "This Riebeckite CLI uses an incompatible managed development protocol.",
      );
      return;
    }
    if (event.type === "ready") {
      if (
        !isLoopbackUrl(event.previewOrigin) ||
        !event.capabilities.includes("bridge-v1")
      ) {
        this.fail("This site does not support Obsidian managed development.");
        return;
      }
      this.clearStartTimeout();
      this.setState({
        kind: "running",
        serverUrl: event.previewOrigin.replace(/\/$/, ""),
        siteId: event.siteId,
      });
    } else if (event.type === "error") {
      this.fail("Riebeckite could not start this project.");
    }
  }

  private write(stream: DevServerLog["stream"], text: string): void {
    const safe = this.token ? text.split(this.token).join("[redacted]") : text;
    for (const line of safe.replace(ansiEscapePattern, "").split(/\r?\n/)) {
      if (line) this.entries.push({ stream, text: line });
    }
    if (this.entries.length > 300)
      this.entries.splice(0, this.entries.length - 300);
    this.notify();
  }

  private setState(state: DevServerState): void {
    this.state = state;
    this.notify();
  }

  private fail(message: string): void {
    this.clearStartTimeout();
    this.setState({ kind: "failed", message });
  }

  private stopFailed(): void {
    this.fail("Development server could not stop.");
    this.resolveStop?.(false);
    this.resolveStop = undefined;
    this.stopCompletion = undefined;
  }

  private clearStartTimeout(): void {
    if (this.startTimeout === undefined) return;
    window.clearTimeout(this.startTimeout);
    this.startTimeout = undefined;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export function parseManagedDevEvent(
  line: string,
): ManagedDevEvent | undefined {
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object") return undefined;
    const event = value as Record<string, unknown>;
    if (
      event.protocolVersion !== 1 ||
      typeof event.sessionId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(event.sessionId) ||
      typeof event.type !== "string"
    )
      return undefined;
    if (event.type === "starting")
      return {
        type: "starting",
        protocolVersion: 1,
        sessionId: event.sessionId,
      };
    if (event.type === "error" && typeof event.code === "string")
      return {
        type: "error",
        protocolVersion: 1,
        sessionId: event.sessionId,
        code: event.code,
      };
    if (
      event.type === "ready" &&
      typeof event.siteId === "string" &&
      typeof event.previewOrigin === "string" &&
      Array.isArray(event.capabilities) &&
      event.capabilities.every((item) => typeof item === "string")
    )
      return {
        type: "ready",
        protocolVersion: 1,
        sessionId: event.sessionId,
        siteId: event.siteId,
        previewOrigin: event.previewOrigin,
        capabilities: event.capabilities,
      };
    return undefined;
  } catch {
    return undefined;
  }
}

function localCli(projectDirectory: string | undefined): string | undefined {
  if (!projectDirectory) return undefined;
  try {
    if (!statSync(projectDirectory).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  const command = join(
    projectDirectory,
    "node_modules",
    "@riebeckite",
    "cli",
    "bin",
    "riebeckite.mjs",
  );
  return existsSync(command) ? command : undefined;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        url.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}
