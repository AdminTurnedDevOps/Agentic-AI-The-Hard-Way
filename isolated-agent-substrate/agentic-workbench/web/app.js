const session = document.querySelector("#session");
const file = document.querySelector("#file");
const save = document.querySelector("#save");
const advance = document.querySelector("#advance");
const status = document.querySelector("#status");
const retry = document.querySelector("#retry");
const steps = document.querySelectorAll("#steps li");
const stepCount = document.querySelector("#step-count");

let state;
let busy = false;

function refreshControls() {
  file.disabled = !state;
  save.disabled = busy || !state || file.value === state.content;
  advance.disabled = busy || !state || state.step >= steps.length;
  retry.disabled = busy;
}

function render() {
  session.textContent = state.sessionId;
  stepCount.textContent = `${state.step} / ${steps.length}`;
  steps.forEach((item, index) => {
    const step = index + 1;
    item.classList.toggle("complete", step < state.step);
    if (step === state.step) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

async function request(path, options, message) {
  busy = true;
  refreshControls();
  try {
    const response = await fetch(path, { cache: "no-store", ...options });
    if (!response.ok) {
      throw new Error(`Request failed (HTTP ${response.status}).`);
    }
    const loaded = await response.json();
    if (!state) {
      file.value = loaded.content;
    }
    state = loaded;
    render();
    status.textContent = message;
    retry.hidden = true;
  } catch (error) {
    status.textContent = error.message;
    retry.hidden = Boolean(state);
  } finally {
    busy = false;
    refreshControls();
  }
}

function connect() {
  request("/api/session", {}, "Connected to actor.");
}

file.addEventListener("input", refreshControls);
save.addEventListener("click", () => {
  request("/api/file", { method: "PUT", body: file.value }, "Saved task.md.");
});
advance.addEventListener("click", () => {
  request("/api/advance", { method: "POST" }, "Task advanced.");
});
retry.addEventListener("click", connect);
connect();
