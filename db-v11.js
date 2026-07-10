(function () {
  "use strict";

  const DB_NAME = "today-memo-todo-db";
  const DB_VERSION = 2;
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

      request.onsuccess = () => resolve(request.result);
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

  async function addTodo(title, date, time = "", options = {}) {
    const now = new Date().toISOString();
    const todo = {
      id: createId("todo"),
      date,
      title,
      status: "todo",
      time,
      routineId: options.routineId || "",
      routineDate: options.routineDate || "",
      createdByRoutine: options.createdByRoutine === true,
      createdAt: now,
      updatedAt: now
    };

    await useStore(TODO_STORE, "readwrite", (store) => store.add(todo));
    return todo;
  }

  async function updateTodo(todo) {
    const nextTodo = {
      ...todo,
      updatedAt: new Date().toISOString()
    };

    await useStore(TODO_STORE, "readwrite", (store) => store.put(nextTodo));
    return nextTodo;
  }

  async function getTodo(id) {
    return useStore(TODO_STORE, "readonly", (store) => requestToPromise(store.get(id)));
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

  async function getAllRoutines() {
    const routines = await useStore(ROUTINE_STORE, "readonly", (store) => requestToPromise(store.getAll()));
    return routines.sort((a, b) => {
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
    const [todos, notes, routines, routineHistories] = await Promise.all([
      getAllTodos(),
      getAllNotes(),
      getAllRoutines(),
      getAllRoutineHistories()
    ]);

    return {
      app: "今日メモTodo",
      version: 2,
      exportedAt: new Date().toISOString(),
      todos,
      notes,
      routines,
      routineHistories
    };
  }

  async function replaceAllData(backup) {
    const todos = Array.isArray(backup.todos) ? backup.todos : [];
    const notes = Array.isArray(backup.notes) ? backup.notes : [];
    const routines = Array.isArray(backup.routines) ? backup.routines : [];
    const routineHistories = Array.isArray(backup.routineHistories) ? backup.routineHistories : [];
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TODO_STORE, NOTE_STORE, ROUTINE_STORE, ROUTINE_HISTORY_STORE], "readwrite");
      const todoStore = transaction.objectStore(TODO_STORE);
      const noteStore = transaction.objectStore(NOTE_STORE);
      const routineStore = transaction.objectStore(ROUTINE_STORE);
      const routineHistoryStore = transaction.objectStore(ROUTINE_HISTORY_STORE);
      const now = new Date().toISOString();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      todoStore.clear();
      noteStore.clear();
      routineStore.clear();
      routineHistoryStore.clear();

      todos.forEach((todo) => {
        if (todo && todo.id && todo.date && todo.title) {
          todoStore.put({
            id: String(todo.id),
            date: String(todo.date),
            title: String(todo.title),
            status: ["todo", "doing", "done"].includes(todo.status) ? todo.status : "todo",
            time: typeof todo.time === "string" ? todo.time : "",
            routineId: typeof todo.routineId === "string" ? todo.routineId : "",
            routineDate: typeof todo.routineDate === "string" ? todo.routineDate : "",
            createdByRoutine: todo.createdByRoutine === true,
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
    replaceAllData,
    saveNote,
    saveRoutine,
    updateTodo
  };
})();
