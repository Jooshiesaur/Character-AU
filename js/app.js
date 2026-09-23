/*
  app.js
  ------
  Holds the current in-memory state, renders the DOM from that state,
  and wires up event listeners. The pattern used everywhere here is:

      change state -> call Storage.saveProject() -> call the relevant render function

  Keeping "change data" and "redraw screen" as two separate, always-paired
  steps is the core habit that keeps UI code from turning into spaghetti.
*/

let state = {
  project: null,       // the full project object (characters + messages)
  activeSpeakerId: null // which character you're currently writing as
};

// ---------- INIT ----------

function init() {
  const activeId = Storage.getActiveProjectId();
  let project = activeId ? Storage.getProject(activeId) : null;

  // First-ever run: create a starter project so the UI isn't empty.
  if (!project) {
    project = Storage.createProject("My First AU");
    Storage.setActiveProjectId(project.id);
  }

  state.project = project;
  state.activeSpeakerId = project.characters[0]?.id || null;

  initTheme();
  renderAll();
  bindStaticEvents();
}

function renderAll() {
  renderProjectSelect();
  document.getElementById("story-title").textContent = state.project.title;
  renderCharacterList();
  renderSpeakerTabs();
  renderFeed();
}

// ---------- PERSISTENCE HELPER ----------

function persist() {
  state.project.updatedAt = Date.now();
  Storage.saveProject(state.project);
  renderProjectSelect(); // keep sidebar order/labels in sync
}

// ---------- STORY (PROJECT) LIST ----------

function renderProjectSelect() {
  const list = document.getElementById("project-list");
  const all = Storage.getAllProjects();
  list.innerHTML = "";

  // Newest stories first, like a typical chat history sidebar
  Object.values(all)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .forEach(p => {
      const item = document.createElement("div");
      item.className = "project-item" + (p.id === state.project.id ? " active" : "");
      item.innerHTML = `
        <span class="project-name">${escapeHtml(p.title)}</span>
        <button class="project-delete" title="Delete story">×</button>
      `;

      item.querySelector(".project-name").addEventListener("click", () => switchProject(p.id));
      item.querySelector(".project-name").addEventListener("dblclick", () => renameProject(p.id));

      item.querySelector(".project-delete").addEventListener("click", e => {
        e.stopPropagation();
        deleteProject(p.id);
      });

      list.appendChild(item);
    });
}

function switchProject(id) {
  if (id === state.project.id) return;
  const project = Storage.getProject(id);
  if (!project) return;
  state.project = project;
  state.activeSpeakerId = project.characters[0]?.id || null;
  Storage.setActiveProjectId(id);
  renderAll();
}

function renameProject(id) {
  const project = Storage.getProject(id);
  const title = prompt("New title:", project.title);
  if (!title) return;
  project.title = title;
  project.updatedAt = Date.now();
  Storage.saveProject(project);
  if (id === state.project.id) {
    state.project.title = title;
    document.getElementById("story-title").textContent = title;
  }
  renderProjectSelect();
}

function deleteProject(id) {
  const all = Storage.getAllProjects();
  if (Object.keys(all).length <= 1) {
    alert("You need at least one story — create a new one before deleting this.");
    return;
  }
  if (!confirm("Delete this story? This can't be undone.")) return;

  const wasActive = id === state.project.id;
  Storage.deleteProject(id);

  if (wasActive) {
    const remaining = Object.values(Storage.getAllProjects());
    switchProject(remaining[0].id);
  } else {
    renderProjectSelect();
  }
}

// ---------- CHARACTERS ----------

function renderCharacterList() {
  const list = document.getElementById("character-list");
  list.innerHTML = "";
  state.project.characters.forEach(char => {
    const chip = document.createElement("div");
    chip.className = "character-chip" + (char.id === state.activeSpeakerId ? " active" : "");
    chip.innerHTML = `
      <img src="${char.avatar || placeholderAvatar(char.name)}" alt="">
      <span class="chip-name">${escapeHtml(char.name)}</span>
    `;
    chip.addEventListener("click", () => switchSpeaker(char.id));
    list.appendChild(chip);
  });
}

function renderSpeakerTabs() {
  const wrap = document.getElementById("speaker-tabs");
  wrap.innerHTML = "";
  state.project.characters.forEach(char => {
    const tab = document.createElement("button");
    tab.className = "speaker-tab" + (char.id === state.activeSpeakerId ? " active" : "");
    tab.textContent = char.name;
    if (char.id === state.activeSpeakerId) tab.style.background = char.color;
    tab.addEventListener("click", () => switchSpeaker(char.id));
    wrap.appendChild(tab);
  });
  renderComposerAvatar();
}

