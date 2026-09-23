/*
  app.js
  ------
  Three "views" share this one page: home, chat, and about. switchView()
  just shows/hides the right top-level container — there's no real router,
  which keeps things simple for a local, file:// app like this one.

  Characters are now a single shared pool (see storage.js) instead of being
  embedded per-story, so the same character can appear in multiple chats.
*/

let state = {
  view: "home",       // "home" | "chat" | "about"
  project: null,       // the currently open chat, or null on home/about
  activeSpeakerId: null
};

// "Don't ask again" for message deletion is intentionally just an in-memory
// Set, never saved to localStorage — reloading the page always brings the
// confirmation back, exactly as requested.
const sessionSkipConfirm = new Set();

// ---------- INIT ----------

function init() {
  initTheme();
  bindStaticEvents();
  showHome();
}

// ---------- VIEW ROUTING ----------

function switchView(view) {
  state.view = view;
  document.getElementById("home-view").classList.toggle("hidden", view !== "home");
  document.getElementById("chat-view").classList.toggle("hidden", view !== "chat");
  document.getElementById("about-view").classList.toggle("hidden", view !== "about");
}

function showHome() {
  Storage.clearActiveProjectId();
  state.project = null;
  switchView("home");
  renderHomeChats();
  renderHomeCharacters();
}

function showAbout() {
  switchView("about");
}

function openProject(project) {
  state.project = project;
  const cast = Storage.getCharactersForProject(project);
  state.activeSpeakerId = cast[0]?.id || null;
  Storage.setActiveProjectId(project.id);
  switchView("chat");
  renderChatView();
}

function persist() {
  state.project.updatedAt = Date.now();
  Storage.saveProject(state.project);
  renderProjectList();
}

// ================================================================
// HOME VIEW
// ================================================================

function renderHomeChats(searchTerm = "") {
  const container = document.getElementById("home-chats-scroll");
  const all = Object.values(Storage.getAllProjects()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  container.innerHTML = "";

  if (all.length === 0) {
    container.appendChild(makeEmptyCta("+ Create your first chat", openNewChatModal));
    return;
  }

  const filtered = searchTerm
    ? all.filter(p => p.title.toLowerCase().includes(searchTerm.toLowerCase()))
    : all;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="scroll-row-empty">No chats match "${escapeHtml(searchTerm)}".</div>`;
    return;
  }

  filtered.forEach(p => {
    const cast = Storage.getCharactersForProject(p);
    const card = document.createElement("div");
    card.className = "home-card";
    card.innerHTML = `
      <div class="home-card-title">${escapeHtml(p.title)}</div>
      <div class="home-card-meta">${cast.length ? cast.map(c => escapeHtml(c.name)).join(", ") : "No characters yet"}</div>
      <button class="card-icon-btn card-edit-btn" title="Rename">✏️</button>
      <button class="card-icon-btn card-delete-btn" title="Delete">✕</button>
    `;
    card.addEventListener("click", () => openProject(p));
    card.querySelector(".card-edit-btn").addEventListener("click", e => { e.stopPropagation(); renameChat(p.id); });
    card.querySelector(".card-delete-btn").addEventListener("click", e => { e.stopPropagation(); deleteChat(p.id); });
    container.appendChild(card);
  });
}

function renderHomeCharacters(searchTerm = "") {
  const container = document.getElementById("home-characters-scroll");
  const all = Object.values(Storage.getAllCharacters());
  container.innerHTML = "";

  if (all.length === 0) {
    container.appendChild(makeEmptyCta("+ Create your first character", () => openCharacterModal(null, "standalone")));
    return;
  }

  const filtered = searchTerm
    ? all.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : all;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="scroll-row-empty">No characters match "${escapeHtml(searchTerm)}".</div>`;
    return;
  }

  filtered.forEach(c => {
    const standalone = Storage.isCharacterStandalone(c.id);
    const card = document.createElement("div");
    card.className = "home-card";
    card.innerHTML = `
      <img src="${c.avatar || placeholderAvatar(c.name)}" alt="">
      <div class="home-card-name">${escapeHtml(c.name)}</div>
      <div class="home-card-tag">${standalone ? "Standalone" : "In a chat"}</div>
      <button class="card-icon-btn card-edit-btn" title="Edit">✏️</button>
      <button class="card-icon-btn card-delete-btn" title="Delete">✕</button>
    `;
    // Clicking the card itself: standalone characters start a brand-new chat;
    // characters already in a chat jump straight to (one of) that chat.
    card.addEventListener("click", () => {
      if (Storage.isCharacterStandalone(c.id)) {
        const project = Storage.createProject("New Chat", [c.id]);
        openProject(project);
      } else {
        const project = Storage.findProjectForCharacter(c.id);
        if (project) openProject(project);
      }
    });
    card.querySelector(".card-edit-btn").addEventListener("click", e => {
      e.stopPropagation();
      openCharacterModal(c.id, "global");
    });
    card.querySelector(".card-delete-btn").addEventListener("click", e => {
      e.stopPropagation();
      deleteCharacterEverywhere(c.id);
    });
    container.appendChild(card);
  });
}

