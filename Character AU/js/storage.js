/*
  storage.js
  ----------
  Everything that touches localStorage lives in this one file.
  app.js never calls `localStorage` directly — it only calls functions
  defined here. That separation means if you ever swap localStorage
  for, say, IndexedDB or a real backend, app.js barely has to change.

  Data shape for one project:
  {
    id: "proj_173...",
    title: "The Coffee Shop AU",
    characters: [
      { id: "char_1", name: "Mara", avatar: "data:image/jpeg;base64,...", color: "#42fbff" }
    ],
    messages: [
      { id: "msg_1", characterId: "char_1", text: "...", timestamp: 173... }
    ]
  }
*/

const STORAGE_KEY = "characterau_projects";
const ACTIVE_KEY = "characterau_active_project";

// A tiny helper: localStorage only stores strings, so every read/write
// has to go through JSON.parse / JSON.stringify.
function readAllProjects() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Corrupted project data in localStorage:", err);
    return {};
  }
}

function writeAllProjects(projectsById) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projectsById));
}

const Storage = {
  // ---- Project CRUD ----
  getAllProjects() {
    return readAllProjects();
  },

  getProject(id) {
    return readAllProjects()[id] || null;
  },

  saveProject(project) {
    const all = readAllProjects();
    all[project.id] = project;
    writeAllProjects(all);
  },

  deleteProject(id) {
    const all = readAllProjects();
    delete all[id];
    writeAllProjects(all);
  },

  createProject(title) {
    const project = {
      id: "proj_" + Date.now(),
      title: title || "Untitled Story",
      characters: [],
      messages: [],
      updatedAt: Date.now()
    };
    this.saveProject(project);
    return project;
  },

  // ---- Which project is currently open ----
  getActiveProjectId() {
    return localStorage.getItem(ACTIVE_KEY);
  },

  setActiveProjectId(id) {
    localStorage.setItem(ACTIVE_KEY, id);
  },

  // ---- Export / import as .json files, for real backups/sharing ----
  exportProject(id) {
    const project = this.getProject(id);
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importProjectFromFile(file, onDone) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result);
        // Give it a fresh id so it never collides with an existing project
        project.id = "proj_" + Date.now();
        this.saveProject(project);
        onDone(project);
      } catch (err) {
        alert("That file doesn't look like a valid Character.au story.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  }
};