function switchSpeaker(charId) {
  if (charId === state.activeSpeakerId) return;

  // --- FLIP animation: First, Last, Invert, Play ---
  // 1. FIRST: record where every message bubble currently sits on screen.
  const firstRects = new Map();
  document.querySelectorAll(".message-row").forEach(row => {
    firstRects.set(row.dataset.messageId, row.getBoundingClientRect());
  });

  // Apply the actual state change and re-render (bubbles now jump to their
  // new "self"/"not self" side instantly — this is the ugly instant jump).
  state.activeSpeakerId = charId;
  renderCharacterList();
  renderSpeakerTabs();
  renderComposerAvatar();
  renderFeed();

  // 2. LAST: record where each bubble ended up after the re-render.
  // 3. INVERT: shift it back to where it used to be using a transform,
  //    so visually nothing has moved yet.
  // 4. PLAY: clear the transform on the next frame, and let the CSS
  //    transition animate it smoothly from old position to new.
  document.querySelectorAll(".message-row").forEach(row => {
    const first = firstRects.get(row.dataset.messageId);
    if (!first) return; // shouldn't happen, but be safe
    const last = row.getBoundingClientRect();
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;
    if (!deltaX && !deltaY) return;

    row.style.transition = "none";
    row.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    requestAnimationFrame(() => {
      row.style.transition = "transform 0.28s ease";
      row.style.transform = "";
    });
  });

  // So you can just start typing immediately after switching characters,
  // instead of having to click into the textbox first.
  const textarea = document.getElementById("composer-text");
  textarea.focus();
  textarea.select();
}

function renderComposerAvatar() {
  const char = getActiveSpeaker();
  const img = document.getElementById("composer-avatar");
  img.src = char ? (char.avatar || placeholderAvatar(char.name)) : "";
}

function getActiveSpeaker() {
  return state.project.characters.find(c => c.id === state.activeSpeakerId) || null;
}

function placeholderAvatar(name) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" fill="#DAD5C9"/>
    <text x="50%" y="54%" font-size="28" text-anchor="middle" fill="#24211D" font-family="sans-serif">${initial}</text>
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

// ---------- CHARACTER MODAL (add/edit) ----------

let editingCharacterId = null;
let pendingAvatarDataUrl = ""; // set by the crop modal, or carried over from the character being edited

function openCharacterModal(charId = null) {
  editingCharacterId = charId;
  const char = charId ? state.project.characters.find(c => c.id === charId) : null;

  pendingAvatarDataUrl = char?.avatar || "";

  document.getElementById("modal-title").textContent = char ? "Edit character" : "New character";
  document.getElementById("char-name-input").value = char?.name || "";
  document.getElementById("char-color-input").value = char?.color || "#42fbff";
  document.getElementById("char-avatar-preview").src = pendingAvatarDataUrl || placeholderAvatar(char?.name || "?");
  document.getElementById("character-modal").classList.remove("hidden");
}

function closeCharacterModal() {
  document.getElementById("character-modal").classList.add("hidden");
}

function saveCharacterFromModal() {
  const name = document.getElementById("char-name-input").value.trim();
  if (!name) {
    alert("Give your character a name first.");
    return;
  }
  const avatar = pendingAvatarDataUrl;
  const color = document.getElementById("char-color-input").value;

  if (editingCharacterId) {
    const char = state.project.characters.find(c => c.id === editingCharacterId);
    Object.assign(char, { name, avatar, color });
  } else {
    const newChar = { id: "char_" + Date.now(), name, avatar, color };
    state.project.characters.push(newChar);
    state.activeSpeakerId = newChar.id;
  }

  persist();
  closeCharacterModal();
  renderCharacterList();
  renderSpeakerTabs();
  renderFeed(); // bubble colors may have changed
}

// ---------- AVATAR UPLOAD + CROP ----------
//
// The crop UI works by moving/scaling the <img id="crop-image"> with a CSS
// transform inside a fixed circular "viewport" div. transform-origin is 0 0,
// so `translate(x,y) scale(s)` places the image's top-left corner at pixel
// (x, y) in the viewport, at size (naturalWidth*s, naturalHeight*s).
// "Save" reads that same math back out to crop the original file.

const CROP_VIEWPORT_SIZE = 240;
const MAX_ZOOM_MULTIPLIER = 3; // how far past "fills the viewport" you can zoom in

let crop = {
  naturalWidth: 0,
  naturalHeight: 0,
  minScale: 1,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  startClientX: 0,
  startClientY: 0,
  startOffsetX: 0,
  startOffsetY: 0
};

