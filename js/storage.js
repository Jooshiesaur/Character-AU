/*
  storage.js
  ----------
  Everything that touches localStorage lives in this one file.

  DATA MODEL (v2):
  Characters now live in their OWN pool, separate from any single story,
  so the same character can be reused across multiple chats — that's what
  makes "add an existing character to a new chat" and "standalone
  characters" on the home page possible.

    characterau_characters  ->  { [charId]: { id, name, avatar, color } }
    characterau_projects    ->  { [projectId]: {
                                    id, title, updatedAt,
                                    characterIds: [charId, ...],
                                    messages: [{ id, characterId, text, timestamp }]
                                  } }

  MIGRATION: earlier versions of this app stored each project's characters
  embedded directly inside the project (project.characters = [...]). The
  very first time this file loads, ensureMigrated() below converts any
  old-shaped project it finds into the new shape, moving its embedded
  characters into the shared pool. This runs automatically and only once
  per project (afterwards it looks exactly like new data), so nothing you
  already saved gets lost.
*/

const CHAR_KEY = "characterau_characters";
const PROJECT_KEY = "characterau_projects";
const ACTIVE_KEY = "characterau_active_project";

// ---- low-level read/write helpers (localStorage only stores strings) ----

function readJSON(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Corrupted data in localStorage["${key}"]:`, err);
    return {};
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- one-time migration from the old embedded-character format ----

function ensureMigrated() {
  const projects = readJSON(PROJECT_KEY);
  const characters = readJSON(CHAR_KEY);
  let changed = false;

  Object.values(projects).forEach(project => {
    if (Array.isArray(project.characters)) {
      project.characterIds = project.characters.map(c => {
        if (!characters[c.id]) characters[c.id] = c;
        return c.id;
      });
      delete project.characters;
      changed = true;
    }
    if (!project.characterIds) project.characterIds = [];
  });

  if (changed) {
    writeJSON(PROJECT_KEY, projects);
    writeJSON(CHAR_KEY, characters);
  }
}
ensureMigrated();

const Storage = {

  // ================= CHARACTERS (shared pool) =================

  getAllCharacters() {
    return readJSON(CHAR_KEY);
  },

  getCharacter(id) {
    return readJSON(CHAR_KEY)[id] || null;
  },

  saveCharacter(character) {
    const all = readJSON(CHAR_KEY);
    all[character.id] = character;
    writeJSON(CHAR_KEY, all);
  },

  // Removes a character from the pool AND from every project's cast list.
  // Messages that reference this character are left untouched — the UI
  // renders them with a "Deleted Character" placeholder instead of
  // silently destroying dialogue.
  deleteCharacter(id) {
    const characters = readJSON(CHAR_KEY);
    delete characters[id];
    writeJSON(CHAR_KEY, characters);

    const projects = readJSON(PROJECT_KEY);
    Object.values(projects).forEach(project => {
      project.characterIds = (project.characterIds || []).filter(cid => cid !== id);
    });
    writeJSON(PROJECT_KEY, projects);
  },

  // A character is "standalone" if it isn't in any project's cast yet.
  isCharacterStandalone(id) {
    const projects = Object.values(readJSON(PROJECT_KEY));
    return !projects.some(p => (p.characterIds || []).includes(id));
  },

  // The first project (by most-recently-updated) that includes this character.
  findProjectForCharacter(id) {
    const projects = Object.values(readJSON(PROJECT_KEY))
      .filter(p => (p.characterIds || []).includes(id))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return projects[0] || null;
  },

  // ================= PROJECTS (chats/stories) =================

  getAllProjects() {
    return readJSON(PROJECT_KEY);
  },

  getProject(id) {
    return readJSON(PROJECT_KEY)[id] || null;
  },

  saveProject(project) {
    const all = readJSON(PROJECT_KEY);
    all[project.id] = project;
    writeJSON(PROJECT_KEY, all);
  },

  deleteProject(id) {
    const all = readJSON(PROJECT_KEY);
    delete all[id];
    writeJSON(PROJECT_KEY, all);
  },

  createProject(title, characterIds = []) {
    const project = {
      id: "proj_" + Date.now(),
      title: title || "Untitled Story",
      characterIds: [...characterIds],
      messages: [],
      updatedAt: Date.now()
    };
    this.saveProject(project);
    return project;
  },

  // Convenience: resolve a project's characterIds into full character objects.
  getCharactersForProject(project) {
    const pool = readJSON(CHAR_KEY);
    return (project.characterIds || []).map(id => pool[id]).filter(Boolean);
  },

  // ---- which project the app was last sitting in ----
  getActiveProjectId() {
    return localStorage.getItem(ACTIVE_KEY);
  },
  setActiveProjectId(id) {
    localStorage.setItem(ACTIVE_KEY, id);
  },
  clearActiveProjectId() {
    localStorage.removeItem(ACTIVE_KEY);
  },

  // ================= EXPORT / IMPORT =================
  // Export format is intentionally self-contained (full character data
  // embedded, not just IDs) so a .json file works standalone — including
  // being re-imported into a totally different browser/computer.

  exportProject(id) {
    const project = this.getProject(id);
    if (!project) return;
    const pool = readJSON(CHAR_KEY);
    const exportData = {
      title: project.title,
      messages: project.messages,
      characters: (project.characterIds || []).map(cid => pool[cid]).filter(Boolean)
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importProjectFromFile(file, onDone, onError) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const pool = readJSON(CHAR_KEY);

        // Give every imported character a fresh id so it can never collide
        // with something already in this browser's character pool, and
        // remember the old->new mapping so messages can be re-pointed.
        const idMap = {};
        const newCharacterIds = [];
        (data.characters || []).forEach(c => {
          const newId = "char_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
          idMap[c.id] = newId;
          pool[newId] = { id: newId, name: c.name, avatar: c.avatar || "", color: c.color || "#42fbff" };
          newCharacterIds.push(newId);
        });
        writeJSON(CHAR_KEY, pool);

        const messages = (data.messages || []).map(m => ({
          ...m,
          characterId: idMap[m.characterId] || m.characterId
        }));

        const project = {
          id: "proj_" + Date.now(),
          title: data.title || "Imported Story",
          characterIds: newCharacterIds,
          messages,
          updatedAt: Date.now()
        };
        this.saveProject(project);
        onDone(project);
      } catch (err) {
        console.error(err);
        if (onError) onError(err);
      }
    };
    reader.readAsText(file);
  }
};
