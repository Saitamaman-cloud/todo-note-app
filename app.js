(function () {
  "use strict";

  const STATUS_LABELS = {
    todo: "未着手",
    doing: "対応中",
    done: "完了"
  };

  const STATUS_ORDER = ["todo", "doing", "done"];

  const state = {
    currentView: "home",
    selectedDate: getTodayString(),
    selectedTodoId: null,
    selectedTodo: null,
    editingNoteId: null,
    editingNote: null
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  // アプリ起動時にイベントと初期表示を準備する。
  function init() {
    cacheElements();
    bindEvents();
    elements.todoDate.value = state.selectedDate;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        showMessage("オフライン準備に失敗しました。通常利用はできます。", true);
      });
    }

    window.addEventListener("hashchange", handleRoute);
    handleRoute();
  }

  // よく使う画面要素をまとめて取得する。
  function cacheElements() {
    elements.message = document.getElementById("message");
    elements.views = document.querySelectorAll(".view");
    elements.navButtons = document.querySelectorAll("[data-go]");
    elements.homeDate = document.getElementById("home-date");
    elements.countTodo = document.getElementById("count-todo");
    elements.countDoing = document.getElementById("count-doing");
    elements.countDone = document.getElementById("count-done");
    elements.recentNotes = document.getElementById("recent-notes");
    elements.todoDate = document.getElementById("todo-date");
    elements.todoForm = document.getElementById("todo-form");
    elements.todoTitleInput = document.getElementById("todo-title-input");
    elements.todoList = document.getElementById("todo-list");
    elements.backToTodoList = document.getElementById("back-to-todo-list");
    elements.todoDetailTitle = document.getElementById("todo-detail-title");
    elements.todoDetailStatus = document.getElementById("todo-detail-status");
    elements.todoDetailBack = document.getElementById("todo-detail-back");
    elements.todoDetailNext = document.getElementById("todo-detail-next");
    elements.todoDetailDelete = document.getElementById("todo-detail-delete");
    elements.newNoteButton = document.getElementById("new-note-button");
    elements.noteSearch = document.getElementById("note-search");
    elements.noteList = document.getElementById("note-list");
    elements.backToNotes = document.getElementById("back-to-notes");
    elements.noteTitleInput = document.getElementById("note-title-input");
    elements.noteBodyInput = document.getElementById("note-body-input");
    elements.saveNoteButton = document.getElementById("save-note-button");
    elements.deleteNoteButton = document.getElementById("delete-note-button");
    elements.exportButton = document.getElementById("export-button");
    elements.importButton = document.getElementById("import-button");
    elements.importFile = document.getElementById("import-file");
  }

  // 画面操作のイベントを登録する。
  function bindEvents() {
    elements.navButtons.forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.go));
    });

    elements.todoDate.addEventListener("change", () => {
      state.selectedDate = elements.todoDate.value || getTodayString();
      renderTodo();
    });

    elements.todoForm.addEventListener("submit", handleAddTodo);
    elements.todoList.addEventListener("click", handleTodoOpen);
    elements.backToTodoList.addEventListener("click", () => navigate("todo"));
    elements.todoDetailBack.addEventListener("click", () => handleTodoDetailAction("back"));
    elements.todoDetailNext.addEventListener("click", () => handleTodoDetailAction("next"));
    elements.todoDetailDelete.addEventListener("click", () => handleTodoDetailAction("delete"));
    elements.newNoteButton.addEventListener("click", () => navigate("note-new"));
    elements.noteSearch.addEventListener("input", renderNotes);
    elements.noteList.addEventListener("click", handleNoteOpen);
    elements.backToNotes.addEventListener("click", () => navigate("notes"));
    elements.saveNoteButton.addEventListener("click", handleSaveNote);
    elements.deleteNoteButton.addEventListener("click", handleDeleteNote);
    elements.exportButton.addEventListener("click", exportBackup);
    elements.importButton.addEventListener("click", () => elements.importFile.click());
    elements.importFile.addEventListener("change", importBackup);
  }

  // ハッシュを見て表示する画面を決める。
  function handleRoute() {
    const route = location.hash.replace("#", "") || "home";

    if (route === "note-new") {
      state.editingNoteId = null;
      state.editingNote = null;
      showView("editor");
      loadEditor();
      return;
    }

    if (route.startsWith("note-")) {
      state.editingNoteId = route.replace("note-", "");
      showView("editor");
      loadEditor();
      return;
    }

    if (route.startsWith("todo-detail-")) {
      state.selectedTodoId = decodeURIComponent(route.replace("todo-detail-", ""));
      showView("todo-detail");
      loadTodoDetail();
      return;
    }

    showView(["home", "todo", "notes", "settings"].includes(route) ? route : "home");
  }

  // 指定の画面だけを表示する。
  function showView(viewName) {
    state.currentView = viewName;

    elements.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${viewName}`);
    });

    const activeNav = viewName === "todo-detail" ? "todo" : viewName;

    document.querySelectorAll(".nav-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.go === activeNav);
    });

    if (viewName === "home") renderHome();
    if (viewName === "todo") renderTodo();
    if (viewName === "notes") renderNotes();
  }

  // ハッシュを書き換えて画面遷移する。
  function navigate(viewName) {
    const hash = `#${viewName}`;

    if (location.hash === hash) {
      handleRoute();
      return;
    }

    location.hash = hash;
  }

  // ホーム画面の件数と最近のメモを表示する。
  async function renderHome() {
    try {
      const today = getTodayString();
      const [todos, notes] = await Promise.all([
        window.TMTDB.getTodosByDate(today),
        window.TMTDB.getAllNotes()
      ]);

      elements.homeDate.textContent = formatDate(today);
      elements.countTodo.textContent = todos.filter((todo) => todo.status === "todo").length;
      elements.countDoing.textContent = todos.filter((todo) => todo.status === "doing").length;
      elements.countDone.textContent = todos.filter((todo) => todo.status === "done").length;
      renderRecentNotes(notes.slice(0, 4));
    } catch (error) {
      showMessage("ホーム画面の読み込みに失敗しました。", true);
    }
  }

  // 最近のメモをホームに表示する。
  function renderRecentNotes(notes) {
    elements.recentNotes.innerHTML = "";

    if (!notes.length) {
      elements.recentNotes.append(createEmptyState("まだメモがありません。"));
      return;
    }

    notes.forEach((note) => {
      elements.recentNotes.append(createNoteButton(note));
    });
  }

  // ToDo画面を表示する。
  async function renderTodo() {
    try {
      elements.todoDate.value = state.selectedDate;
      const todos = await window.TMTDB.getTodosByDate(state.selectedDate);
      const orderedTodos = todos.sort((a, b) => {
        const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        return statusDiff || a.createdAt.localeCompare(b.createdAt);
      });

      elements.todoList.innerHTML = "";

      if (!orderedTodos.length) {
        elements.todoList.append(createEmptyState("この日のToDoはまだありません。"));
        return;
      }

      orderedTodos.forEach((todo) => elements.todoList.append(createTodoItem(todo)));
    } catch (error) {
      showMessage("ToDoの読み込みに失敗しました。", true);
    }
  }

  // ToDoの追加を処理する。
  async function handleAddTodo(event) {
    event.preventDefault();
    const title = elements.todoTitleInput.value.trim();

    if (!title) {
      showMessage("ToDoの内容を入力してください。", true);
      return;
    }

    try {
      await window.TMTDB.addTodo(title, state.selectedDate);
      elements.todoTitleInput.value = "";
      showMessage("ToDoを追加しました。");
      renderTodo();
      renderHome();
    } catch (error) {
      showMessage("ToDoの追加に失敗しました。", true);
    }
  }

  // ToDo一覧のタップで詳細画面へ移動する。
  function handleTodoOpen(event) {
    const row = event.target.closest("[data-todo-id]");

    if (!row) {
      return;
    }

    navigate(`todo-detail-${encodeURIComponent(row.dataset.todoId)}`);
  }

  // ToDo詳細画面を表示する。
  async function loadTodoDetail() {
    try {
      const todo = await window.TMTDB.getTodo(state.selectedTodoId);

      if (!todo) {
        showMessage("ToDoが見つかりません。", true);
        navigate("todo");
        return;
      }

      state.selectedTodo = todo;
      state.selectedDate = todo.date;
      elements.todoDate.value = todo.date;
      renderTodoDetail(todo);
    } catch (error) {
      showMessage("ToDo詳細の読み込みに失敗しました。", true);
    }
  }

  // ToDo詳細画面の内容を反映する。
  function renderTodoDetail(todo) {
    elements.todoDetailTitle.textContent = todo.title;
    elements.todoDetailStatus.textContent = STATUS_LABELS[todo.status] || STATUS_LABELS.todo;
    elements.todoDetailStatus.className = `status-badge status-${todo.status}`;
    elements.todoDetailBack.disabled = todo.status === "todo";
    elements.todoDetailNext.disabled = todo.status === "done";
    elements.todoDetailNext.textContent = todo.status === "done" ? "完了済" : "進める";
  }

  // ToDo詳細画面のボタン操作を処理する。
  async function handleTodoDetailAction(action) {
    if (!state.selectedTodo) {
      return;
    }

    try {
      if (action === "delete") {
        if (confirm("このToDoを削除しますか？")) {
          await window.TMTDB.deleteTodo(state.selectedTodo.id);
          showMessage("ToDoを削除しました。");
          state.selectedTodo = null;
          state.selectedTodoId = null;
          navigate("todo");
        }
      } else {
        const nextStatus = getNextStatus(state.selectedTodo.status, action);

        if (nextStatus) {
          state.selectedTodo = await window.TMTDB.updateTodo({ ...state.selectedTodo, status: nextStatus });
          renderTodoDetail(state.selectedTodo);
          showMessage("ステータスを変更しました。");
        }
      }

      renderHome();
    } catch (error) {
      showMessage("ToDoの更新に失敗しました。", true);
    }
  }

  // ToDoを一覧用のコンパクトな行として作る。
  function createTodoItem(todo) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `todo-row ${todo.status === "done" ? "is-done" : ""}`;
    button.dataset.todoId = todo.id;

    const title = document.createElement("span");
    title.className = "todo-row-title";
    title.textContent = todo.title;

    const badge = document.createElement("span");
    badge.className = `status-badge status-${todo.status}`;
    badge.textContent = STATUS_LABELS[todo.status] || STATUS_LABELS.todo;

    button.append(title, badge);
    return button;
  }

  // ステータス変更後の値を返す。
  function getNextStatus(status, action) {
    const index = STATUS_ORDER.indexOf(status);

    if (action === "next" && index < STATUS_ORDER.length - 1) {
      return STATUS_ORDER[index + 1];
    }

    if (action === "back" && index > 0) {
      return STATUS_ORDER[index - 1];
    }

    return null;
  }

  // メモ一覧を検索条件つきで表示する。
  async function renderNotes() {
    try {
      const keyword = elements.noteSearch.value.trim().toLowerCase();
      const notes = await window.TMTDB.getAllNotes();
      const filteredNotes = keyword
        ? notes.filter((note) => `${note.title}\n${note.body}`.toLowerCase().includes(keyword))
        : notes;

      elements.noteList.innerHTML = "";

      if (!filteredNotes.length) {
        elements.noteList.append(createEmptyState(keyword ? "一致するメモはありません。" : "まだメモがありません。"));
        return;
      }

      filteredNotes.forEach((note) => elements.noteList.append(createNoteButton(note)));
    } catch (error) {
      showMessage("メモ一覧の読み込みに失敗しました。", true);
    }
  }

  // メモ一覧のタップで編集画面へ移動する。
  function handleNoteOpen(event) {
    const button = event.target.closest("button[data-note-id]");

    if (button) {
      navigate(`note-${button.dataset.noteId}`);
    }
  }

  // メモを開いて編集画面に反映する。
  async function loadEditor() {
    try {
      if (!state.editingNoteId) {
        state.editingNote = null;
        elements.noteTitleInput.value = "";
        elements.noteBodyInput.value = "";
        elements.deleteNoteButton.disabled = true;
        return;
      }

      const note = await window.TMTDB.getNote(state.editingNoteId);

      if (!note) {
        showMessage("メモが見つかりません。", true);
        navigate("notes");
        return;
      }

      state.editingNote = note;
      elements.noteTitleInput.value = note.title;
      elements.noteBodyInput.value = note.body;
      elements.deleteNoteButton.disabled = false;
    } catch (error) {
      showMessage("メモの読み込みに失敗しました。", true);
    }
  }

  // 編集中のメモを保存する。
  async function handleSaveNote() {
    const title = elements.noteTitleInput.value.trim() || createTitleFromBody(elements.noteBodyInput.value);
    const body = elements.noteBodyInput.value;

    try {
      const savedNote = await window.TMTDB.saveNote({
        ...state.editingNote,
        title,
        body
      });

      state.editingNote = savedNote;
      state.editingNoteId = savedNote.id;
      elements.deleteNoteButton.disabled = false;
      showMessage("メモを保存しました。");
      navigate(`note-${savedNote.id}`);
    } catch (error) {
      showMessage("メモの保存に失敗しました。", true);
    }
  }

  // 編集中のメモを削除する。
  async function handleDeleteNote() {
    if (!state.editingNoteId) {
      return;
    }

    if (!confirm("このメモを削除しますか？")) {
      return;
    }

    try {
      await window.TMTDB.deleteNote(state.editingNoteId);
      state.editingNoteId = null;
      state.editingNote = null;
      showMessage("メモを削除しました。");
      navigate("notes");
    } catch (error) {
      showMessage("メモの削除に失敗しました。", true);
    }
  }

  // メモ一覧用のカードを作る。
  function createNoteButton(note) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-item";
    button.dataset.noteId = note.id;

    const title = document.createElement("span");
    title.className = "note-title";
    title.textContent = note.title || "無題メモ";

    const meta = document.createElement("span");
    meta.className = "note-meta";
    meta.textContent = `更新: ${formatDateTime(note.updatedAt)}`;

    const preview = document.createElement("p");
    preview.className = "note-preview";
    preview.textContent = note.body || "本文なし";

    button.append(title, meta, preview);
    return button;
  }

  // バックアップJSONをファイルとして保存する。
  async function exportBackup() {
    try {
      const backup = await window.TMTDB.getBackupData();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `today-memo-todo-backup-${getCompactDate()}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showMessage("バックアップを出力しました。");
    } catch (error) {
      showMessage("バックアップ出力に失敗しました。", true);
    }
  }

  // バックアップJSONを読み込み、確認後に復元する。
  function importBackup() {
    const file = elements.importFile.files[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const backup = JSON.parse(reader.result);

        if (!backup || !Array.isArray(backup.todos) || !Array.isArray(backup.notes)) {
          throw new Error("Invalid backup");
        }

        const ok = confirm("現在のデータをすべて削除し、バックアップ内容に置き換えます。よろしいですか？");

        if (!ok) {
          return;
        }

        await window.TMTDB.replaceAllData(backup);
        showMessage("バックアップを復元しました。");
        renderHome();
        renderTodo();
        renderNotes();
      } catch (error) {
        showMessage("バックアップ復元に失敗しました。JSONファイルを確認してください。", true);
      } finally {
        elements.importFile.value = "";
      }
    };

    reader.onerror = () => {
      showMessage("ファイルの読み込みに失敗しました。", true);
      elements.importFile.value = "";
    };

    reader.readAsText(file);
  }

  // 空の一覧に表示するメッセージを作る。
  function createEmptyState(text) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent = text;
    return div;
  }

  // 本文から自動タイトルを作る。
  function createTitleFromBody(body) {
    const firstLine = body.trim().split(/\r?\n/).find(Boolean);
    return firstLine ? firstLine.slice(0, 30) : "無題メモ";
  }

  // 画面上部に短いメッセージを出す。
  function showMessage(text, isError) {
    elements.message.textContent = text;
    elements.message.hidden = false;
    elements.message.classList.toggle("is-error", Boolean(isError));

    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => {
      elements.message.hidden = true;
    }, 3200);
  }

  // 今日の日付をYYYY-MM-DDで返す。
  function getTodayString() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // ファイル名向けの日付をYYYYMMDDで返す。
  function getCompactDate() {
    return getTodayString().replaceAll("-", "");
  }

  // YYYY-MM-DDを日本語表示にする。
  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(date);
  }

  // ISO日時を短い日本語表示にする。
  function formatDateTime(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }
})();