function openCropModal(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = document.getElementById("crop-image");
    img.onload = () => {
      crop.naturalWidth = img.naturalWidth;
      crop.naturalHeight = img.naturalHeight;
      // minScale: the smallest zoom where the image still fully covers the
      // circular viewport in both directions.
      crop.minScale = Math.max(
        CROP_VIEWPORT_SIZE / crop.naturalWidth,
        CROP_VIEWPORT_SIZE / crop.naturalHeight
      );
      crop.scale = crop.minScale;
      crop.offsetX = (CROP_VIEWPORT_SIZE - crop.naturalWidth * crop.scale) / 2;
      crop.offsetY = (CROP_VIEWPORT_SIZE - crop.naturalHeight * crop.scale) / 2;
      document.getElementById("crop-zoom").value = 0;
      applyCropTransform();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  document.getElementById("crop-modal").classList.remove("hidden");
}

function closeCropModal() {
  document.getElementById("crop-modal").classList.add("hidden");
  document.getElementById("avatar-file-input").value = ""; // allow re-picking the same file later
}

function clampCropOffsets() {
  const w = crop.naturalWidth * crop.scale;
  const h = crop.naturalHeight * crop.scale;
  crop.offsetX = Math.min(0, Math.max(CROP_VIEWPORT_SIZE - w, crop.offsetX));
  crop.offsetY = Math.min(0, Math.max(CROP_VIEWPORT_SIZE - h, crop.offsetY));
}

function applyCropTransform() {
  clampCropOffsets();
  const img = document.getElementById("crop-image");
  img.style.transform = `translate(${crop.offsetX}px, ${crop.offsetY}px) scale(${crop.scale})`;
}

function bindCropEvents() {
  const viewport = document.getElementById("crop-viewport");
  const zoomSlider = document.getElementById("crop-zoom");

  const startDrag = (clientX, clientY) => {
    crop.dragging = true;
    crop.startClientX = clientX;
    crop.startClientY = clientY;
    crop.startOffsetX = crop.offsetX;
    crop.startOffsetY = crop.offsetY;
    viewport.classList.add("dragging");
  };
  const moveDrag = (clientX, clientY) => {
    if (!crop.dragging) return;
    crop.offsetX = crop.startOffsetX + (clientX - crop.startClientX);
    crop.offsetY = crop.startOffsetY + (clientY - crop.startClientY);
    applyCropTransform();
  };
  const endDrag = () => {
    crop.dragging = false;
    viewport.classList.remove("dragging");
  };

  viewport.addEventListener("mousedown", e => startDrag(e.clientX, e.clientY));
  document.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
  document.addEventListener("mouseup", endDrag);

  viewport.addEventListener("touchstart", e => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  });
  viewport.addEventListener("touchmove", e => {
    e.preventDefault(); // stop the page from scrolling while panning
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  });
  viewport.addEventListener("touchend", endDrag);

  zoomSlider.addEventListener("input", e => {
    const t = parseFloat(e.target.value); // 0..1 from the slider
    crop.scale = crop.minScale * (1 + (MAX_ZOOM_MULTIPLIER - 1) * t);
    // Re-center-ish: keep the same midpoint of the viewport pointing at the
    // same part of the image while the scale changes, then clamp.
    const oldScale = crop.scale;
    applyCropTransform();
    void oldScale; // (kept simple: just re-clamp rather than fully recentering)
  });

  document.getElementById("crop-cancel-btn").addEventListener("click", closeCropModal);

  document.getElementById("crop-save-btn").addEventListener("click", () => {
    const img = document.getElementById("crop-image");
    const outputSize = CROP_VIEWPORT_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");

    // Convert the on-screen viewport window back into source-image pixel
    // coordinates: where in the ORIGINAL file does the visible circle sit?
    const sx = -crop.offsetX / crop.scale;
    const sy = -crop.offsetY / crop.scale;
    const sSize = CROP_VIEWPORT_SIZE / crop.scale;

    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);

    pendingAvatarDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    document.getElementById("char-avatar-preview").src = pendingAvatarDataUrl;
    closeCropModal();
  });
}

// ---------- FEED / MESSAGES ----------