function makeEmptyCta(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "home-empty-cta";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function bindHomeSearchToggles() {
  document.querySelectorAll(".home-search-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target; // "chats" or "characters"
      const input = document.getElementById(`home-${target}-search`);
      const opening = input.classList.contains("hidden");
      input.classList.toggle("hidden");
      if (opening) {
        input.focus();
      } else {
        input.value = "";
        target === "chats" ? renderHomeChats() : renderHomeCharacters();
      }
    });
  });

  document.getElementById("home-chats-search").addEventListener("input", e => renderHomeChats(e.target.value));
  document.getElementById("home-characters-search").addEventListener("input", e => renderHomeCharacters(e.target.value));
}

// ================================================================
// NEW CHAT MODAL (title + pick existing characters + create new ones)
// ================================================================

let pendingNewChatCharacterIds = new Set();

function openNewChatModal() {
  pendingNewChatCharacterIds = new Set();
  document.getElementById("new-chat-title-input").value = "";
  renderNewChatCharacterList();
  document.getElementById("new-chat-modal").classList.remove("hidden");
  document.getElementById("new-chat-title-input").focus();
}

function closeNewChatModal() {
  document.getElementById("new-chat-modal").classList.add("hidden");
}

function renderNewChatCharacterList() {
  const container = document.getElementById("new-chat-character-list");
  const all = Object.values(Storage.getAllCharacters());
  container.innerHTML = "";

  if (all.length === 0) {
    container.innerHTML = `<div class="new-chat-char-empty">No characters yet — create one below.</div>`;
    return;
  }

  all.forEach(c => {
    const row = document.createElement("label");
    row.className = "new-chat-char-row";
    row.innerHTML = `
      <input type="checkbox" ${pendingNewChatCharacterIds.has(c.id) ? "checked" : ""}>
      <img src="${c.avatar || placeholderAvatar(c.name)}" alt="">
      <span>${escapeHtml(c.name)}</span>
    `;
    row.querySelector("input").addEventListener("change", e => {
      if (e.target.checked) pendingNewChatCharacterIds.add(c.id);
      else pendingNewChatCharacterIds.delete(c.id);
    });
    container.appendChild(row);
  });
}

function createChatFromModal() {
  const title = document.getElementById("new-chat-title-input").value.trim() || "Untitled Story";
  const project = Storage.createProject(title, [...pendingNewChatCharacterIds]);
  closeNewChatModal();
  openProject(project);
}

// ================================================================
// CHAT VIEW
// ================================================================

function renderChatView() {
  renderProjectList();
  document.getElementById("story-title").textContent = state.project.title;
  renderCharacterList();
  renderSpeakerTabs();
  renderFeed();
}

