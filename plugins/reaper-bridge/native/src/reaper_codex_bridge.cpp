#include <windows.h>
#include <winhttp.h>
#include <algorithm>
#include <cctype>
#include <cmath>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "reaper_plugin.h"
#define REAPERAPI_MINIMAL
#define REAPERAPI_IMPLEMENT
#define REAPERAPI_WANT_CountTracks
#define REAPERAPI_WANT_EnumProjects
#define REAPERAPI_WANT_GetAppVersion
#define REAPERAPI_WANT_GetProjectStateChangeCount
#define REAPERAPI_WANT_IsProjectDirty
#define REAPERAPI_WANT_GetTrack
#define REAPERAPI_WANT_GetTrackName
#define REAPERAPI_WANT_GetMediaTrackInfo_Value
#define REAPERAPI_WANT_SetMediaTrackInfo_Value
#define REAPERAPI_WANT_GetSetMediaTrackInfo_String
#define REAPERAPI_WANT_InsertTrackAtIndex
#define REAPERAPI_WANT_TrackFX_AddByName
#define REAPERAPI_WANT_TrackFX_GetCount
#define REAPERAPI_WANT_Main_SaveProjectEx
#define REAPERAPI_WANT_Main_OnCommand
#define REAPERAPI_WANT_Undo_BeginBlock2
#define REAPERAPI_WANT_Undo_EndBlock2
#define REAPERAPI_WANT_Undo_DoUndo2
#define REAPERAPI_WANT_TrackList_AdjustWindows
#define REAPERAPI_WANT_UpdateArrange
#include "reaper_plugin_functions.h"

static reaper_plugin_info_t* g_rec = nullptr;
static ULONGLONG g_last_poll = 0;
static std::string g_endpoint;
static std::string g_token;
static bool g_connected = false;
static constexpr const char* BRIDGE_VERSION = "0.2.0";
static constexpr const char* SDK_COMMIT = "490ded57668727fba21482fabc50ba9853a457bb";

static std::wstring widen(const std::string& value) {
  if (value.empty()) return {};
  int size = MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0);
  std::wstring result(size, L' '); MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), result.data(), size); return result;
}
static std::string json_escape(const std::string& value) {
  std::string out; out.reserve(value.size() + 8);
  for (unsigned char c : value) { if (c == '\\' || c == '"') { out += '\\'; out += (char)c; } else if (c == '\n') out += "\\n"; else if (c == '\r') out += "\\r"; else if (c == '\t') out += "\\t"; else if (c >= 0x20) out += (char)c; }
  return out;
}
static size_t value_pos(const std::string& json, const std::string& key) {
  size_t p = json.find("\"" + key + "\""); if (p == std::string::npos) return p; p = json.find(':', p); if (p == std::string::npos) return p;
  do { ++p; } while (p < json.size() && std::isspace((unsigned char)json[p])); return p;
}
static std::string jstring(const std::string& json, const std::string& key) {
  size_t p = value_pos(json, key); if (p == std::string::npos || p >= json.size() || json[p] != '"') return {};
  std::string out; for (++p; p < json.size(); ++p) { char c = json[p]; if (c == '"') break; if (c == '\\' && p + 1 < json.size()) { char n = json[++p]; if (n == 'n') out += '\n'; else if (n == 'r') out += '\r'; else if (n == 't') out += '\t'; else out += n; } else out += c; } return out;
}
static double jnumber(const std::string& json, const std::string& key, double fallback = 0) { size_t p = value_pos(json, key); if (p == std::string::npos) return fallback; try { return std::stod(json.substr(p)); } catch (...) { return fallback; } }
static bool jbool(const std::string& json, const std::string& key, bool fallback = false) { size_t p = value_pos(json, key); if (p == std::string::npos) return fallback; if (json.compare(p, 4, "true") == 0) return true; if (json.compare(p, 5, "false") == 0) return false; return fallback; }

