const form = document.querySelector("#device-form");
const status = document.querySelector("#status");
const incoming = new URL(location.href).searchParams.get("code");
if (incoming && form) form.elements.code.value = incoming;
form?.addEventListener("submit", async (event) => {
  event.preventDefault(); status.textContent = "Authorizing…";
  const response = await fetch("/v1/device/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userCode: form.elements.code.value.trim().toUpperCase() }) });
  const value = await response.json().catch(() => ({}));
  status.textContent = response.ok ? "Authorized. Return to Codex to continue." : `Authorization failed: ${value.code || response.status}`;
});
