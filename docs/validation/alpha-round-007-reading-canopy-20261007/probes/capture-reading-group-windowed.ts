// Round 7 windowed Player capture, reusing the coordinator-provided build.
//
// Purpose: get a real Player view of the wood soffit underside of
// "Reading curved linking canopy". Coverage analysis (coverage-analysis.py)
type ManifestEntry = { path: string; sha256: string };
function isManifestEntry(value: unknown): value is ManifestEntry {
	return typeof value === "object" && value !== null
		&& typeof (value as Record<string, unknown>).path === "string"
		&& typeof (value as Record<string, unknown>).sha256 === "string";
}
function manifestFiles(parsed: unknown): ManifestEntry[] {
	if (typeof parsed !== "object" || parsed === null) throw new Error("Artifact manifest is not an object");
	const files = (parsed as Record<string, unknown>).files;
	if (!Array.isArray(files) || !files.every(isManifestEntry)) throw new Error("Artifact manifest files[] is malformed");
	return files;
}
// showed the existing views `activity-door` and `reading-door` stand under the
// link with the soffit spanning ~400 px of a 1600x1000 frame, and both exist in
// the already-implemented `--station-reading-group-render` mode, so no production
// probe change and no rebuild are needed.
//
// Contract copied from the coordinator's capture-player-windowed.ts:
// normal window (windowsHide:false), -force-d3d11, 1600x1000, real walker.View,
// no user input, fresh output and save directories, backend port that must be
// free. This script is a separate runner and never rewrites coordinator output.
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const here = import.meta.dir;
const roundDir = join(here, "..");
const baseline = "C:/Users/36322/.codex/worktrees/unified-capabilities/alpha-agent/.alpha/alpha-round-007-player-baseline";
const parsedManifest: unknown = JSON.parse(await readFile(join(baseline, "build-artifact-manifest-v2.json"), "utf8"));
if (typeof parsedManifest !== "object" || parsedManifest === null) throw new Error("Artifact manifest malformed");
const manifestRecord = parsedManifest as Record<string, unknown>;
const manifestOutput = manifestRecord.output;
const manifestGameHead = manifestRecord.gameHead;
if (typeof manifestOutput !== "string" || typeof manifestGameHead !== "string") throw new Error("Artifact manifest output/gameHead missing");

const output = join(roundDir, "player-reading-group-windowed");
const startedPath = join(roundDir, "player-started.json");
const resultPath = join(roundDir, "player-result.json");
for (const p of [output, startedPath, resultPath]) {
  if (await access(p).then(() => true, () => false)) throw new Error("Refusing to overwrite existing round output: " + p);
}

const exeSha256 = createHash("sha256").update(await readFile(manifestOutput)).digest("hex");
const expected = manifestFiles(parsedManifest).find((f) => f.path === "StationV019.exe");
if (!expected || expected.sha256 !== exeSha256) throw new Error("Player executable no longer matches build-artifact-manifest-v2.json");
if (manifestGameHead !== "c21c4dc3d00764932457199735697d7f34223b8e") throw new Error("Unexpected game HEAD in artifact manifest: " + manifestGameHead);

await mkdir(join(output, "save"), { recursive: true });

const args = [
  "-force-d3d11",
  "-screen-fullscreen", "0",
  "-screen-width", "1600",
  "-screen-height", "1000",
  "--station-world-save-dir", join(output, "save"),
  "--arena-backend", "http://127.0.0.1:65534",
  "-logFile", join(output, "player.log"),
  "--station-annex-render-output", output,
  "--station-reading-group-render",
];

const child = Bun.spawn([manifestOutput, ...args], {
  cwd: join(baseline, "BatchPlayer"),
  stdout: "ignore",
  stderr: "ignore",
  windowsHide: false,
});

const started = {
  startedUtc: new Date().toISOString(),
  supervisorPid: process.pid,
  playerPid: child.pid,
  executable: manifestOutput,
  executableSha256: exeSha256,
  artifactManifest: join(baseline, "build-artifact-manifest-v2.json"),
  sourceGameHead: manifestGameHead,
  probeMode: "--station-reading-group-render",
  target: "Reading curved linking canopy / material slot 1 Reading natural oak soffits",
  output,
  saveDir: join(output, "save"),
  args,
  windowsHide: false,
  d3d11: true,
  resolution: "1600x1000",
  batchmode: false,
  note: "Existing probe mode reused unmodified. No user input. No game mutation. Player still reads real user preference files; the world save directory is isolated.",
};
await writeFile(startedPath, JSON.stringify(started, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ startedUtc: started.startedUtc, playerPid: child.pid, output }));

process.on("SIGINT", () => child.kill("SIGINT"));
const actualPlayerExitCode = await child.exited;
const report = await readFile(join(output, "rendering.json"), "utf8").then(JSON.parse, () => null);
const result = {
  ...started,
  finishedUtc: new Date().toISOString(),
  actualPlayerExitCode,
  report,
  scope: "Fixed-view render capture only. Not walking/passage validation, not reflection-complete proof for the reading zone, not visual approval.",
};
await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({
  finishedUtc: result.finishedUtc,
  actualPlayerExitCode,
  passed: report?.passed,
  viewCount: report?.views?.length,
  errors: report?.errors,
  graphicsDevice: report?.graphicsDevice,
  graphicsApi: report?.graphicsApi,
}));
process.exitCode = actualPlayerExitCode === 0 && report?.passed === true ? 0 : 1;