struct HttpResult { DWORD status = 0; std::string body; };
static HttpResult http(const wchar_t* method, const std::string& route, const std::string& body = {}) {
  HttpResult result; if (g_endpoint.empty() || g_token.empty()) return result;
  std::wstring url = widen(g_endpoint + route); URL_COMPONENTS parts{}; parts.dwStructSize = sizeof(parts); parts.dwSchemeLength = (DWORD)-1; parts.dwHostNameLength = (DWORD)-1; parts.dwUrlPathLength = (DWORD)-1; parts.dwExtraInfoLength = (DWORD)-1;
  if (!WinHttpCrackUrl(url.c_str(), (DWORD)url.size(), 0, &parts)) return result;
  HINTERNET session = WinHttpOpen(L"REAPER Codex Bridge/0.2", WINHTTP_ACCESS_TYPE_NO_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0); if (!session) return result;
  WinHttpSetTimeouts(session, 150, 150, 250, 250);
  std::wstring host(parts.lpszHostName, parts.dwHostNameLength); std::wstring target(parts.lpszUrlPath, parts.dwUrlPathLength); if (parts.dwExtraInfoLength) target.append(parts.lpszExtraInfo, parts.dwExtraInfoLength);
  HINTERNET connect = WinHttpConnect(session, host.c_str(), parts.nPort, 0); HINTERNET request = connect ? WinHttpOpenRequest(connect, method, target.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0) : nullptr;
  if (request) {
    std::wstring headers = L"Authorization: Bearer " + widen(g_token) + L"\r\nContent-Type: application/json\r\n";
    if (WinHttpSendRequest(request, headers.c_str(), (DWORD)-1, body.empty() ? WINHTTP_NO_REQUEST_DATA : (void*)body.data(), (DWORD)body.size(), (DWORD)body.size(), 0) && WinHttpReceiveResponse(request, nullptr)) {
      DWORD size = sizeof(result.status); WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &result.status, &size, WINHTTP_NO_HEADER_INDEX);
      for (;;) { DWORD available = 0; if (!WinHttpQueryDataAvailable(request, &available) || !available) break; std::string chunk(available, '\0'); DWORD read = 0; if (!WinHttpReadData(request, chunk.data(), available, &read)) break; chunk.resize(read); result.body += chunk; }
    }
  }
  if (request) WinHttpCloseHandle(request); if (connect) WinHttpCloseHandle(connect); WinHttpCloseHandle(session); return result;
}