function renderProjectList() {
  const list = document.getElementById("project-list");
  const all = Object.values(Storage.getAllProjects()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  list.innerHTML = "";

  all.forEach(p => {
    const item = document.createElement("div");
    item.className = "project-item" + (state.project && p.id === state.project.id ? " active" : "");
    item.innerHTML = `
      <span class="project-name">${escapeHtml(p.title)}</span>
      <button class="row-icon-btn row-edit-btn" title="Rename">✏️</button>
      <button class="row-icon-btn row-delete-btn" title="Delete">✕</button>
    `;
    item.querySelector(".project-name").addEventListener("click", () => switchProject(p.id));
    item.querySelector(".row-edit-btn").addEventListener("click", e => { e.stopPropagation(); renameChat(p.id); });
    item.querySelector(".row-delete-btn").addEventListener("click", e => { e.stopPropagation(); deleteChat(p.id); });
    list.appendChild(item);
  });
}

function switchProject(id) {
  if (state.project && id === state.project.id) return;
  const project = Storage.getProject(id);
  if (project) openProject(project);
}

function renameChat(id) {
  const project = Storage.getProject(id);
  if (!project) return;
  showPrompt("Rename chat", project.title, title => {
    project.title = title;
    project.updatedAt = Date.now();
    Storage.saveProject(project);
    if (state.project && state.project.id === id) {
      state.project.title = title;
      document.getElementById("story-title").textContent = title;
    }
    if (state.view === "chat") renderProjectList();
    if (state.view === "home") renderHomeChats();
  });
}

function deleteChat(id) {
  const project = Storage.getProject(id);
  if (!project) return;
  showConfirm(`Delete "${project.title}"? This can't be undone.`, () => {
    const wasOpenInChatView = state.view === "chat" && state.project && state.project.id === id;
    Storage.deleteProject(id);

    if (wasOpenInChatView) {
      const remaining = Object.values(Storage.getAllProjects()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      remaining.length > 0 ? openProject(remaining[0]) : showHome();
    } else if (state.view === "chat") {
      renderProjectList();
    }

    if (state.view === "home") renderHomeChats();
  });
}

// ---------- CHARACTERS (within the open chat) ----------

function renderCharacterList() {
  const list = document.getElementById("character-list");
  const cast = Storage.getCharactersForProject(state.project);
  list.innerHTML = "";

  cast.forEach(char => {
    const chip = document.createElement("div");
    chip.className = "character-chip" + (char.id === state.activeSpeakerId ? " active" : "");
    chip.innerHTML = `
      <img src="${char.avatar || placeholderAvatar(char.name)}" alt="">
      <span class="chip-name">${escapeHtml(char.name)}</span>
      <button class="row-icon-btn" title="Edit character">✏️</button>
    `;
    chip.addEventListener("click", () => switchSpeaker(char.id));
    chip.querySelector(".row-icon-btn").addEventListener("click", e => {
      e.stopPropagation();
      openCharacterModal(char.id, "project");
    });
    list.appendChild(chip);
  });
}

function renderSpeakerTabs() {
  const wrap = document.getElementById("speaker-tabs");
  const cast = Storage.getCharactersForProject(state.project);
  wrap.innerHTML = "";

  cast.forEach(char => {
    const tab = document.createElement("button");
    tab.className = "speaker-tab" + (char.id === state.activeSpeakerId ? " active" : "");
    tab.textContent = char.name;
    if (char.id === state.activeSpeakerId) {
      tab.style.background = char.color;
      tab.style.color = getBubbleTextStyle(char.color).color;
    }
    tab.addEventListener("click", () => switchSpeaker(char.id));
    wrap.appendChild(tab);
  });
  renderComposerAvatar();
}

function switchSpeaker(charId) {
  if (charId === state.activeSpeakerId) return;

  // --- FLIP animation: First, Last, Invert, Play ---
  const firstRects = new Map();
  document.querySelectorAll(".message-row").forEach(row => {
    firstRects.set(row.dataset.messageId, row.getBoundingClientRect());
  });

  state.activeSpeakerId = charId;
  renderCharacterList();
  renderSpeakerTabs();
  renderComposerAvatar();
  renderFeed();

  document.querySelectorAll(".message-row").forEach(row => {
    const first = firstRects.get(row.dataset.messageId);
    if (!first) return;
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

  // Jump straight into typing after switching, no extra click needed.
  const textarea = document.getElementById("composer-text");
  textarea.focus();
  textarea.select();
}

function renderComposerAvatar() {
  const char = getActiveSpeaker();
  document.getElementById("composer-avatar").src = char ? (char.avatar || placeholderAvatar(char.name)) : "";
}

function getActiveSpeaker() {
  return state.activeSpeakerId ? Storage.getCharacter(state.activeSpeakerId) : null;
}

function placeholderAvatar(name) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" fill="#DAD5C9"/>
    <text x="50%" y="54%" font-size="28" text-anchor="middle" fill="#24211D" font-family="sans-serif">${initial}</text>
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

// ================================================================
// CHARACTER MODAL (create / edit / delete)
// ================================================================
//
// `context` decides what happens right after the character itself is saved:
//   "project"    -> attach it to the currently open chat's cast
//   "pending"    -> add it to the New Chat modal's pending selection
//   "global"     -> just edit it in place (opened from a home character card)
//   "standalone" -> create it with no chat attached yet (home page)

let editingCharacterId = null;
let characterModalContext = "project";
let pendingAvatarDataUrl = "";

function openCharacterModal(charId, context) {
  editingCharacterId = charId;
  characterModalContext = context;
  const char = charId ? Storage.getCharacter(charId) : null;
  pendingAvatarDataUrl = char?.avatar || "";

  document.getElementById("modal-title").textContent = char ? "Edit character" : "New character";
  document.getElementById("char-name-input").value = char?.name || "";
  document.getElementById("char-color-input").value = char?.color || "#42fbff";
  document.getElementById("char-avatar-preview").src = pendingAvatarDataUrl || placeholderAvatar(char?.name || "?");
  document.getElementById("char-delete-btn").classList.toggle("hidden", !charId);
  document.getElementById("character-modal").classList.remove("hidden");
}

function closeCharacterModal() {
  document.getElementById("character-modal").classList.add("hidden");
}

function saveCharacterFromModal() {
  const name = document.getElementById("char-name-input").value.trim();
  if (!name) {
    showAlert("Give your character a name first.");
    return;
  }
  const avatar = pendingAvatarDataUrl;
  const color = document.getElementById("char-color-input").value;
  const charId = editingCharacterId || ("char_" + Date.now());

  Storage.saveCharacter({ id: charId, name, avatar, color });

  if (characterModalContext === "project" && state.project) {
    if (!state.project.characterIds.includes(charId)) {
      state.project.characterIds.push(charId);
    }
    if (!state.activeSpeakerId) state.activeSpeakerId = charId;
    persist();
    renderCharacterList();
    renderSpeakerTabs();
    renderFeed(); // name/avatar/color may have changed on existing bubbles
  } else if (characterModalContext === "pending") {
    pendingNewChatCharacterIds.add(charId);
    renderNewChatCharacterList();
  }

  closeCharacterModal();
  if (state.view === "home") {
    renderHomeCharacters();
    renderHomeChats();
  }
}

function deleteCharacterFromModal() {
  if (!editingCharacterId) return;
  deleteCharacterEverywhere(editingCharacterId, closeCharacterModal);
}

// Shared by the character modal's delete button AND the home character
// card's delete button.
function deleteCharacterEverywhere(charId, afterDelete) {
  const char = Storage.getCharacter(charId);
  showConfirm(
    `Delete ${char?.name || "this character"}? Their existing lines will stay in your chats, shown as "Deleted Character".`,
    () => {
      Storage.deleteCharacter(charId);

      if (state.project && state.activeSpeakerId === charId) {
        state.project = Storage.getProject(state.project.id) || state.project;
        const remaining = Storage.getCharactersForProject(state.project);
        state.activeSpeakerId = remaining[0]?.id || null;
      }

      if (afterDelete) afterDelete();

      if (state.view === "chat" && state.project) {
        state.project = Storage.getProject(state.project.id) || state.project;
        renderCharacterList();
        renderSpeakerTabs();
        renderComposerAvatar();
        renderFeed();
      }
      if (state.view === "home") {
        renderHomeCharacters();
        renderHomeChats();
      }
    }
  );
}

// ---------- Bubble text contrast ----------
// Picks readable text (and a matching shadow) for ANY bubble color the
// author chooses, instead of assuming white text always works.

function hexToRgb(hex) {
  const match = (hex || "").replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!match) return { r: 130, g: 130, b: 130 };
  const int = parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function getBubbleTextStyle(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6
    ? { color: "#141414", shadow: "0 1px 2px rgba(255,255,255,0.7), 0 1px 1px rgba(0,0,0,0.15)" }
    : { color: "#ffffff", shadow: "0 1px 3px rgba(0,0,0,0.8), 0 0px 1px rgba(0,0,0,0.9)" };
}

// ================================================================
// AVATAR UPLOAD + CROP
// ================================================================
//
// The crop UI moves/scales the <img id="crop-image"> with a CSS transform
// inside a fixed circular "viewport" div. transform-origin is 0 0, so
// `translate(x,y) scale(s)` places the image's top-left corner at pixel
// (x, y) in the viewport, at size (naturalWidth*s, naturalHeight*s).
// "Save" reads that same math back out to crop the original file.

const CROP_VIEWPORT_SIZE = 240;
const MAX_ZOOM_MULTIPLIER = 3;

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
  document.getElementById("avatar-file-input").value = "";
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
    e.preventDefault();
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  });
  viewport.addEventListener("touchend", endDrag);

  // Zooming now keeps whatever is at the CENTER of the viewport fixed in
  // place, instead of anchoring to the top-left corner (the old bug).
  zoomSlider.addEventListener("input", e => {
    const t = parseFloat(e.target.value);
    const newScale = crop.minScale * (1 + (MAX_ZOOM_MULTIPLIER - 1) * t);
    const oldScale = crop.scale;

    const centerX = CROP_VIEWPORT_SIZE / 2;
    const centerY = CROP_VIEWPORT_SIZE / 2;
    const imageXAtCenter = (centerX - crop.offsetX) / oldScale;
    const imageYAtCenter = (centerY - crop.offsetY) / oldScale;

    crop.scale = newScale;
    crop.offsetX = centerX - imageXAtCenter * newScale;
    crop.offsetY = centerY - imageYAtCenter * newScale;

    applyCropTransform();
  });

  document.getElementById("crop-cancel-btn").addEventListener("click", closeCropModal);

  document.getElementById("crop-save-btn").addEventListener("click", () => {
    const img = document.getElementById("crop-image");
    const outputSize = CROP_VIEWPORT_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");

    const sx = -crop.offsetX / crop.scale;
    const sy = -crop.offsetY / crop.scale;
    const sSize = CROP_VIEWPORT_SIZE / crop.scale;

    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);

    pendingAvatarDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    document.getElementById("char-avatar-preview").src = pendingAvatarDataUrl;
    closeCropModal();
  });
}