function renderFeed(justSentId = null) {
  const feed = document.getElementById("feed");
  feed.innerHTML = "";

  if (state.project.messages.length === 0) {
    feed.innerHTML = `<div class="feed-empty">No lines yet. Pick a character below and write the first line of your story.</div>`;
    return;
  }

  state.project.messages.forEach((msg, i) => {
    const char = state.project.characters.find(c => c.id === msg.characterId);
    if (!char) return;

    // A message is a "continuation" if the previous message came from the
    // same character — like texting apps, we only show the name/avatar once
    // per run, not on every single line.
    const prevMsg = state.project.messages[i - 1];
    const isContinuation = prevMsg && prevMsg.characterId === msg.characterId;

    const row = document.createElement("div");
    row.className = "message-row"
      + (char.id === state.activeSpeakerId ? " self" : "")
      + (isContinuation ? " continuation" : "")
      + (msg.id === justSentId ? " new" : "");
    row.dataset.messageId = msg.id;
    row.innerHTML = `
      <img src="${char.avatar || placeholderAvatar(char.name)}" alt="">
      <button class="edit-btn" title="Edit line">✏️</button>
      <div class="bubble-stack">
        <div class="speaker-name">${escapeHtml(char.name)}</div>
        <div class="bubble" style="background:${char.color}">${formatMarkdown(escapeHtml(msg.text))}</div>
      </div>
    `;

    row.querySelector(".edit-btn").addEventListener("click", () => startEditingMessage(msg.id));
    feed.appendChild(row);
  });

  feed.scrollTop = feed.scrollHeight;
}

function startEditingMessage(messageId) {
  const msg = state.project.messages.find(m => m.id === messageId);
  if (!msg) return;

  const row = document.querySelector(`.message-row[data-message-id="${messageId}"]`);
  const bubble = row.querySelector(".bubble");
  bubble.classList.add("editing");
  bubble.style.background = "";
  bubble.innerHTML = `
    <textarea class="bubble-edit-textarea">${escapeHtml(msg.text)}</textarea>
    <div class="bubble-edit-actions">
      <button class="bubble-edit-cancel">Cancel</button>
      <button class="bubble-edit-save">Save</button>
    </div>
  `;

  const textarea = bubble.querySelector(".bubble-edit-textarea");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  const cancel = () => renderFeed(); // just redraw from unmodified state

  const save = () => {
    const newText = textarea.value.trim();
    if (!newText) {
      alert("A line can't be empty — delete the character's dialogue instead if you meant to remove it.");
      return;
    }
    msg.text = newText;
    persist();
    renderFeed();
  };

  bubble.querySelector(".bubble-edit-save").addEventListener("click", save);
  bubble.querySelector(".bubble-edit-cancel").addEventListener("click", cancel);

  textarea.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      cancel();
    }
  });
}

function sendMessage() {
  const textarea = document.getElementById("composer-text");
  const text = textarea.value.trim();
  const speaker = getActiveSpeaker();

  if (!text) return;
  if (!speaker) {
    alert("Add a character first, then pick who's speaking.");
    return;
  }

  const newMsg = {
    id: "msg_" + Date.now(),
    characterId: speaker.id,
    text,
    timestamp: Date.now()
  };
  state.project.messages.push(newMsg);

  textarea.value = "";
  persist();
  renderFeed(newMsg.id);
}

// ---------- THEME ----------

const THEME_KEY = "characterau_theme";

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  document.body.classList.toggle("dark-mode", saved === "dark");
  updateThemeIcon();
}

function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem(THEME_KEY, document.body.classList.contains("dark-mode") ? "dark" : "light");
  updateThemeIcon();
}

function updateThemeIcon() {
  document.getElementById("theme-toggle-btn").textContent =
    document.body.classList.contains("dark-mode") ? "☀️" : "🌙";
}

// ---------- MISC ----------

// Runs AFTER escapeHtml, so the input is already safe from injected HTML.
// Order matters: bold (**) is checked before italic (*), since ** contains *.
function formatMarkdown(escapedText) {
  return escapedText
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- EVENT WIRING ----------

function bindStaticEvents() {
  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);

  document.getElementById("new-project-btn").addEventListener("click", () => {
    const title = prompt("Name your new story:");
    if (!title) return;
    const project = Storage.createProject(title);
    Storage.setActiveProjectId(project.id);
    switchProject(project.id);
  });

  document.getElementById("story-title").addEventListener("dblclick", () => {
    renameProject(state.project.id);
  });

  document.getElementById("add-character-btn").addEventListener("click", () => openCharacterModal());
  document.getElementById("modal-cancel-btn").addEventListener("click", closeCharacterModal);
  document.getElementById("modal-save-btn").addEventListener("click", saveCharacterFromModal);

  document.getElementById("upload-avatar-btn").addEventListener("click", () => {
    document.getElementById("avatar-file-input").click();
  });
  document.getElementById("avatar-file-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) openCropModal(file);
  });
  bindCropEvents();

  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("composer-text").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.getElementById("export-btn").addEventListener("click", () => {
    Storage.exportProject(state.project.id);
  });

  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-input").click();
  });

  document.getElementById("import-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    Storage.importProjectFromFile(file, project => {
      Storage.setActiveProjectId(project.id);
      switchProject(project.id);
    });
    e.target.value = ""; // reset so the same file can be re-imported later
  });
}

// ---------- GO ----------

document.addEventListener("DOMContentLoaded", init);
