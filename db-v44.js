(function () {
  "use strict";

  const DB_NAME = "today-memo-todo-db";
  const DB_VERSION = 3;
  const ROUTINE_INPUT_STORE = "routineInputs";
  const TODO_STORE = "todos";
  const NOTE_STORE = "notes";
  const ROUTINE_STORE = "routines";
  const ROUTINE_HISTORY_STORE = "routineHistories";

  let dbPromise;

  function openDB() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ROUTINE_INPUT_STORE)) db.createObjectStore(ROUTINE_INPUT_STORE, { keyPath: "id" });

        if (!db.objectStoreNames.contains(TODO_STORE)) {
          const todoStore = db.createObjectStore(TODO_STORE, { keyPath: "id" });
          todoStore.createIndex("date", "date", { unique: false });
          todoStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(NOTE_STORE)) {
          const noteStore = db.createObjectStore(NOTE_STORE, { keyPath: "id" });
          noteStore.createIndex("date", "date", { unique: false });
          noteStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(ROUTINE_STORE)) {
          const routineStore = db.createObjectStore(ROUTINE_STORE, { keyPath: "id" });
          routineStore.createIndex("nextDueDate", "nextDueDate", { unique: false });
          routineStore.createIndex("category", "category", { unique: false });
          routineStore.createIndex("isActive", "isActive", { unique: false });
          routineStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(ROUTINE_HISTORY_STORE)) {
          const historyStore = db.createObjectStore(ROUTINE_HISTORY_STORE, { keyPath: "id" });
          historyStore.createIndex("routineId", "routineId", { unique: false });
          historyStore.createIndex("doneDate", "doneDate", { unique: false });
          historyStore.createIndex("createdAt", "createdAt", { unique: false });
        }
      };

      request.onblocked = () => window.dispatchEvent(new Event("tmt-db-blocked"));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function useStore(storeName, mode, callback) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      result = callback(store);
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getTodosByDate(date) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TODO_STORE, "readonly");
      const index = transaction.objectStore(TODO_STORE).index("date");
      const request = index.getAll(date);

      request.onsuccess = () => {
        const todos = request.result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        resolve(todos);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getTodosByDateRange(startDate, endDate) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TODO_STORE, "readonly");
      const index = transaction.objectStore(TODO_STORE).index("date");
      const range = IDBKeyRange.bound(startDate, endDate);
      const request = index.getAll(range);

      request.onsuccess = () => {
        const todos = request.result.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
        resolve(todos);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllTodos() {
    return useStore(TODO_STORE, "readonly", (store) => requestToPromise(store.getAll()));
  }

  async function getUndatedTodos() {
    const todos = await getAllTodos();
    return todos
      .filter((todo) => !todo.date)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async function addTodo(title, date, time = "", options = {}) {
    const now = new Date().toISOString();
    const todo = {
      id: createId("todo"),
      date,
      title,
      details: typeof options.details === "string" ? options.details : "",
      subtasks: normalizeSubtasks(options.subtasks),
      routineSubtaskIds: normalizeRoutineSubtaskIds(options.routineSubtaskIds, options.subtasks),
      status: "todo",
      time,
      isPriority: options.isPriority === true,
      routineId: options.routineId || "",
      routineDate: options.routineDate || "",
      createdByRoutine: options.createdByRoutine === true,
      routineAutoGenerated: options.routineAutoGenerated === true,
      createdAt: now,
      updatedAt: now
    };

    return useStore(TODO_STORE, "readwrite", store => new Promise((resolve, reject) => {
      if (!todo.routineId || !todo.routineAutoGenerated) { store.add(todo); resolve(todo); return; }
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const existing = request.result.find(item => item.routineId === todo.routineId && (item.routineDate || item.date) === todo.routineDate);
        if (existing) resolve(existing);
        else { store.add(todo); resolve(todo); }
      };
    }));
  }

  async function updateTodo(todo) {
    return useStore(TODO_STORE, "readwrite", (store) => new Promise((resolve, reject) => {
      const request = store.get(todo.id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) { reject(new Error("ToDo not found")); return; }
        // Parent edits must not overwrite a newer subtask edit from another view.
        const nextTodo = { ...request.result, ...todo, subtasks: normalizeSubtasks(request.result.subtasks), updatedAt: new Date().toISOString() };
        if (nextTodo.routineId && nextTodo.date !== request.result.date) nextTodo.routineAutoGenerated = false;
        store.put(nextTodo);
        resolve(nextTodo);
      };
    }));
  }

  function normalizeSubtasks(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter(item => item && typeof item.title === "string" && item.title.trim()).map(item => {
      let id = typeof item.id === "string" && item.id ? item.id : createId("subtask");
      if (seen.has(id)) id = createId("subtask");
      seen.add(id);
      return {
        id, title: item.title.trim(), done: item.done === true,
        ...(typeof item.routineSubtaskId === "string" && item.routineSubtaskId
          ? { routineSubtaskId: item.routineSubtaskId } : {})
      };
    });
  }

  function freshSubtasks(items, options = {}) {
    return normalizeSubtasks(items).map(item => ({
      id: createId("subtask"), title: item.title, done: options.preserveDone === true && item.done,
      ...(options.fromRoutine ? { routineSubtaskId: item.id } : {})
    }));
  }

  function normalizeRoutineSubtaskIds(ids, items) {
    return Array.from(new Set([
      ...(Array.isArray(ids) ? ids.filter(id => typeof id === "string" && id) : []),
      ...(Array.isArray(items) ? items.map(item => item?.routineSubtaskId).filter(id => typeof id === "string" && id) : [])
    ]));
  }

  // Remember applied template IDs even if a user removes a child on one date.
  // Legacy records have no IDs: use the previous template to identify removed items.
  function mergeRoutineSubtasks(todo, templates, previousTemplates) {
    let items = normalizeSubtasks(todo.subtasks);
    const currentTemplates = normalizeSubtasks(templates);
    const previousIds = new Set(normalizeSubtasks(previousTemplates).map(item => item.id));
    const activeIds = new Set(currentTemplates.map(item => item.id));
    const known = new Set(normalizeRoutineSubtaskIds(todo.routineSubtaskIds, items));
    let added = 0;
    let changed = false;
    normalizeSubtasks(previousTemplates).forEach(template => {
      if (activeIds.has(template.id) || known.has(template.id)) return;
      const match = items.find(item => !item.routineSubtaskId && item.title === template.title);
      if (match) {
        match.routineSubtaskId = template.id;
        known.add(template.id);
      }
    });
    const removed = items.filter(item => item.routineSubtaskId && !activeIds.has(item.routineSubtaskId)).length;
    if (removed) {
      items = items.filter(item => !item.routineSubtaskId || activeIds.has(item.routineSubtaskId));
      changed = true;
    }
    for (const id of known) {
      if (!activeIds.has(id)) {
        known.delete(id);
        changed = true;
      }
    }
    currentTemplates.forEach(template => {
      if (known.has(template.id)) return;
      // Only adopt a legacy child for a template that existed before this save.
      // A newly added template must never take ownership of a same-name personal child.
      const match = previousIds.has(template.id)
        ? items.find(item => !item.routineSubtaskId && item.title === template.title) : null;
      if (match) match.routineSubtaskId = template.id;
      else {
        items.push(...freshSubtasks([template], { fromRoutine: true }));
        added += 1;
      }
      known.add(template.id);
      changed = true;
    });
    return { todo: changed ? { ...todo, subtasks: items, routineSubtaskIds: Array.from(known) } : todo, added, removed, changed };
  }

  async function changeSubtask(kind, ownerId, change) {
    const storeName = kind === "routine" ? ROUTINE_STORE : TODO_STORE;
    return useStore(storeName, "readwrite", store => new Promise((resolve, reject) => {
      const request = store.get(ownerId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const owner = request.result;
        if (!owner) { reject(new Error("Parent not found")); return; }
        if (kind === "routine" && !owner.isDraft) { reject(new Error("Edit routine through draft")); return; }
        let items = normalizeSubtasks(owner.subtasks);
        if (change.action === "add") {
          const title = String(change.title || "").trim();
          if (!title) { reject(new Error("Title required")); return; }
          items.push({ id: createId("subtask"), title, done: false });
        } else {
          const item = items.find(item => item.id === change.id);
          if (!item) { reject(new Error("Subtask not found")); return; }
          if (change.action === "delete") items = items.filter(item => item.id !== change.id);
          else if (change.action === "title" && String(change.title || "").trim()) item.title = String(change.title).trim();
          else if (change.action === "done" && kind !== "routine") item.done = change.done === true;
          else { reject(new Error("Invalid subtask edit")); return; }
        }
        const updated = { ...owner, subtasks: items, updatedAt: new Date().toISOString() };
        store.put(updated);
        resolve(updated);
      };
    }));
  }

  async function getTodo(id) {
    return useStore(TODO_STORE, "readonly", (store) => requestToPromise(store.get(id)));
  }

  async function saveRoutineInputs(id, values) {
    await useStore(ROUTINE_INPUT_STORE, "readwrite", store => store.put({ id: id || "new", values }));
  }
  async function getRoutineInputs(id) {
    return useStore(ROUTINE_INPUT_STORE, "readonly", store => requestToPromise(store.get(id || "new")));
  }
  async function deleteRoutineInputs(id) {
    await useStore(ROUTINE_INPUT_STORE, "readwrite", store => store.delete(id || "new"));
  }

  async function deleteTodo(id) {
    await useStore(TODO_STORE, "readwrite", (store) => store.delete(id));
  }

  async function getNote(id) {
    return useStore(NOTE_STORE, "readonly", (store) => requestToPromise(store.get(id)));
  }

  async function getAllNotes() {
    const notes = await useStore(NOTE_STORE, "readonly", (store) => requestToPromise(store.getAll()));
    return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async function saveNote(note) {
    const now = new Date().toISOString();
    const savedNote = {
      id: note.id || createId("note"),
      title: note.title,
      body: note.body,
      date: note.date || now.slice(0, 10),
      createdAt: note.createdAt || now,
      updatedAt: now
    };

    await useStore(NOTE_STORE, "readwrite", (store) => store.put(savedNote));
    return savedNote;
  }

  async function deleteNote(id) {
    await useStore(NOTE_STORE, "readwrite", (store) => store.delete(id));
  }

  function normalizeRoutine(routine) {
    const now = new Date().toISOString();
    return {
      id: routine.id || createId("routine"),
      title: String(routine.title || "").trim(),
      category: String(routine.category || "その他").trim() || "その他",
      description: String(routine.description || ""),
      subtasks: normalizeSubtasks(routine.subtasks),
      isDraft: routine.isDraft === true,
      draftOf: typeof routine.draftOf === "string" ? routine.draftOf : "",
      repeatType: ["daily", "everyNDays", "weekly", "monthly", "manual"].includes(routine.repeatType) ? routine.repeatType : "daily",
      intervalDays: Number.isFinite(Number(routine.intervalDays)) ? Math.max(1, Number(routine.intervalDays)) : 1,
      daysOfWeek: Array.isArray(routine.daysOfWeek) ? routine.daysOfWeek.map(String) : [],
      dayOfMonth: Number.isFinite(Number(routine.dayOfMonth)) ? Math.min(31, Math.max(1, Number(routine.dayOfMonth))) : 1,
      startDate: typeof routine.startDate === "string" ? routine.startDate : "",
      endDate: typeof routine.endDate === "string" ? routine.endDate : "",
      lastDoneDate: typeof routine.lastDoneDate === "string" ? routine.lastDoneDate : "",
      nextDueDate: typeof routine.nextDueDate === "string" ? routine.nextDueDate : "",
      defaultTime: typeof routine.defaultTime === "string" ? routine.defaultTime : "",
      isActive: routine.isActive !== false,
      autoCreateTodo: routine.autoCreateTodo === true,
      excludedTodoDates: Array.isArray(routine.excludedTodoDates) ? routine.excludedTodoDates.map(String) : [],
      createdAt: routine.createdAt || now,
      updatedAt: now
    };
  }

  async function getAllRoutines(includeDrafts = false) {
    const routines = await useStore(ROUTINE_STORE, "readonly", (store) => requestToPromise(store.getAll()));
    return routines.filter(routine => includeDrafts || !routine.isDraft).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (!a.nextDueDate && b.nextDueDate) return 1;
      if (a.nextDueDate && !b.nextDueDate) return -1;
      return String(a.nextDueDate || "").localeCompare(String(b.nextDueDate || "")) || a.title.localeCompare(b.title);
    });
  }

  async function getRoutine(id) {
    return useStore(ROUTINE_STORE, "readonly", (store) => requestToPromise(store.get(id)));
  }

  async function saveRoutine(routine) {
    const savedRoutine = normalizeRoutine(routine);
    await useStore(ROUTINE_STORE, "readwrite", (store) => store.put(savedRoutine));
    return savedRoutine;
  }

  async function saveRoutineWithTodoChanges(routine, changes = {}) {
    const savedRoutine = normalizeRoutine(routine);
    const updates = Array.isArray(changes.updates) ? changes.updates : [];
    const deleteIds = Array.isArray(changes.deleteIds) ? changes.deleteIds : [];
    const additions = Array.isArray(changes.additions) ? changes.additions : [];
    const db = await openDB();
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ROUTINE_STORE, TODO_STORE], "readwrite");
      const routineStore = transaction.objectStore(ROUTINE_STORE);
      const todoStore = transaction.objectStore(TODO_STORE);
      const updatedTodos = updates.map((todo) => ({
        ...todo,
        updatedAt: now
      }));
      const addedTodos = additions.map((todo) => ({
        id: createId("todo"),
        date: String(todo.date || ""),
        title: String(todo.title || ""),
        details: typeof todo.details === "string" ? todo.details : "",
        subtasks: normalizeSubtasks(todo.subtasks),
        routineSubtaskIds: normalizeRoutineSubtaskIds(todo.routineSubtaskIds, todo.subtasks),
        status: "todo",
        time: String(todo.time || ""),
        isPriority: todo.isPriority === true,
        routineId: String(todo.routineId || ""),
        routineDate: String(todo.routineDate || todo.date || ""),
        createdByRoutine: todo.createdByRoutine === true,
        routineAutoGenerated: todo.routineAutoGenerated === true,
        createdAt: now,
        updatedAt: now
      }));

      let subtaskAddedCount = 0;
      let subtaskRemovedCount = 0;
      transaction.oncomplete = () => resolve({
        routine: savedRoutine,
        updatedTodos,
        addedTodos,
        subtaskAddedCount,
        subtaskRemovedCount,
        deletedCount: deleteIds.length
      });
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      let previousTemplates = [];
      const previousRoutineRequest = routineStore.get(savedRoutine.id);
      previousRoutineRequest.onsuccess = () => {
        previousTemplates = previousRoutineRequest.result?.subtasks || [];
      };
      routineStore.put(savedRoutine);
      if (changes.removeDraftId && changes.removeDraftId !== savedRoutine.id) routineStore.delete(changes.removeDraftId);
      deleteIds.forEach((id) => todoStore.delete(id));
      const existingRequest = todoStore.getAll();
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result;
        // Use the latest child edits inside this transaction, not a snapshot from the UI.
        updatedTodos.forEach(todo => {
          const index = existing.findIndex(item => item.id === todo.id);
          if (index < 0) return;
          const current = existing[index];
          const updated = {
            ...todo, subtasks: normalizeSubtasks(current.subtasks),
            routineSubtaskIds: normalizeRoutineSubtaskIds(current.routineSubtaskIds, current.subtasks)
          };
          existing[index] = updated;
          todoStore.put(updated);
        });
        if (typeof changes.syncSubtasksFromDate === "string" && changes.syncSubtasksFromDate) {
          existing.forEach((todo, index) => {
            if (todo.routineId !== savedRoutine.id || todo.status === "done"
              || !todo.date || todo.date < changes.syncSubtasksFromDate) return;
            const merged = mergeRoutineSubtasks(todo, savedRoutine.subtasks, previousTemplates);
            if (!merged.changed) return;
            const updated = { ...merged.todo, updatedAt: now };
            existing[index] = updated;
            todoStore.put(updated);
            subtaskAddedCount += merged.added;
            subtaskRemovedCount += merged.removed;
          });
        }
        addedTodos.forEach(todo => {
          if (todo.routineId && existing.some(item => item.routineId === todo.routineId && (item.routineDate || item.date) === todo.routineDate)) return;
          todoStore.add(todo);
          existing.push(todo);
        });
      };
    });
  }

  async function deleteRoutine(id) {
    await useStore(ROUTINE_STORE, "readwrite", (store) => store.delete(id));
  }

  async function getRoutineHistories(routineId) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(ROUTINE_HISTORY_STORE, "readonly");
      const index = transaction.objectStore(ROUTINE_HISTORY_STORE).index("routineId");
      const request = index.getAll(routineId);

      request.onsuccess = () => {
        const histories = request.result.sort((a, b) => b.doneDate.localeCompare(a.doneDate) || b.createdAt.localeCompare(a.createdAt));
        resolve(histories);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllRoutineHistories() {
    return useStore(ROUTINE_HISTORY_STORE, "readonly", (store) => requestToPromise(store.getAll()));
  }

  async function addRoutineHistory(routineId, doneDate, note = "") {
    const now = new Date().toISOString();
    const history = {
      id: createId("routine-history"),
      routineId,
      doneDate,
      note,
      createdAt: now
    };

    await useStore(ROUTINE_HISTORY_STORE, "readwrite", (store) => store.add(history));
    return history;
  }

  async function getBackupData() {
    const [todos, notes, routines, routineHistories, routineInputs] = await Promise.all([
      getAllTodos(),
      getAllNotes(),
      getAllRoutines(true),
      getAllRoutineHistories(),
      useStore(ROUTINE_INPUT_STORE, "readonly", store => requestToPromise(store.getAll()))
    ]);

    return {
      app: "今日メモTodo",
      version: 4,
      exportedAt: new Date().toISOString(),
      todos,
      notes,
      routines,
      routineHistories,
      routineInputs
    };
  }

  async function replaceAllData(backup) {
    const todos = Array.isArray(backup.todos) ? backup.todos : [];
    const notes = Array.isArray(backup.notes) ? backup.notes : [];
    const routines = Array.isArray(backup.routines) ? backup.routines : [];
    const routineHistories = Array.isArray(backup.routineHistories) ? backup.routineHistories : [];
    const routineInputs = Array.isArray(backup.routineInputs) ? backup.routineInputs : [];
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TODO_STORE, NOTE_STORE, ROUTINE_STORE, ROUTINE_HISTORY_STORE, ROUTINE_INPUT_STORE], "readwrite");
      const todoStore = transaction.objectStore(TODO_STORE);
      const noteStore = transaction.objectStore(NOTE_STORE);
      const routineStore = transaction.objectStore(ROUTINE_STORE);
      const routineHistoryStore = transaction.objectStore(ROUTINE_HISTORY_STORE);
      const inputStore = transaction.objectStore(ROUTINE_INPUT_STORE);
      const now = new Date().toISOString();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      todoStore.clear();
      noteStore.clear();
      routineStore.clear();
      routineHistoryStore.clear();
      inputStore.clear();
      routineInputs.forEach(input => { if (input && typeof input.id === 'string' && input.values && typeof input.values === 'object') inputStore.put({ id: input.id, values: input.values }); });

      todos.forEach((todo) => {
        if (todo && todo.id && todo.title) {
          todoStore.put({
            id: String(todo.id),
            date: typeof todo.date === "string" ? todo.date : "",
            title: String(todo.title),
            details: typeof todo.details === "string" ? todo.details : "",
            subtasks: normalizeSubtasks(todo.subtasks),
            routineSubtaskIds: normalizeRoutineSubtaskIds(todo.routineSubtaskIds, todo.subtasks),
            status: ["todo", "doing", "done"].includes(todo.status) ? todo.status : "todo",
            time: typeof todo.time === "string" ? todo.time : "",
            isPriority: todo.isPriority === true,
            routineId: typeof todo.routineId === "string" ? todo.routineId : "",
            routineDate: typeof todo.routineDate === "string" ? todo.routineDate : "",
            createdByRoutine: todo.createdByRoutine === true,
            ...(Object.prototype.hasOwnProperty.call(todo, "routineAutoGenerated")
              ? { routineAutoGenerated: todo.routineAutoGenerated === true }
              : {}),
            createdAt: todo.createdAt || now,
            updatedAt: todo.updatedAt || now
          });
        }
      });

      notes.forEach((note) => {
        if (note && note.id) {
          noteStore.put({
            id: String(note.id),
            title: String(note.title || "無題メモ"),
            body: String(note.body || ""),
            date: note.date || now.slice(0, 10),
            createdAt: note.createdAt || now,
            updatedAt: note.updatedAt || now
          });
        }
      });

      routines.forEach((routine) => {
        if (routine && routine.id && routine.title) {
          routineStore.put(normalizeRoutine(routine));
        }
      });

      routineHistories.forEach((history) => {
        if (history && history.id && history.routineId && history.doneDate) {
          routineHistoryStore.put({
            id: String(history.id),
            routineId: String(history.routineId),
            doneDate: String(history.doneDate),
            note: String(history.note || ""),
            createdAt: history.createdAt || now
          });
        }
      });
    });
  }

  window.TMTDB = {
    saveRoutineInputs,
    getRoutineInputs,
    deleteRoutineInputs,
    changeSubtask,
    freshSubtasks,
    normalizeSubtasks,
    addRoutineHistory,
    addTodo,
    deleteNote,
    deleteRoutine,
    deleteTodo,
    getAllNotes,
    getAllRoutineHistories,
    getAllRoutines,
    getAllTodos,
    getBackupData,
    getNote,
    getRoutine,
    getRoutineHistories,
    getTodo,
    getTodosByDate,
    getTodosByDateRange,
    getUndatedTodos,
    replaceAllData,
    saveNote,
    saveRoutine,
    saveRoutineWithTodoChanges,
    updateTodo
  };
})();