// ================================================================
// FEED / MESSAGES
// ================================================================

// Characters can be deleted while their dialogue stays in the story, so
// lookups always fall back to a neutral placeholder instead of vanishing.
function getCharacterOrPlaceholder(id) {
  return Storage.getCharacter(id) || { id, name: "Deleted Character", avatar: "", color: "#8A8A8A" };
}

function renderFeed(justSentId = null) {
  const feed = document.getElementById("feed");
  feed.innerHTML = "";

  if (state.project.messages.length === 0) {
    feed.innerHTML = `<div class="feed-empty">No lines yet. Pick a character below and write the first line of your story.</div>`;
    return;
  }

  state.project.messages.forEach((msg, i) => {
    const char = getCharacterOrPlaceholder(msg.characterId);

    const prevMsg = state.project.messages[i - 1];
    const isContinuation = prevMsg && prevMsg.characterId === msg.characterId;
    const textStyle = getBubbleTextStyle(char.color);

    const row = document.createElement("div");
    row.className = "message-row"
      + (char.id === state.activeSpeakerId ? " self" : "")
      + (isContinuation ? " continuation" : "")
      + (msg.id === justSentId ? " new" : "");
    row.dataset.messageId = msg.id;
    row.innerHTML = `
      <img src="${char.avatar || placeholderAvatar(char.name)}" alt="">
      <div class="row-actions">
        <button class="edit-btn" title="Edit line">✏️</button>
        <button class="delete-btn" title="Delete line">🗑️</button>
      </div>
      <div class="bubble-stack">
        <div class="speaker-name">${escapeHtml(char.name)}</div>
        <div class="bubble" style="background:${char.color}; color:${textStyle.color}; text-shadow:${textStyle.shadow};">${formatMarkdown(escapeHtml(msg.text))}</div>
      </div>
    `;

    row.querySelector(".edit-btn").addEventListener("click", () => startEditingMessage(msg.id));
    row.querySelector(".delete-btn").addEventListener("click", () => confirmDeleteMessage(msg.id));
    feed.appendChild(row);
  });

  feed.scrollTop = feed.scrollHeight;
}

