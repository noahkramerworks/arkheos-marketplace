import { spawnSync } from "node:child_process";

const ENTROPY = Buffer.from("arkheos-auth-v1").toString("base64");
const PROTECT = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $o=[Console]::In.ReadToEnd()|ConvertFrom-Json; $d=[Convert]::FromBase64String($o.data); $e=[Convert]::FromBase64String($o.entropy); $r=[Security.Cryptography.ProtectedData]::Protect($d,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
const UNPROTECT = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $o=[Console]::In.ReadToEnd()|ConvertFrom-Json; $d=[Convert]::FromBase64String($o.data); $e=[Convert]::FromBase64String($o.entropy); $r=[Security.Cryptography.ProtectedData]::Unprotect($d,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;

function invoke(script, data) {
  if (process.platform !== "win32") throw new Error("ArkheOS DPAPI storage requires Windows");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: JSON.stringify({ data: Buffer.from(data).toString("base64"), entropy: ENTROPY }),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error("DPAPI operation failed");
  return Buffer.from(result.stdout.trim(), "base64");
}

export function protectBytes(value, adapter) {
  return adapter?.protect ? adapter.protect(Buffer.from(value)) : invoke(PROTECT, value);
}

export function unprotectBytes(value, adapter) {
  return adapter?.unprotect ? adapter.unprotect(Buffer.from(value)) : invoke(UNPROTECT, value);
}

export function protectJson(value, adapter) {
  return { schema: "arkheos.dpapi/v1", ciphertext: protectBytes(Buffer.from(JSON.stringify(value)), adapter).toString("base64") };
}

export function unprotectJson(value, adapter) {
  if (value?.schema !== "arkheos.dpapi/v1" || typeof value.ciphertext !== "string") throw new Error("Malformed protected state");
  return JSON.parse(unprotectBytes(Buffer.from(value.ciphertext, "base64"), adapter).toString("utf8"));
}
