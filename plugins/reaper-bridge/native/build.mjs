import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const vsdev = "C:\\ark-tools\\vs\\Common7\\Tools\\VsDevCmd.bat";
if (!existsSync(vsdev)) throw new Error(`MSVC environment missing: ${vsdev}`);
mkdirSync(path.join(root, "build"), { recursive: true });
mkdirSync(path.join(root, "dist"), { recursive: true });
const source = path.join(root, "src", "reaper_codex_bridge.cpp");
const include = path.join(root, "vendor", "reaper-sdk");
const output = path.join(root, "dist", "reaper_codex_bridge.dll");
const object = path.join(root, "build", "reaper_codex_bridge.obj");
const command = `@echo off\r\ncall "${vsdev}" -arch=x64 -host_arch=x64 >nul\r\nif errorlevel 1 exit /b %errorlevel%\r\ncl.exe /nologo /std:c++17 /EHsc /O2 /LD /DUNICODE /D_UNICODE /I"${include}" "${source}" /Fo:"${object}" /link /OUT:"${output}" winhttp.lib\r\n`;
const commandFile = path.join(root, "build", "compile.cmd");
writeFileSync(commandFile, command);
try { execFileSync("cmd.exe", ["/d", "/c", commandFile], { stdio: "inherit", cwd: root }); }
finally { rmSync(commandFile, { force: true }); }
console.log(JSON.stringify({ status: "built", output }, null, 2));
