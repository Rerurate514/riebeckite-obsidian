import { request } from "node:http";
import type { BridgeRequest } from "./bridge-client";

export const localBridgeRequest: BridgeRequest = async (input) => {
  const url = new URL(input.url);
  if (url.protocol !== "http:" || !isLoopbackHost(url.hostname))
    throw new Error("Bridge URL must use HTTP loopback.");
  return new Promise((resolve, reject) => {
    const requestBody = input.body;
    const client = request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: input.method,
        headers: {
          ...input.headers,
          ...(requestBody
            ? { "content-length": Buffer.byteLength(requestBody) }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () => {
          const body = Buffer.concat(chunks).toString();
          try {
            resolve({
              status: response.statusCode ?? 0,
              json: body ? JSON.parse(body) : undefined,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    client.once("error", reject);
    if (requestBody) client.write(requestBody);
    client.end();
  });
};

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    /^127\.\d+\.\d+\.\d+$/.test(normalized)
  );
}
