import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type DevServerState =
  | { kind: "not-configured" }
  | { kind: "stopped" }
  | { kind: "starting" }
  | { kind: "running"; serverUrl: string }
  | { kind: "stopping" }
  | { kind: "failed"; message: string };

export type DevServerLog = {
  stream: "stdout" | "stderr" | "system";
  text: string;
};

export class DevServerController {
  private process: ChildProcess | undefined;
  private state: DevServerState = { kind: "stopped" };
  private readonly entries: DevServerLog[] = [];
  private token: string | undefined;
  private startTimeout: number | undefined;
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
    if (!projectDirectory) {
      this.setState({ kind: "not-configured" });
      return false;
    }
    const command = localCli(projectDirectory);
    if (!command) {
      this.setState({
        kind: "failed",
        message: "Riebeckite CLI was not found in this site project.",
      });
      return false;
    }
    this.token = crypto.randomUUID();
    this.setState({ kind: "starting" });
    this.write("system", "Starting Riebeckite development server.");
    this.startTimeout = window.setTimeout(() => {
      if (this.state.kind !== "starting") return;
      this.write("system", "Development server did not report a loopback URL.");
      void this.stop();
    }, 30_000);
    const child = spawn(command, ["dev"], {
      cwd: projectDirectory,
      env: { ...process.env, RIEBECKITE_BRIDGE_TOKEN: this.token },
      shell: process.platform === "win32" && command.endsWith(".cmd"),
      windowsHide: true,
    });
    this.process = child;
    child.stdout?.on("data", (data: Buffer) =>
      this.handleOutput("stdout", data.toString()),
    );
    child.stderr?.on("data", (data: Buffer) =>
      this.handleOutput("stderr", data.toString()),
    );
    child.once("error", (error) =>
      this.fail(`Dev server could not start: ${error.message}`),
    );
    child.once("exit", (code, signal) => {
      this.clearStartTimeout();
      const stopping = this.state.kind === "stopping";
      this.process = undefined;
      this.token = undefined;
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

  async stop(): Promise<void> {
    const child = this.process;
    if (!child?.pid) return;
    this.setState({ kind: "stopping" });
    if (process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true },
      );
      killer.once("error", () =>
        this.fail("Development server could not stop."),
      );
      killer.once("exit", (code) => {
        if (code !== 0) this.fail("Development server could not stop.");
      });
    } else {
      child.kill("SIGTERM");
    }
  }

  dispose(): void {
    void this.stop();
    this.listeners.clear();
  }

  private handleOutput(stream: DevServerLog["stream"], output: string): void {
    this.write(stream, output);
    const url = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/?/.exec(
      output,
    )?.[0];
    if (url && this.state.kind === "starting") {
      this.clearStartTimeout();
      this.setState({ kind: "running", serverUrl: url.replace(/\/$/, "") });
    }
  }

  private write(stream: DevServerLog["stream"], text: string): void {
    const safe = this.token ? text.split(this.token).join("[redacted]") : text;
    for (const line of safe.split(/\r?\n/)) {
      if (!line) continue;
      this.entries.push({ stream, text: line });
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

  private clearStartTimeout(): void {
    if (this.startTimeout === undefined) return;
    window.clearTimeout(this.startTimeout);
    this.startTimeout = undefined;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function localCli(projectDirectory: string): string | undefined {
  try {
    if (!statSync(projectDirectory).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  const command = join(
    projectDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "riebeckite.cmd" : "riebeckite",
  );
  return existsSync(command) ? command : undefined;
}
