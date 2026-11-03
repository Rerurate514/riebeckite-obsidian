export function validateManifest(
  manifest: Record<string, unknown>,
  packageJson: Record<string, unknown>,
  versions: Record<string, unknown>,
): string[];

export function readProjectMetadata(): Promise<
  [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>]
>;
