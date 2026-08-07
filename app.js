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
    isEditingTodo: false,
    isTodoSelectMode: false,
    selectedTodoIds: new Set(),
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1,
    editingNoteId: null,
    editingNote: null
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  // アプリ起動時にイベントと初期表示を準備する。
  function init() {
    cacheElements();
    bindEvents();
    setSelectedDate(state.selectedDate);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").then((registration) => {
        registration.update();
      }).catch(() => {
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
    elements.todoAddDateInput = document.getElementById("todo-add-date-input");
    elements.todoTimeInput = document.getElementById("todo-time-input");
    elements.todoTitleInput = document.getElementById("todo-title-input");
    elements.todoSelectMode = document.getElementById("todo-select-mode");
    elements.todoStartAll = document.getElementById("todo-start-all");
    elements.todoSelectPanel = document.getElementById("todo-select-panel");
    elements.todoSelectedCount = document.getElementById("todo-selected-count");
    elements.todoDeleteSelected = document.getElementById("todo-delete-selected");
    elements.todoSelectCancel = document.getElementById("todo-select-cancel");
    elements.todoList = document.getElementById("todo-list");
    elements.backToTodoList = document.getElementById("back-to-todo-list");
    elements.todoDetailHeading = document.getElementById("todo-detail-heading");
    elements.todoDetailDisplay = document.getElementById("todo-detail-display");
    elements.todoDetailTitle = document.getElementById("todo-detail-title");
    elements.todoDetailDate = document.getElementById("todo-detail-date");
    elements.todoDetailTime = document.getElementById("todo-detail-time");
    elements.todoDetailStatus = document.getElementById("todo-detail-status");
    elements.todoDetailEdit = document.getElementById("todo-detail-edit");
    elements.todoDetailBack = document.getElementById("todo-detail-back");
    elements.todoDetailNext = document.getElementById("todo-detail-next");
    elements.todoDetailDelete = document.getElementById("todo-detail-delete");
    elements.todoEditPanel = document.getElementById("todo-edit-panel");
    elements.todoEditDateInput = document.getElementById("todo-edit-date-input");
    elements.todoEditTimeInput = document.getElementById("todo-edit-time-input");
    elements.todoEditTitleInput = document.getElementById("todo-edit-title-input");
    elements.todoEditSave = document.getElementById("todo-edit-save");
    elements.todoEditCancel = document.getElementById("todo-edit-cancel");
    elements.calendarPrev = document.getElementById("calendar-prev");
    elements.calendarToday = document.getElementById("calendar-today");
    elements.calendarNext = document.getElementById("calendar-next");
    elements.calendarMonthLabel = document.getElementById("calendar-month-label");
    elements.calendarGrid = document.getElementById("calendar-grid");
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
      setSelectedDate(elements.todoDate.value || getTodayString());
      renderTodo();
    });

    elements.todoForm.addEventListener("submit", handleAddTodo);
    elements.todoSelectMode.addEventListener("click", enterTodoSelectMode);
    elements.todoStartAll.addEventListener("click", startAllTodoItems);
    elements.todoDeleteSelected.addEventListener("click", deleteSelectedTodos);
    elements.todoSelectCancel.addEventListener("click", () => {
      clearTodoSelection();
      renderTodo();
    });
    elements.todoList.addEventListener("click", handleTodoOpen);
    elements.backToTodoList.addEventListener("click", () => navigate("todo"));
    elements.todoDetailEdit.addEventListener("click", startTodoEdit);
    elements.todoDetailBack.addEventListener("click", () => handleTodoDetailAction("back"));
    elements.todoDetailNext.addEventListener("click", () => handleTodoDetailAction("next"));
    elements.todoDetailDelete.addEventListener("click", () => handleTodoDetailAction("delete"));
    elements.todoEditSave.addEventListener("click", saveTodoEdit);
    elements.todoEditCancel.addEventListener("click", cancelTodoEdit);
    elements.calendarPrev.addEventListener("click", () => moveCalendarMonth(-1));
    elements.calendarToday.addEventListener("click", showCurrentCalendarMonth);
    elements.calendarNext.addEventListener("click", () => moveCalendarMonth(1));
    elements.calendarGrid.addEventListener("click", handleCalendarDateClick);
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
      state.isEditingTodo = false;
      showView("todo-detail");
      loadTodoDetail();
      return;
    }

    showView(["home", "todo", "calendar", "notes", "settings"].includes(route) ? route : "home");
  }

  // 指定の画面だけを表示する。
  function showView(viewName) {
    if (viewName !== "todo") {
      clearTodoSelection();
    }

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
    if (viewName === "calendar") renderCalendar();
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

  // ToDo画面で使う選択日と日付入力欄をまとめて同期する。
  function setSelectedDate(date) {
    const nextDate = date || getTodayString();

    if (state.selectedDate && state.selectedDate !== nextDate) {
      clearTodoSelection();
    }

    state.selectedDate = nextDate;

    if (elements.todoDate) {
      elements.todoDate.value = nextDate;
    }

    if (elements.todoAddDateInput) {
      elements.todoAddDateInput.value = nextDate;
    }
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
      setSelectedDate(state.selectedDate);
      const todos = await window.TMTDB.getTodosByDate(state.selectedDate);
      const orderedTodos = todos.sort(compareTodosByTime);

      elements.todoList.innerHTML = "";
      syncSelectedTodoIds(orderedTodos);
      renderTodoBulkControls(orderedTodos);

      if (!orderedTodos.length) {
        elements.todoList.append(createEmptyState("この日のToDoはまだありません。"));
        return;
      }

      orderedTodos.forEach((todo) => elements.todoList.append(createTodoItem(todo)));
    } catch (error) {
      showMessage("ToDoの読み込みに失敗しました。", true);
    }
  }

  // カレンダー画面を表示する。
  async function renderCalendar() {
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const startDate = buildDateString(year, month, 1);
    const endDate = buildDateString(year, month, getDaysInMonth(year, month));

    try {
      const todos = await window.TMTDB.getTodosByDateRange(startDate, endDate);
      const counts = countTodosByDate(todos);
      const today = getTodayString();
      const selectedDate = state.selectedDate;
      const firstWeekday = new Date(year, month - 1, 1).getDay();
      const daysInMonth = getDaysInMonth(year, month);

      elements.calendarMonthLabel.textContent = `${year}年${month}月`;
      elements.calendarGrid.innerHTML = "";

      for (let i = 0; i < firstWeekday; i += 1) {
        const empty = document.createElement("div");
        empty.className = "calendar-day is-empty";
        elements.calendarGrid.append(empty);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = buildDateString(year, month, day);
        const count = counts.get(date) || 0;
        elements.calendarGrid.append(createCalendarDay(date, day, count, date === today, date === selectedDate));
      }
    } catch (error) {
      showMessage("カレンダーの読み込みに失敗しました。", true);
    }
  }

  // カレンダーの日付セルを作る。
  function createCalendarDay(date, day, count, isToday, isSelected) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.calendarDate = date;
    button.setAttribute("aria-label", `${date} ${count ? `${count}件のToDo` : "ToDoなし"}`);

    if (count > 0) {
      button.classList.add("has-todos");
    }

    if (isToday) {
      button.classList.add("is-today");
    }

    if (isSelected) {
      button.classList.add("is-selected");
    }

    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = day;
    button.append(dayNumber);

    if (count > 0) {
      const countLabel = document.createElement("span");
      countLabel.className = "calendar-count";
      countLabel.textContent = `${count}件`;
      button.append(countLabel);
    }

    return button;
  }

  // カレンダーの日付をタップしたら、その日のToDo画面へ移動する。
  function handleCalendarDateClick(event) {
    const day = event.target.closest("[data-calendar-date]");

    if (!day) {
      return;
    }

    setSelectedDate(day.dataset.calendarDate);
    navigate("todo");
  }

  // カレンダー表示月を前後に動かす。
  function moveCalendarMonth(amount) {
    const date = new Date(state.calendarYear, state.calendarMonth - 1 + amount, 1);
    state.calendarYear = date.getFullYear();
    state.calendarMonth = date.getMonth() + 1;
    renderCalendar();
  }

  // カレンダー表示月を今月へ戻す。
  function showCurrentCalendarMonth() {
    const today = new Date();
    state.calendarYear = today.getFullYear();
    state.calendarMonth = today.getMonth() + 1;
    renderCalendar();
  }

  // ToDo配列を日付ごとの件数にまとめる。
  function countTodosByDate(todos) {
    return todos.reduce((counts, todo) => {
      const date = todo.date || getTodayString();
      counts.set(date, (counts.get(date) || 0) + 1);
      return counts;
    }, new Map());
  }

  // ToDoの追加を処理する。
  async function handleAddTodo(event) {
    event.preventDefault();
    const title = elements.todoTitleInput.value.trim();
    const date = elements.todoAddDateInput.value || state.selectedDate;
    const time = elements.todoTimeInput.value || "";

    if (!date) {
      showMessage("日付を入力してください。", true);
      return;
    }

    if (!title) {
      showMessage("ToDoの内容を入力してください。", true);
      return;
    }

    try {
      await window.TMTDB.addTodo(title, date, time);
      setSelectedDate(date);
      clearTodoSelection();
      elements.todoTitleInput.value = "";
      elements.todoTimeInput.value = "";
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

    if (!row || !row.dataset.todoId) {
      return;
    }

    const todoId = row.dataset.todoId;

    if (state.isTodoSelectMode) {
      event.preventDefault();
      toggleSelectedTodo(todoId);
      renderTodo();
      return;
    }

    navigate(`todo-detail-${encodeURIComponent(todoId)}`);
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
      setSelectedDate(todo.date);
      renderTodoDetail(todo, state.isEditingTodo);
    } catch (error) {
      showMessage("ToDo詳細の読み込みに失敗しました。", true);
    }
  }

  // ToDo詳細画面の内容を反映する。
  function renderTodoDetail(todo, isEditing = false) {
    state.isEditingTodo = isEditing;
    elements.todoDetailHeading.textContent = isEditing ? "ToDo編集" : "ToDoを確認";
    elements.todoDetailDisplay.hidden = isEditing;
    elements.todoEditPanel.hidden = !isEditing;

    const todoDate = todo.date || state.selectedDate || getTodayString();
    elements.todoDetailTitle.textContent = todo.title;
    elements.todoDetailDate.textContent = todoDate;
    elements.todoDetailTime.textContent = formatTodoTime(todo.time);
    elements.todoDetailStatus.textContent = STATUS_LABELS[todo.status] || STATUS_LABELS.todo;
    elements.todoDetailStatus.className = `status-badge status-${todo.status}`;
    elements.todoDetailBack.disabled = todo.status === "todo";
    elements.todoDetailNext.disabled = todo.status === "done";
    elements.todoDetailNext.textContent = todo.status === "done" ? "完了済" : "進める";

    if (isEditing) {
      elements.todoEditDateInput.value = todoDate;
      elements.todoEditTimeInput.value = todo.time || "";
      elements.todoEditTitleInput.value = todo.title;
      elements.todoEditTitleInput.focus();
    }
  }

  // ToDo詳細画面のボタン操作を処理する。
  async function handleTodoDetailAction(action) {
    if (!state.selectedTodo || state.isEditingTodo) {
      return;
    }

    try {
      if (action === "delete") {
        if (confirm("このToDoを削除しますか？")) {
          await window.TMTDB.deleteTodo(state.selectedTodo.id);
          showMessage("ToDoを削除しました。");
          state.selectedTodo = null;
          state.selectedTodoId = null;
          clearTodoSelection();
          navigate("todo");
        }
      } else {
        const nextStatus = getNextStatus(state.selectedTodo.status, action);

        if (nextStatus) {
          state.selectedTodo = await window.TMTDB.updateTodo({ ...state.selectedTodo, status: nextStatus });
          renderTodoDetail(state.selectedTodo, false);
          showMessage("ステータスを変更しました。");
        }
      }

      renderHome();
    } catch (error) {
      showMessage("ToDoの更新に失敗しました。", true);
    }
  }

  // ToDo詳細画面を編集モードに切り替える。
  function startTodoEdit() {
    if (!state.selectedTodo) {
      return;
    }

    renderTodoDetail(state.selectedTodo, true);
  }

  // ToDo編集を保存する。
  async function saveTodoEdit() {
    if (!state.selectedTodo) {
      return;
    }

    const title = elements.todoEditTitleInput.value.trim();
    const date = elements.todoEditDateInput.value || "";
    const time = elements.todoEditTimeInput.value || "";

    if (!date) {
      showMessage("日付を入力してください。", true);
      return;
    }

    if (!title) {
      showMessage("ToDoの内容を入力してください。", true);
      return;
    }

    try {
      state.selectedTodo = await window.TMTDB.updateTodo({ ...state.selectedTodo, date, title, time });
      setSelectedDate(state.selectedTodo.date);
      renderTodo();
      renderTodoDetail(state.selectedTodo, false);
      showMessage("ToDoを保存しました。");
      renderHome();
    } catch (error) {
      showMessage("ToDoの保存に失敗しました。", true);
    }
  }

  // ToDo編集を取り消して詳細表示に戻す。
  function cancelTodoEdit() {
    if (!state.selectedTodo) {
      return;
    }

    renderTodoDetail(state.selectedTodo, false);
  }

  // ToDoを一覧用のコンパクトな行として作る。
  function createTodoItem(todo) {
    const row = state.isTodoSelectMode ? document.createElement("label") : document.createElement("button");
    row.className = `todo-row ${state.isTodoSelectMode ? "is-selectable" : ""} ${todo.status === "done" ? "is-done" : ""}`;
    row.dataset.todoId = todo.id;

    if (!state.isTodoSelectMode) {
      row.type = "button";
    }

    if (state.isTodoSelectMode) {
      const checkbox = document.createElement("input");
      checkbox.className = "todo-row-check";
      checkbox.type = "checkbox";
      checkbox.checked = state.selectedTodoIds.has(todo.id);
      checkbox.setAttribute("aria-label", `${todo.title}を選択`);
      row.append(checkbox);
    }

    const time = document.createElement("span");
    time.className = "todo-row-time";
    time.textContent = formatTodoTime(todo.time);

    const title = document.createElement("span");
    title.className = "todo-row-title";
    title.textContent = todo.title;

    const badge = document.createElement("span");
    badge.className = `status-badge status-${todo.status}`;
    badge.textContent = STATUS_LABELS[todo.status] || STATUS_LABELS.todo;

    row.append(time, title, badge);
    return row;
  }

  // 一括操作エリアの表示状態を更新する。
  function renderTodoBulkControls(todos) {
    const todoCount = todos.length;
    const todoStatusCount = todos.filter((todo) => todo.status === "todo").length;
    const selectedCount = state.selectedTodoIds.size;

    elements.todoSelectPanel.hidden = !state.isTodoSelectMode;
    elements.todoSelectMode.disabled = !todoCount || state.isTodoSelectMode;
    elements.todoStartAll.disabled = state.isTodoSelectMode || !todoStatusCount;
    elements.todoDeleteSelected.disabled = !selectedCount;
    elements.todoSelectedCount.textContent = `選択 ${selectedCount}件`;
  }

  // 選択モードを開始する。
  function enterTodoSelectMode() {
    state.isTodoSelectMode = true;
    state.selectedTodoIds.clear();
    renderTodo();
  }

  // 選択中のToDoを切り替える。
  function toggleSelectedTodo(todoId) {
    if (state.selectedTodoIds.has(todoId)) {
      state.selectedTodoIds.delete(todoId);
      return;
    }

    state.selectedTodoIds.add(todoId);
  }

  // 選択状態を解除する。
  function clearTodoSelection() {
    state.isTodoSelectMode = false;
    state.selectedTodoIds.clear();
  }

  // 表示中の日付に存在しない選択IDを取り除く。
  function syncSelectedTodoIds(todos) {
    const visibleIds = new Set(todos.map((todo) => todo.id));
    state.selectedTodoIds.forEach((id) => {
      if (!visibleIds.has(id)) {
        state.selectedTodoIds.delete(id);
      }
    });
  }

  // 選択したToDoをまとめて削除する。
  async function deleteSelectedTodos() {
    const ids = Array.from(state.selectedTodoIds);

    if (!ids.length) {
      showMessage("削除するToDoを選択してください。", true);
      return;
    }

    if (!confirm("選択したToDoを削除しますか？")) {
      return;
    }

    try {
      await Promise.all(ids.map((id) => window.TMTDB.deleteTodo(id)));
      clearTodoSelection();
      showMessage("選択したToDoを削除しました。");
      renderTodo();
      renderHome();
    } catch (error) {
      showMessage("選択したToDoの削除に失敗しました。", true);
    }
  }

  // 表示中の日付の未着手ToDoをまとめて対応中にする。
  async function startAllTodoItems() {
    if (state.isTodoSelectMode) {
      return;
    }

    try {
      const todos = await window.TMTDB.getTodosByDate(state.selectedDate);
      const targets = todos.filter((todo) => todo.status === "todo");

      if (!targets.length) {
        showMessage("未着手のToDoはありません。");
        return;
      }

      if (!confirm("この日の未着手ToDoをすべて対応中にしますか？")) {
        return;
      }

      await Promise.all(targets.map((todo) => window.TMTDB.updateTodo({ ...todo, status: "doing" })));
      showMessage("未着手のToDoを対応中にしました。");
      renderTodo();
      renderHome();
    } catch (error) {
      showMessage("未着手ToDoの一括更新に失敗しました。", true);
    }
  }

  // 予定時刻つきToDoを時刻順に並べ、時刻なしは入力順にする。
  function compareTodosByTime(a, b) {
    const timeA = a.time || "";
    const timeB = b.time || "";

    if (timeA && timeB) {
      return timeA.localeCompare(timeB) || a.createdAt.localeCompare(b.createdAt);
    }

    if (timeA) {
      return -1;
    }

    if (timeB) {
      return 1;
    }

    return a.createdAt.localeCompare(b.createdAt);
  }

  // 一覧や詳細で表示する予定時刻を整える。
  function formatTodoTime(time) {
    return time || "--:--";
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

  // 年月日からYYYY-MM-DD文字列を作る。
  function buildDateString(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // 指定年月の日数を返す。
  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
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