function confirmDeleteMessage(messageId) {
  const doDelete = () => {
    state.project.messages = state.project.messages.filter(m => m.id !== messageId);
    persist();
    renderFeed();
  };
  showConfirm("Delete this message?", doDelete, { allowDontAskAgain: true, dontAskKey: "deleteMessage" });
}

function autoGrowTextarea(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function startEditingMessage(messageId) {
  const msg = state.project.messages.find(m => m.id === messageId);
  if (!msg) return;

  const row = document.querySelector(`.message-row[data-message-id="${messageId}"]`);
  const bubble = row.querySelector(".bubble");
  bubble.classList.add("editing");
  bubble.innerHTML = `
    <textarea class="bubble-edit-textarea">${escapeHtml(msg.text)}</textarea>
    <div class="bubble-edit-actions">
      <button class="bubble-edit-cancel">Cancel</button>
      <button class="bubble-edit-save">Save</button>
    </div>
  `;

  const textarea = bubble.querySelector(".bubble-edit-textarea");
  autoGrowTextarea(textarea); // sizes to the existing text right away
  textarea.addEventListener("input", () => autoGrowTextarea(textarea));
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  const cancel = () => renderFeed();

  const save = () => {
    const newText = textarea.value.trim();
    if (!newText) {
      showAlert("A line can't be empty — delete the line instead if you meant to remove it.");
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
    showAlert("Add a character first, then pick who's speaking.");
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

// ================================================================
// THEME
// ================================================================

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

// ================================================================
// GENERIC MODALS — replace window.prompt / confirm / alert
// ================================================================

function showPrompt(title, defaultValue, onOk) {
  document.getElementById("prompt-modal-title").textContent = title;
  const input = document.getElementById("prompt-modal-input");
  input.value = defaultValue || "";
  document.getElementById("prompt-modal").classList.remove("hidden");
  input.focus();
  input.select();

  const close = () => document.getElementById("prompt-modal").classList.add("hidden");

  document.getElementById("prompt-modal-ok").onclick = () => {
    const val = input.value.trim();
    if (!val) return;
    close();
    onOk(val);
  };
  document.getElementById("prompt-modal-cancel").onclick = close;
  input.onkeydown = e => {
    if (e.key === "Enter") document.getElementById("prompt-modal-ok").click();
    if (e.key === "Escape") close();
  };
}

function showConfirm(message, onOk, { allowDontAskAgain = false, dontAskKey = null } = {}) {
  // Already suppressed this session? Skip the modal and just do it.
  if (dontAskKey && sessionSkipConfirm.has(dontAskKey)) {
    onOk();
    return;
  }

  document.getElementById("confirm-modal-message").textContent = message;
  const wrap = document.getElementById("confirm-modal-dontask-wrap");
  const checkbox = document.getElementById("confirm-modal-dontask");
  checkbox.checked = false;
  wrap.classList.toggle("hidden", !allowDontAskAgain);

  document.getElementById("confirm-modal").classList.remove("hidden");
  const close = () => document.getElementById("confirm-modal").classList.add("hidden");

  document.getElementById("confirm-modal-ok").onclick = () => {
    if (allowDontAskAgain && checkbox.checked && dontAskKey) {
      sessionSkipConfirm.add(dontAskKey);
    }
    close();
    onOk();
  };
  document.getElementById("confirm-modal-cancel").onclick = close;
}

function showAlert(message) {
  document.getElementById("alert-modal-message").textContent = message;
  document.getElementById("alert-modal").classList.remove("hidden");
  document.getElementById("alert-modal-ok").onclick = () => document.getElementById("alert-modal").classList.add("hidden");
}

// ================================================================
// MARKDOWN + ESCAPING
// ================================================================

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

// ================================================================
// EVENT WIRING
// ================================================================

function bindStaticEvents() {
  // Global fixed controls
  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);
  document.getElementById("about-btn").addEventListener("click", showAbout);
  document.getElementById("about-back-btn").addEventListener("click", () => {
    // Return to wherever makes sense: back into the open chat, or home.
    state.project ? switchView("chat") : showHome();
  });

  // Home
  document.getElementById("home-new-chat-btn").addEventListener("click", openNewChatModal);
  document.getElementById("home-new-character-btn").addEventListener("click", () => openCharacterModal(null, "standalone"));
  bindHomeSearchToggles();

  // Chat view navigation
  document.getElementById("go-home-btn").addEventListener("click", showHome);
  document.getElementById("new-project-btn").addEventListener("click", openNewChatModal);
  document.getElementById("story-title").addEventListener("dblclick", () => renameChat(state.project.id));
  document.getElementById("rename-story-btn").addEventListener("click", () => renameChat(state.project.id));

  // New chat modal
  document.getElementById("new-chat-cancel-btn").addEventListener("click", closeNewChatModal);
  document.getElementById("new-chat-create-btn").addEventListener("click", createChatFromModal);
  document.getElementById("new-chat-create-character-btn").addEventListener("click", () => openCharacterModal(null, "pending"));

  // Character modal
  document.getElementById("add-character-btn").addEventListener("click", () => openCharacterModal(null, "project"));
  document.getElementById("modal-cancel-btn").addEventListener("click", closeCharacterModal);
  document.getElementById("modal-save-btn").addEventListener("click", saveCharacterFromModal);
  document.getElementById("char-delete-btn").addEventListener("click", deleteCharacterFromModal);

  document.getElementById("upload-avatar-btn").addEventListener("click", () => {
    document.getElementById("avatar-file-input").click();
  });
  document.getElementById("avatar-file-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) openCropModal(file);
  });
  bindCropEvents();

  // Composer
  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("composer-text").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Export / import
  document.getElementById("export-btn").addEventListener("click", () => {
    Storage.exportProject(state.project.id);
  });
  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-input").click();
  });
  document.getElementById("import-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    Storage.importProjectFromFile(
      file,
      project => openProject(project),
      () => showAlert("That file doesn't look like a valid Character.au story.")
    );
    e.target.value = "";
  });
}

// ---------- GO ----------

document.addEventListener("DOMContentLoaded", init);
