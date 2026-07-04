(function () {
  "use strict";

  const DB_NAME = "today-memo-todo-db";
  const DB_VERSION = 1;
  const TODO_STORE = "todos";
  const NOTE_STORE = "notes";

  let dbPromise;

  // IndexedDBを開き、初回だけ保存場所を作る。
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
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  // 短く衝突しにくいIDを作る。
  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // オブジェクトストアを使う共通処理。
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

  // リクエストの完了をPromiseで待つ。
  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 指定日のToDoを新しい順で取得する。
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

  // すべてのToDoを取得する。
  async function getAllTodos() {
    return useStore(TODO_STORE, "readonly", (store) => requestToPromise(store.getAll()));
  }

  // ToDoを追加する。
  async function addTodo(title, date, time = "") {
    const now = new Date().toISOString();
    const todo = {
      id: createId("todo"),
      date,
      title,
      status: "todo",
      time,
      createdAt: now,
      updatedAt: now
    };

    await useStore(TODO_STORE, "readwrite", (store) => store.add(todo));
    return todo;
  }

  // ToDoを更新する。
  async function updateTodo(todo) {
    const nextTodo = {
      ...todo,
      updatedAt: new Date().toISOString()
    };

    await useStore(TODO_STORE, "readwrite", (store) => store.put(nextTodo));
    return nextTodo;
  }

  // ToDoを1件取得する。
  async function getTodo(id) {
    return useStore(TODO_STORE, "readonly", (store) => requestToPromise(store.get(id)));
  }

  // ToDoを削除する。
  async function deleteTodo(id) {
    await useStore(TODO_STORE, "readwrite", (store) => store.delete(id));
  }

  // メモを1件取得する。
  async function getNote(id) {
    return useStore(NOTE_STORE, "readonly", (store) => requestToPromise(store.get(id)));
  }

  // すべてのメモを更新日が新しい順で取得する。
  async function getAllNotes() {
    const notes = await useStore(NOTE_STORE, "readonly", (store) => requestToPromise(store.getAll()));
    return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  // メモを新規作成または更新する。
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

  // メモを削除する。
  async function deleteNote(id) {
    await useStore(NOTE_STORE, "readwrite", (store) => store.delete(id));
  }

  // バックアップ用に全データをまとめて取得する。
  async function getBackupData() {
    const [todos, notes] = await Promise.all([getAllTodos(), getAllNotes()]);

    return {
      app: "今日メモTodo",
      version: 1,
      exportedAt: new Date().toISOString(),
      todos,
      notes
    };
  }

  // バックアップ内容で既存データを置き換える。
  async function replaceAllData(backup) {
    const todos = Array.isArray(backup.todos) ? backup.todos : [];
    const notes = Array.isArray(backup.notes) ? backup.notes : [];
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TODO_STORE, NOTE_STORE], "readwrite");
      const todoStore = transaction.objectStore(TODO_STORE);
      const noteStore = transaction.objectStore(NOTE_STORE);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      todoStore.clear();
      noteStore.clear();

      todos.forEach((todo) => {
        if (todo && todo.id && todo.date && todo.title) {
          todoStore.put({
            id: String(todo.id),
            date: String(todo.date),
            title: String(todo.title),
            status: ["todo", "doing", "done"].includes(todo.status) ? todo.status : "todo",
            time: typeof todo.time === "string" ? todo.time : "",
            createdAt: todo.createdAt || new Date().toISOString(),
            updatedAt: todo.updatedAt || new Date().toISOString()
          });
        }
      });

      notes.forEach((note) => {
        if (note && note.id) {
          noteStore.put({
            id: String(note.id),
            title: String(note.title || "無題メモ"),
            body: String(note.body || ""),
            date: note.date || new Date().toISOString().slice(0, 10),
            createdAt: note.createdAt || new Date().toISOString(),
            updatedAt: note.updatedAt || new Date().toISOString()
          });
        }
      });
    });
  }

  window.TMTDB = {
    addTodo,
    deleteNote,
    deleteTodo,
    getAllNotes,
    getBackupData,
    getNote,
    getTodo,
    getTodosByDate,
    replaceAllData,
    saveNote,
    updateTodo
  };
})();
