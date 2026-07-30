import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "VibeDigest Video Intake MCP";
const SERVER_VERSION = "0.1.0";
const TOOL_GET_VIDEO_CONTEXT = "get_video_context";

const JsonRpcError = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(process.env.VIBEDIGEST_REPO_ROOT || path.join(pluginRoot, ".."));

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function nonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function booleanValue(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return fallback;
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("uv", ["run", "python", "agent-plugin/bin/video_intake_cli.py", ...args], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `video_intake_cli exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse video intake JSON: ${error.message}`));
      }
    });
  });
}

function summarizeForText(result) {
  const metadata = result.metadata || {};
  const title = metadata.title || "Untitled video";
  const source = result.source || "none";
  const quality = result.quality || "missing";
  const status = result.status || "failed";
  const transcript = Array.isArray(result.transcript) ? result.transcript : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const lines = [
    `Title: ${title}`,
    `Status: ${status}`,
    `Source: ${source} (${quality})`,
    `Segments: ${transcript.length}`,
  ];

  if (warnings.length) lines.push(`Warnings: ${warnings.join("; ")}`);
  if (errors.length) lines.push(`Errors: ${errors.join("; ")}`);
  if (result.markdown) {
    lines.push("");
    lines.push(result.markdown);
  }
  return lines.join("\n");
}

async function handleToolCall(id, params) {
  if (params?.name !== TOOL_GET_VIDEO_CONTEXT) {
    sendError(id, JsonRpcError.INVALID_PARAMS, `Unknown tool: ${params?.name ?? ""}`);
    return;
  }

  const input = params.arguments ?? {};
  const url = nonEmptyString(input.url, "url");
  const cliArgs = ["get-video-context", "--url", url];

  if (input.language) {
    cliArgs.push("--language", nonEmptyString(input.language, "language"));
  }
  if (input.strategy) {
    cliArgs.push("--strategy", nonEmptyString(input.strategy, "strategy"));
  }
  if (booleanValue(input.allow_asr)) {
    cliArgs.push("--allow-asr");
  }

  const result = await runCli(cliArgs);
  sendResult(id, {
    content: [{ type: "text", text: summarizeForText(result) }],
    structuredContent: result,
  });
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: params?.protocolVersion ?? "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      instructions:
        "Use get_video_context to extract video metadata, transcript segments, source quality, and Markdown before summarizing or analyzing URL-based media.",
    });
    return;
  }

  if (method === "ping") {
    sendResult(id, {});
    return;
  }

  if (method === "tools/list") {
    sendResult(id, {
      tools: [
        {
          name: TOOL_GET_VIDEO_CONTEXT,
          title: "Get Video Context",
          description:
            "Extract normalized video metadata, timestamped transcript segments, source quality, warnings, and Markdown. Tries fast provider/caption paths first; ASR is optional.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "Video, podcast, lecture, or media URL.",
              },
              language: {
                type: "string",
                description: "Optional preferred language code.",
              },
              strategy: {
                type: "string",
                description: "Extraction strategy. Defaults to fastest_reliable.",
                default: "fastest_reliable",
              },
              allow_asr: {
                type: "boolean",
                description:
                  "Allow audio download and ASR fallback. This may be slower and can call paid transcription APIs.",
                default: false,
              },
            },
            required: ["url"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
          },
        },
      ],
    });
    return;
  }

  if (method === "tools/call") {
    try {
      await handleToolCall(id, params);
    } catch (error) {
      sendError(
        id,
        JsonRpcError.INTERNAL_ERROR,
        error instanceof Error ? error.message : String(error),
      );
    }
    return;
  }

  if (id !== undefined) {
    sendError(id, JsonRpcError.METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

const lines = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  void handleRequest(message);
});