static std::string runtime_file() {
  wchar_t buffer[32768]{}; DWORD count = GetEnvironmentVariableW(L"CODEX_HOME", buffer, 32768); std::wstring root;
  if (count && count < 32768) root.assign(buffer, count); else { count = GetEnvironmentVariableW(L"USERPROFILE", buffer, 32768); if (!count || count >= 32768) return {}; root.assign(buffer, count); root += L"\\.codex"; }
  root += L"\\state\\plugins\\reaper-bridge\\v1\\runtime\\current.json";
  int size = WideCharToMultiByte(CP_UTF8, 0, root.data(), (int)root.size(), nullptr, 0, nullptr, nullptr); std::string result(size, '\0'); WideCharToMultiByte(CP_UTF8, 0, root.data(), (int)root.size(), result.data(), size, nullptr, nullptr); return result;
}
static bool load_runtime() {
  std::ifstream in(runtime_file(), std::ios::binary); if (!in) { g_connected = false; return false; } std::ostringstream ss; ss << in.rdbuf(); std::string json = ss.str();
  std::string endpoint = jstring(json, "endpoint"), token = jstring(json, "token"); if (endpoint.rfind("http://127.0.0.1:", 0) != 0 || token.size() < 32) { g_connected = false; return false; }
  if (endpoint != g_endpoint || token != g_token) { g_endpoint = endpoint; g_token = token; g_connected = false; } return true;
}
static ReaProject* project(std::string* path_out = nullptr) { char path[32768]{}; ReaProject* proj = EnumProjects ? EnumProjects(-1, path, sizeof(path)) : nullptr; if (path_out) *path_out = path; return proj; }
static std::string inspect() {
  std::string path; ReaProject* proj = project(&path); if (!proj) return "{\"ok\":false,\"error\":\"No active project\"}";
  int count = CountTracks(proj); std::ostringstream out; out << "{\"ok\":true,\"applicationVersion\":\"" << json_escape(GetAppVersion()) << "\",\"bridgeVersion\":\"" << BRIDGE_VERSION << "\",\"apiVersion\":\"0x20E\",\"sdkCommit\":\"" << SDK_COMMIT << "\",\"projectPath\":\"" << json_escape(path) << "\",\"revision\":" << GetProjectStateChangeCount(proj) << ",\"dirty\":" << (IsProjectDirty(proj) ? "true" : "false") << ",\"trackCount\":" << count << ",\"tracks\":[";
  int limit = (std::min)(count, 128); for (int i = 0; i < limit; ++i) { MediaTrack* track = GetTrack(proj, i); char name[512]{}; GetTrackName(track, name, sizeof(name)); if (i) out << ','; out << "{\"index\":" << i << ",\"name\":\"" << json_escape(name) << "\",\"volume\":" << GetMediaTrackInfo_Value(track, "D_VOL") << ",\"pan\":" << GetMediaTrackInfo_Value(track, "D_PAN") << ",\"mute\":" << (GetMediaTrackInfo_Value(track, "B_MUTE") > 0.5 ? "true" : "false") << ",\"fxCount\":" << TrackFX_GetCount(track) << '}'; }
  out << "]}"; return out.str();
}
static std::string action(const std::string& body) {
  ReaProject* proj = project(); if (!proj) return "{\"ok\":false,\"error\":\"No active project\"}";
  std::string type = jstring(body, "type"); int index = (int)jnumber(body, "index", -1); int count = CountTracks(proj);
  if (type == "create_track") { if (index < 0 || index > count) return "{\"ok\":false,\"error\":\"Track index out of range\"}"; InsertTrackAtIndex(index, true); std::string name = jstring(body, "name"); if (!name.empty()) { MediaTrack* track = GetTrack(proj, index); GetSetMediaTrackInfo_String(track, "P_NAME", name.data(), true); } }
  else {
    if (index < 0 || index >= count) return "{\"ok\":false,\"error\":\"Track index out of range\"}"; MediaTrack* track = GetTrack(proj, index);
    if (type == "rename_track") { std::string name = jstring(body, "name"); if (name.empty() || !GetSetMediaTrackInfo_String(track, "P_NAME", name.data(), true)) return "{\"ok\":false,\"error\":\"Rename failed\"}"; }
    else if (type == "set_track_volume") SetMediaTrackInfo_Value(track, "D_VOL", jnumber(body, "value"));
    else if (type == "set_track_pan") SetMediaTrackInfo_Value(track, "D_PAN", jnumber(body, "value"));
    else if (type == "set_track_mute") SetMediaTrackInfo_Value(track, "B_MUTE", jbool(body, "value") ? 1.0 : 0.0);
    else if (type == "add_stock_fx") { std::string fx = jstring(body, "fx"); if (TrackFX_AddByName(track, fx.c_str(), false, 1) < 0) return "{\"ok\":false,\"error\":\"FX insertion failed\"}"; }
    else return "{\"ok\":false,\"error\":\"Unsupported action\"}";
  }
  TrackList_AdjustWindows(false); UpdateArrange(); return "{\"ok\":true}";
}
static std::string execute(const std::string& operation, const std::string& job) {
  ReaProject* proj = project();
  if (operation == "inspect") return inspect();
  if (!proj) return "{\"ok\":false,\"error\":\"No active project\"}";
  if (operation == "begin_undo") { Undo_BeginBlock2(proj); return "{\"ok\":true}"; }
  if (operation == "end_undo") { std::string label = jstring(job, "label"); Undo_EndBlock2(proj, label.empty() ? "Codex Bridge transaction" : label.c_str(), UNDO_STATE_ALL); return "{\"ok\":true}"; }
  if (operation == "action") return action(job);
  if (operation == "save_as") { std::string p = jstring(job, "projectPath"); if (p.size() < 7 || p.find(":\\") != 1 || p.substr(p.size() - 4) != ".rpp") return "{\"ok\":false,\"error\":\"Invalid save path\"}"; Main_SaveProjectEx(proj, p.c_str(), 8); return "{\"ok\":true}"; }
  if (operation == "save") { std::string p; project(&p); if (p.empty()) return "{\"ok\":false,\"error\":\"Project is unsaved\"}"; Main_SaveProjectEx(proj, p.c_str(), 8); return "{\"ok\":true}"; }
  if (operation == "undo_save") { if (!Undo_DoUndo2(proj)) return "{\"ok\":false,\"error\":\"No native undo point\"}"; std::string p; project(&p); Main_SaveProjectEx(proj, p.c_str(), 8); return "{\"ok\":true}"; }
  if (operation == "render") { Main_OnCommand(41824, 0); return "{\"ok\":true}"; }
  return "{\"ok\":false,\"error\":\"Unsupported operation\"}";
}
static void timer() {
  ULONGLONG now = GetTickCount64(); if (now - g_last_poll < 250) return; g_last_poll = now; if (!load_runtime()) return;
  if (!g_connected) { std::ostringstream body; body << "{\"protocol\":\"reaper-bridge/1\",\"pid\":" << GetCurrentProcessId() << ",\"applicationVersion\":\"" << json_escape(GetAppVersion()) << "\",\"bridgeVersion\":\"" << BRIDGE_VERSION << "\",\"apiVersion\":\"0x20E\",\"sdkCommit\":\"" << SDK_COMMIT << "\"}"; g_connected = http(L"POST", "/v1/connect", body.str()).status == 200; if (!g_connected) return; }
  std::ostringstream route; route << "/v1/jobs/next?pid=" << GetCurrentProcessId(); HttpResult next = http(L"GET", route.str()); if (next.status == 204) return; if (next.status != 200) { g_connected = false; return; }
  std::string request = jstring(next.body, "requestId"), operation = jstring(next.body, "operation"); if (request.empty() || operation.empty()) return;
  std::string result; try { result = execute(operation, next.body); } catch (...) { result = "{\"ok\":false,\"error\":\"Native exception\"}"; }
  http(L"POST", "/v1/jobs/" + request + "/complete", result);
}

extern "C" REAPER_PLUGIN_DLL_EXPORT int REAPER_PLUGIN_ENTRYPOINT(REAPER_PLUGIN_HINSTANCE, reaper_plugin_info_t* rec) {
  if (!rec) { if (g_rec && g_rec->Register) g_rec->Register("-timer", (void*)timer); g_rec = nullptr; return 0; }
  if (rec->caller_version != REAPER_PLUGIN_VERSION || !rec->GetFunc || !rec->Register || REAPERAPI_LoadAPI(rec->GetFunc) != 0) return 0;
  g_rec = rec; rec->Register("ext_name", (void*)"Codex REAPER Bridge"); rec->Register("ext_vendor", (void*)"Rizek"); if (!rec->Register("timer", (void*)timer)) return 0; return 1;
}
