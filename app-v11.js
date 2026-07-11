(function () {
  "use strict";

  const STATUS_LABELS = {
    todo: "未着手",
    doing: "対応中",
    done: "完了"
  };

  const STATUS_ORDER = ["todo", "doing", "done"];

  const REPEAT_LABELS = {
    daily: "毎日",
    everyNDays: "N日ごと",
    weekly: "毎週",
    monthly: "毎月",
    manual: "手動"
  };

  const WEEKDAYS = [
    { value: "Sun", label: "日", index: 0 },
    { value: "Mon", label: "月", index: 1 },
    { value: "Tue", label: "火", index: 2 },
    { value: "Wed", label: "水", index: 3 },
    { value: "Thu", label: "木", index: 4 },
    { value: "Fri", label: "金", index: 5 },
    { value: "Sat", label: "土", index: 6 }
  ];

  const DEFAULT_CATEGORIES = ["掃除", "洗濯", "ゴミ", "買い物", "ペット", "健康", "手続き", "家計", "車", "その他"];
  const ROUTINE_TODO_EXPANSION_DAYS = 90;
  const ROUTINE_TODO_EXPANSION_LIMIT = 60;

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
    editingNote: null,
    editingRoutineId: null,
    editingRoutine: null,
    isDeletingRoutine: false,
    routineFilter: "due",
    routineCategoryFilter: "all"
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    renderAppShell();
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

  function renderAppShell() {
    document.title = "今日メモTodo";
    document.body.innerHTML = `
      <div class="app-shell">
        <header class="app-header">
          <div>
            <p class="app-kicker">個人用メモと今日の予定</p>
            <h1>今日メモTodo</h1>
          </div>
        </header>

        <main class="app-main" id="app">
          <p class="message" id="message" hidden></p>

          <section class="view is-active" id="view-home" aria-labelledby="home-title">
            <div class="section-heading">
              <div>
                <p class="muted">ホーム</p>
                <h2 id="home-title">今日の状況</h2>
              </div>
              <time class="date-pill" id="home-date"></time>
            </div>

            <div class="summary-grid" aria-label="今日の件数">
              <article class="summary-card">
                <span class="summary-label">未着手</span>
                <strong id="count-todo">0</strong>
              </article>
              <article class="summary-card">
                <span class="summary-label">対応中</span>
                <strong id="count-doing">0</strong>
              </article>
              <article class="summary-card">
                <span class="summary-label">完了</span>
                <strong id="count-done">0</strong>
              </article>
              <article class="summary-card">
                <span class="summary-label">ルーチン</span>
                <strong id="count-routines-due">0</strong>
              </article>
            </div>

            <div class="panel">
              <div class="panel-title">
                <h3>今日やるルーチン</h3>
                <button class="text-button" type="button" data-go="routines">一覧へ</button>
              </div>
              <div class="list" id="home-routines"></div>
            </div>

            <div class="panel">
              <div class="panel-title">
                <h3>最近更新したメモ</h3>
                <button class="text-button" type="button" data-go="notes">すべて見る</button>
              </div>
              <div class="list" id="recent-notes"></div>
            </div>
          </section>

          <section class="view" id="view-todo" aria-labelledby="todo-title">
            <div class="section-heading">
              <div>
                <p class="muted">ToDo</p>
                <h2 id="todo-title">日付ごとのやること</h2>
              </div>
            </div>

            <label class="field-label" for="todo-date">日付</label>
            <input class="input" id="todo-date" type="date">

            <div class="todo-bulk-toolbar" aria-label="ToDoの一括操作">
              <button class="secondary-button compact" type="button" id="todo-select-mode">選択コピー</button>
              <button class="secondary-button compact" type="button" id="todo-start-all">未着手を対応中へ</button>
            </div>

            <div class="todo-select-panel" id="todo-select-panel" hidden>
              <p id="todo-selected-count">選択 0件</p>
              <label class="field-label compact-label" for="todo-copy-date-input">コピー先日付</label>
              <input class="input" id="todo-copy-date-input" type="date">
              <div class="todo-select-actions">
                <button class="primary-button" type="button" id="todo-copy-selected">コピーする</button>
                <button class="secondary-button" type="button" id="todo-select-cancel">キャンセル</button>
              </div>
              <button class="text-button todo-select-delete" type="button" id="todo-delete-selected">選択したToDoを削除</button>
            </div>

            <form class="add-form todo-add-form" id="todo-form">
              <div class="todo-add-date">
                <label class="field-label compact-label" for="todo-add-date-input">日付</label>
                <input class="input" id="todo-add-date-input" type="date">
              </div>
              <div class="todo-add-time">
                <label class="field-label compact-label" for="todo-time-input">時刻</label>
                <input class="input" id="todo-time-input" type="time">
              </div>
              <div class="todo-add-title">
                <label class="field-label compact-label" for="todo-title-input">ToDo</label>
                <input class="input" id="todo-title-input" type="text" autocomplete="off" placeholder="今日やることを入力">
              </div>
              <button class="primary-button" type="submit">追加</button>
            </form>

            <div class="list" id="todo-list"></div>
          </section>

          <section class="view" id="view-todo-detail" aria-labelledby="todo-detail-heading">
            <div class="section-heading">
              <div>
                <p class="muted">ToDo詳細</p>
                <h2 id="todo-detail-heading">ToDoを確認</h2>
              </div>
              <button class="secondary-button compact" type="button" id="back-to-todo-list">一覧へ戻る</button>
            </div>

            <div class="todo-detail-card">
              <div id="todo-detail-display">
                <p class="todo-detail-title" id="todo-detail-title"></p>
                <div class="todo-detail-status-line">
                  <span>日付</span>
                  <span class="todo-detail-date" id="todo-detail-date"></span>
                </div>
                <div class="todo-detail-status-line">
                  <span>予定時刻</span>
                  <span class="todo-detail-time" id="todo-detail-time"></span>
                </div>
                <div class="todo-detail-status-line">
                  <span>現在のステータス</span>
                  <span class="status-badge" id="todo-detail-status"></span>
                </div>

                <button class="secondary-button wide todo-edit-open" type="button" id="todo-detail-edit">編集</button>

                <div class="todo-detail-actions">
                  <button class="secondary-button" type="button" id="todo-detail-back">戻す</button>
                  <button class="primary-button" type="button" id="todo-detail-next">進める</button>
                </div>

                <div class="danger-zone">
                  <button class="danger-button wide" type="button" id="todo-detail-delete">削除</button>
                </div>
              </div>

              <div class="todo-edit-panel" id="todo-edit-panel" hidden>
                <label class="field-label" for="todo-edit-date-input">日付</label>
                <input class="input" id="todo-edit-date-input" type="date">

                <label class="field-label" for="todo-edit-time-input">時刻</label>
                <input class="input" id="todo-edit-time-input" type="time">

                <label class="field-label" for="todo-edit-title-input">内容</label>
                <input class="input" id="todo-edit-title-input" type="text" autocomplete="off" placeholder="ToDoの内容">

                <div class="todo-edit-actions">
                  <button class="primary-button" type="button" id="todo-edit-save">保存</button>
                  <button class="secondary-button" type="button" id="todo-edit-cancel">キャンセル</button>
                </div>
              </div>
            </div>
          </section>

          <section class="view" id="view-calendar" aria-labelledby="calendar-title">
            <div class="section-heading">
              <div>
                <p class="muted">カレンダー</p>
                <h2 id="calendar-title">予定のある日</h2>
              </div>
              <button class="danger-button compact" type="button" id="calendar-delete-month-todos">月の削除</button>
            </div>

            <div class="calendar-toolbar">
              <button class="secondary-button compact" type="button" id="calendar-prev">前月</button>
              <button class="secondary-button compact" type="button" id="calendar-today">今月</button>
              <button class="secondary-button compact" type="button" id="calendar-next">次月</button>
            </div>

            <div class="calendar-panel">
              <h3 class="calendar-month" id="calendar-month-label"></h3>
              <div class="calendar-weekdays" aria-hidden="true">
                <span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span>
              </div>
              <div class="calendar-grid" id="calendar-grid"></div>
            </div>
          </section>

          <section class="view" id="view-notes" aria-labelledby="notes-title">
            <div class="section-heading">
              <div>
                <p class="muted">メモ</p>
                <h2 id="notes-title">メモ一覧</h2>
              </div>
              <button class="primary-button compact" type="button" id="new-note-button">新規</button>
            </div>

            <label class="sr-only" for="note-search">メモ検索</label>
            <input class="input" id="note-search" type="search" placeholder="タイトルと本文を検索">

            <div class="list" id="note-list"></div>
          </section>

          <section class="view" id="view-editor" aria-labelledby="editor-title">
            <div class="section-heading">
              <div>
                <p class="muted">メモ編集</p>
                <h2 id="editor-title">メモを書く</h2>
              </div>
              <button class="secondary-button compact" type="button" id="back-to-notes">戻る</button>
            </div>

            <label class="field-label" for="note-title-input">タイトル</label>
            <input class="input" id="note-title-input" type="text" placeholder="タイトル">

            <label class="field-label" for="note-body-input">本文</label>
            <textarea class="textarea" id="note-body-input" placeholder="自由にメモを書く"></textarea>

            <div class="button-row">
              <button class="primary-button" type="button" id="save-note-button">保存</button>
              <button class="danger-button" type="button" id="delete-note-button">削除</button>
            </div>
          </section>

          <section class="view" id="view-routines" aria-labelledby="routines-title">
            <div class="section-heading">
              <div>
                <p class="muted">生活ルーチン</p>
                <h2 id="routines-title">ルーチン一覧</h2>
              </div>
              <button class="primary-button compact" type="button" id="new-routine-button">新規</button>
            </div>

            <div class="panel">
              <div class="panel-title">
                <h3>今日やるルーチン</h3>
                <button class="text-button" type="button" id="add-all-due-todos">すべてToDoへ</button>
              </div>
              <div class="list" id="due-routine-list"></div>
            </div>

            <div class="routine-filter-grid">
              <div>
                <label class="field-label compact-label" for="routine-filter">表示</label>
                <select class="select" id="routine-filter">
                  <option value="due">今日やる</option>
                  <option value="overdue">期限超過</option>
                  <option value="active">有効</option>
                  <option value="inactive">無効</option>
                  <option value="all">すべて</option>
                </select>
              </div>
              <div>
                <label class="field-label compact-label" for="routine-category-filter">カテゴリ</label>
                <select class="select" id="routine-category-filter"></select>
              </div>
            </div>

            <div class="list" id="routine-list"></div>
          </section>

          <section class="view" id="view-routine-editor" aria-labelledby="routine-editor-title">
            <div class="section-heading">
              <div>
                <p class="muted">ルーチン編集</p>
                <h2 id="routine-editor-title">ルーチンを作成</h2>
              </div>
              <button class="secondary-button compact" type="button" id="back-to-routines">戻る</button>
            </div>

            <form class="routine-editor-card" id="routine-form">
              <div class="form-grid">
                <div class="full">
                  <label class="field-label" for="routine-title-input">ルーチン名</label>
                  <input class="input" id="routine-title-input" type="text" autocomplete="off" placeholder="ゴミ出し、洗濯、風呂掃除など">
                </div>

                <div>
                  <label class="field-label" for="routine-category-select">カテゴリ</label>
                  <select class="select" id="routine-category-select"></select>
                </div>

                <div>
                  <label class="field-label" for="routine-category-custom">カテゴリ自由入力</label>
                  <input class="input" id="routine-category-custom" type="text" autocomplete="off" placeholder="任意">
                </div>

                <div class="full">
                  <label class="field-label" for="routine-description-input">説明</label>
                  <textarea class="textarea" id="routine-description-input" placeholder="補足メモ"></textarea>
                </div>

                <div>
                  <label class="field-label" for="routine-repeat-type">繰り返し</label>
                  <select class="select" id="routine-repeat-type">
                    <option value="daily">毎日</option>
                    <option value="everyNDays">N日ごと</option>
                    <option value="weekly">毎週</option>
                    <option value="monthly">毎月</option>
                    <option value="manual">手動</option>
                  </select>
                </div>

                <div>
                  <label class="field-label" for="routine-next-date-input">開始日 / 次回予定日</label>
                  <input class="input" id="routine-next-date-input" type="date">
                </div>

                <div>
                  <label class="field-label" for="routine-end-date-input">終了日</label>
                  <input class="input" id="routine-end-date-input" type="date">
                  <p class="field-help">空欄なら自動作成は90日先までです。</p>
                </div>

                <div class="conditional-field" id="routine-interval-group">
                  <label class="field-label" for="routine-interval-input">N日ごと</label>
                  <input class="input" id="routine-interval-input" type="number" min="1" step="1" value="7">
                </div>

                <div class="conditional-field full" id="routine-weekly-group">
                  <label class="field-label">曜日指定</label>
                  <div class="routine-checkbox-grid" id="routine-weekday-list"></div>
                </div>

                <div class="conditional-field" id="routine-monthly-group">
                  <label class="field-label" for="routine-day-month-input">毎月指定日</label>
                  <input class="input" id="routine-day-month-input" type="number" min="1" max="31" step="1" value="1">
                </div>

                <div>
                  <label class="field-label" for="routine-time-input">予定時刻</label>
                  <input class="input" id="routine-time-input" type="time">
                </div>

                <div>
                  <label class="field-label" for="routine-last-done-input">最終実施日</label>
                  <input class="input" id="routine-last-done-input" type="date">
                </div>

                <div class="full">
                  <label class="switch-row">
                    <input id="routine-active-input" type="checkbox" checked>
                    有効
                  </label>
                </div>

                <div class="full">
                  <label class="switch-row">
                    <input id="routine-auto-todo-input" type="checkbox">
                    保存時に予定日のToDoへ追加する
                  </label>
                </div>
              </div>

              <div class="routine-editor-actions">
                <button class="primary-button" type="submit">保存</button>
                <button class="secondary-button" type="button" id="routine-cancel-button">キャンセル</button>
              </div>

              <div class="routine-danger-actions">
                <button class="secondary-button" type="button" id="routine-toggle-active-button">無効化</button>
                <button class="danger-button" type="button" id="routine-delete-button">削除</button>
              </div>
            </form>

            <div class="panel routine-history-section" id="routine-history-section" hidden>
              <div class="panel-title">
                <h3>実施履歴</h3>
              </div>
              <div class="routine-history-list" id="routine-history-list"></div>
            </div>
          </section>

          <section class="view" id="view-settings" aria-labelledby="settings-title">
            <div class="section-heading">
              <div>
                <p class="muted">設定</p>
                <h2 id="settings-title">バックアップと情報</h2>
              </div>
            </div>

            <div class="settings-actions">
              <button class="primary-button wide" type="button" id="export-button">バックアップ出力</button>
              <button class="secondary-button wide" type="button" id="import-button">バックアップ復元</button>
              <input id="import-file" type="file" accept="application/json,.json" hidden>
            </div>

            <div class="info-box">
              <h3>アプリ情報</h3>
              <p>今日メモTodoは、ToDo、複数ページのメモ、生活ルーチンを端末内に保存する軽量PWAです。</p>
              <p>保存先はこのブラウザのIndexedDBです。ログインやクラウド同期はありません。</p>
              <p>ルーチンと実施履歴もバックアップに含まれます。古いバックアップにルーチンがなくても復元できます。</p>
            </div>
          </section>
        </main>

        <nav class="bottom-nav" aria-label="メインナビゲーション">
          <button class="nav-button is-active" type="button" data-go="home"><span aria-hidden="true">⌂</span><span>ホーム</span></button>
          <button class="nav-button" type="button" data-go="todo"><span aria-hidden="true">✓</span><span>ToDo</span></button>
          <button class="nav-button" type="button" data-go="calendar"><span aria-hidden="true">□</span><span>カレンダー</span></button>
          <button class="nav-button" type="button" data-go="notes"><span aria-hidden="true">✎</span><span>メモ</span></button>
          <button class="nav-button" type="button" data-go="routines"><span aria-hidden="true">↻</span><span>ルーチン</span></button>
          <button class="nav-button" type="button" data-go="settings"><span aria-hidden="true">⚙</span><span>設定</span></button>
        </nav>
      </div>
    `;
  }

  function cacheElements() {
    elements.message = document.getElementById("message");
    elements.views = document.querySelectorAll(".view");
    elements.navButtons = document.querySelectorAll("[data-go]");
    elements.homeDate = document.getElementById("home-date");
    elements.countTodo = document.getElementById("count-todo");
    elements.countDoing = document.getElementById("count-doing");
    elements.countDone = document.getElementById("count-done");
    elements.countRoutinesDue = document.getElementById("count-routines-due");
    elements.homeRoutines = document.getElementById("home-routines");
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
    elements.todoCopyDateInput = document.getElementById("todo-copy-date-input");
    elements.todoCopySelected = document.getElementById("todo-copy-selected");
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
    elements.calendarDeleteMonthTodos = document.getElementById("calendar-delete-month-todos");
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
    elements.newRoutineButton = document.getElementById("new-routine-button");
    elements.addAllDueTodos = document.getElementById("add-all-due-todos");
    elements.dueRoutineList = document.getElementById("due-routine-list");
    elements.routineFilter = document.getElementById("routine-filter");
    elements.routineCategoryFilter = document.getElementById("routine-category-filter");
    elements.routineList = document.getElementById("routine-list");
    elements.backToRoutines = document.getElementById("back-to-routines");
    elements.routineForm = document.getElementById("routine-form");
    elements.routineEditorTitle = document.getElementById("routine-editor-title");
    elements.routineTitleInput = document.getElementById("routine-title-input");
    elements.routineCategorySelect = document.getElementById("routine-category-select");
    elements.routineCategoryCustom = document.getElementById("routine-category-custom");
    elements.routineDescriptionInput = document.getElementById("routine-description-input");
    elements.routineRepeatType = document.getElementById("routine-repeat-type");
    elements.routineNextDateInput = document.getElementById("routine-next-date-input");
    elements.routineEndDateInput = document.getElementById("routine-end-date-input");
    elements.routineIntervalGroup = document.getElementById("routine-interval-group");
    elements.routineIntervalInput = document.getElementById("routine-interval-input");
    elements.routineWeeklyGroup = document.getElementById("routine-weekly-group");
    elements.routineWeekdayList = document.getElementById("routine-weekday-list");
    elements.routineMonthlyGroup = document.getElementById("routine-monthly-group");
    elements.routineDayMonthInput = document.getElementById("routine-day-month-input");
    elements.routineTimeInput = document.getElementById("routine-time-input");
    elements.routineLastDoneInput = document.getElementById("routine-last-done-input");
    elements.routineActiveInput = document.getElementById("routine-active-input");
    elements.routineAutoTodoInput = document.getElementById("routine-auto-todo-input");
    elements.routineCancelButton = document.getElementById("routine-cancel-button");
    elements.routineToggleActiveButton = document.getElementById("routine-toggle-active-button");
    elements.routineDeleteButton = document.getElementById("routine-delete-button");
    elements.routineHistorySection = document.getElementById("routine-history-section");
    elements.routineHistoryList = document.getElementById("routine-history-list");
    elements.exportButton = document.getElementById("export-button");
    elements.importButton = document.getElementById("import-button");
    elements.importFile = document.getElementById("import-file");
  }

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
    elements.todoCopySelected.addEventListener("click", copySelectedTodos);
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
    elements.calendarDeleteMonthTodos.addEventListener("click", deleteCalendarMonthTodos);
    elements.calendarGrid.addEventListener("click", handleCalendarDateClick);
    elements.newNoteButton.addEventListener("click", () => navigate("note-new"));
    elements.noteSearch.addEventListener("input", renderNotes);
    elements.noteList.addEventListener("click", handleNoteOpen);
    elements.backToNotes.addEventListener("click", () => navigate("notes"));
    elements.saveNoteButton.addEventListener("click", handleSaveNote);
    elements.deleteNoteButton.addEventListener("click", handleDeleteNote);
    elements.newRoutineButton.addEventListener("click", () => navigate("routine-new"));
    elements.addAllDueTodos.addEventListener("click", addAllDueRoutinesToTodo);
    elements.routineFilter.addEventListener("change", () => {
      state.routineFilter = elements.routineFilter.value;
      renderRoutines();
    });
    elements.routineCategoryFilter.addEventListener("change", () => {
      state.routineCategoryFilter = elements.routineCategoryFilter.value;
      renderRoutines();
    });
    elements.routineList.addEventListener("click", handleRoutineListAction);
    elements.dueRoutineList.addEventListener("click", handleRoutineListAction);
    elements.homeRoutines.addEventListener("click", handleRoutineListAction);
    elements.backToRoutines.addEventListener("click", () => navigate("routines"));
    elements.routineRepeatType.addEventListener("change", syncRoutineRepeatFields);
    elements.routineForm.addEventListener("submit", handleSaveRoutine);
    elements.routineCancelButton.addEventListener("click", () => navigate("routines"));
    elements.routineToggleActiveButton.addEventListener("click", toggleEditingRoutineActive);
    elements.routineDeleteButton.addEventListener("click", deleteEditingRoutine);
    elements.exportButton.addEventListener("click", exportBackup);
    elements.importButton.addEventListener("click", () => elements.importFile.click());
    elements.importFile.addEventListener("change", importBackup);

    renderWeekdayInputs();
  }

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

    if (route === "routine-new") {
      state.editingRoutineId = null;
      state.editingRoutine = null;
      showView("routine-editor");
      loadRoutineEditor();
      return;
    }

    if (route.startsWith("routine-")) {
      state.editingRoutineId = decodeURIComponent(route.replace("routine-", ""));
      showView("routine-editor");
      loadRoutineEditor();
      return;
    }

    showView(["home", "todo", "calendar", "notes", "routines", "settings"].includes(route) ? route : "home");
  }

  function showView(viewName) {
    if (viewName !== "todo") {
      clearTodoSelection();
    }

    state.currentView = viewName;

    elements.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${viewName}`);
    });

    const activeNav = viewName === "todo-detail" ? "todo" : viewName === "editor" ? "notes" : viewName === "routine-editor" ? "routines" : viewName;

    document.querySelectorAll(".nav-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.go === activeNav);
    });

    if (viewName === "home") renderHome();
    if (viewName === "todo") renderTodo();
    if (viewName === "calendar") renderCalendar();
    if (viewName === "notes") renderNotes();
    if (viewName === "routines") renderRoutines();
  }

  function navigate(viewName) {
    const hash = `#${viewName}`;

    if (location.hash === hash) {
      handleRoute();
      return;
    }

    location.hash = hash;
  }

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

  async function renderHome() {
    try {
      const today = getTodayString();
      const [todos, notes, routines] = await Promise.all([
        window.TMTDB.getTodosByDate(today),
        window.TMTDB.getAllNotes(),
        window.TMTDB.getAllRoutines()
      ]);
      await syncAutoRoutineTodos(routines);
      const dueRoutines = getDueRoutines(routines, today);

      elements.homeDate.textContent = formatDate(today);
      elements.countTodo.textContent = todos.filter((todo) => todo.status === "todo").length;
      elements.countDoing.textContent = todos.filter((todo) => todo.status === "doing").length;
      elements.countDone.textContent = todos.filter((todo) => todo.status === "done").length;
      elements.countRoutinesDue.textContent = dueRoutines.length;
      renderRoutineCards(elements.homeRoutines, dueRoutines.slice(0, 3), { compact: true });
      renderRecentNotes(notes.slice(0, 4));
    } catch (error) {
      showMessage("ホーム画面の読み込みに失敗しました。", true);
    }
  }

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

  async function renderCalendar() {
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const startDate = buildDateString(year, month, 1);
    const endDate = buildDateString(year, month, getDaysInMonth(year, month));

    try {
      const [todos, routines] = await Promise.all([
        window.TMTDB.getTodosByDateRange(startDate, endDate),
        window.TMTDB.getAllRoutines()
      ]);
      const todoCounts = countTodosByDate(todos);
      const routineCounts = countRoutinesByDate(routines, startDate, endDate);
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
        const todoCount = todoCounts.get(date) || 0;
        const routineCount = routineCounts.get(date) || 0;
        elements.calendarGrid.append(createCalendarDay(date, day, todoCount, routineCount, date === today, date === selectedDate));
      }
    } catch (error) {
      showMessage("カレンダーの読み込みに失敗しました。", true);
    }
  }

  function createCalendarDay(date, day, todoCount, routineCount, isToday, isSelected) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.calendarDate = date;
    button.setAttribute("aria-label", `${date} ToDo ${todoCount}件 ルーチン ${routineCount}件`);

    if (todoCount > 0) button.classList.add("has-todos");
    if (routineCount > 0) button.classList.add("has-routines");
    if (isToday) button.classList.add("is-today");
    if (isSelected) button.classList.add("is-selected");

    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = day;
    button.append(dayNumber);

    if (todoCount > 0) {
      const countLabel = document.createElement("span");
      countLabel.className = "calendar-count";
      countLabel.textContent = `${todoCount}件`;
      button.append(countLabel);
    }

    if (routineCount > 0) {
      const routineLabel = document.createElement("span");
      routineLabel.className = "calendar-routine-count";
      routineLabel.textContent = `R ${routineCount}`;
      button.append(routineLabel);
    }

    return button;
  }

  function handleCalendarDateClick(event) {
    const day = event.target.closest("[data-calendar-date]");

    if (!day) {
      return;
    }

    setSelectedDate(day.dataset.calendarDate);
    navigate("todo");
  }

  function moveCalendarMonth(amount) {
    const date = new Date(state.calendarYear, state.calendarMonth - 1 + amount, 1);
    state.calendarYear = date.getFullYear();
    state.calendarMonth = date.getMonth() + 1;
    renderCalendar();
  }

  function showCurrentCalendarMonth() {
    const today = new Date();
    state.calendarYear = today.getFullYear();
    state.calendarMonth = today.getMonth() + 1;
    renderCalendar();
  }

  async function deleteCalendarMonthTodos() {
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const startDate = buildDateString(year, month, 1);
    const endDate = buildDateString(year, month, getDaysInMonth(year, month));
    const monthLabel = `${year}年${month}月`;

    try {
      const todos = await window.TMTDB.getTodosByDateRange(startDate, endDate);

      if (!todos.length) {
        showMessage(`${monthLabel}に削除対象のToDoはありません。`);
        return;
      }

      const ok = confirm(`${monthLabel}のToDoをすべて削除します。\n\nこの月に登録されている通常ToDo、ルーチン由来ToDoもすべて削除されます。\nこの操作は元に戻せません。\n\n削除してよろしいですか？`);

      if (!ok) {
        return;
      }

      await rememberRoutineTodoDeletionsForDateRange(startDate, endDate);
      await Promise.all(todos.map((todo) => deleteTodoWithRoutineMemory(todo)));
      showMessage(`${monthLabel}のToDoを${todos.length}件削除しました。`);
      renderCalendar();
      renderTodo();
      renderHome();
    } catch (error) {
      showMessage("表示月のToDo削除に失敗しました。", true);
    }
  }

  function countTodosByDate(todos) {
    return todos.reduce((counts, todo) => {
      const date = todo.date || getTodayString();
      counts.set(date, (counts.get(date) || 0) + 1);
      return counts;
    }, new Map());
  }

  function countRoutinesByDate(routines, startDate, endDate) {
    return routines.reduce((counts, routine) => {
      if (!routine.isActive || !routine.nextDueDate || routine.nextDueDate < startDate || routine.nextDueDate > endDate) {
        return counts;
      }

      counts.set(routine.nextDueDate, (counts.get(routine.nextDueDate) || 0) + 1);
      return counts;
    }, new Map());
  }

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
    elements.todoDetailNext.textContent = todo.status === "done" ? "完了済み" : "進める";

    if (isEditing) {
      elements.todoEditDateInput.value = todoDate;
      elements.todoEditTimeInput.value = todo.time || "";
      elements.todoEditTitleInput.value = todo.title;
      elements.todoEditTitleInput.focus();
    }
  }

  async function handleTodoDetailAction(action) {
    if (!state.selectedTodo || state.isEditingTodo) {
      return;
    }

    try {
      if (action === "delete") {
        if (confirm("このToDoを削除しますか？")) {
          await deleteTodoWithRoutineMemory(state.selectedTodo);
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

  function startTodoEdit() {
    if (!state.selectedTodo) {
      return;
    }

    renderTodoDetail(state.selectedTodo, true);
  }

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

  function cancelTodoEdit() {
    if (!state.selectedTodo) {
      return;
    }

    renderTodoDetail(state.selectedTodo, false);
  }

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

  function renderTodoBulkControls(todos) {
    const todoCount = todos.length;
    const todoStatusCount = todos.filter((todo) => todo.status === "todo").length;
    const selectedCount = state.selectedTodoIds.size;

    elements.todoSelectPanel.hidden = !state.isTodoSelectMode;
    elements.todoSelectMode.disabled = !todoCount || state.isTodoSelectMode;
    elements.todoStartAll.disabled = state.isTodoSelectMode || !todoStatusCount;
    elements.todoCopyDateInput.value = state.isTodoSelectMode ? elements.todoCopyDateInput.value || addDays(state.selectedDate, 1) : "";
    elements.todoCopySelected.disabled = !selectedCount;
    elements.todoDeleteSelected.disabled = !selectedCount;
    elements.todoSelectedCount.textContent = `選択 ${selectedCount}件`;
  }

  function enterTodoSelectMode() {
    state.isTodoSelectMode = true;
    state.selectedTodoIds.clear();
    renderTodo();
  }

  function toggleSelectedTodo(todoId) {
    if (state.selectedTodoIds.has(todoId)) {
      state.selectedTodoIds.delete(todoId);
      return;
    }

    state.selectedTodoIds.add(todoId);
  }

  function clearTodoSelection() {
    state.isTodoSelectMode = false;
    state.selectedTodoIds.clear();
  }

  function syncSelectedTodoIds(todos) {
    const visibleIds = new Set(todos.map((todo) => todo.id));
    state.selectedTodoIds.forEach((id) => {
      if (!visibleIds.has(id)) {
        state.selectedTodoIds.delete(id);
      }
    });
  }

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
      const todos = await Promise.all(ids.map((id) => window.TMTDB.getTodo(id)));
      await Promise.all(todos.filter(Boolean).map((todo) => deleteTodoWithRoutineMemory(todo)));
      clearTodoSelection();
      showMessage("選択したToDoを削除しました。");
      renderTodo();
      renderHome();
    } catch (error) {
      showMessage("選択したToDoの削除に失敗しました。", true);
    }
  }

  async function copySelectedTodos() {
    const ids = Array.from(state.selectedTodoIds);
    const targetDate = elements.todoCopyDateInput.value || "";

    if (!ids.length) {
      showMessage("コピーするToDoを選択してください。", true);
      return;
    }

    if (!targetDate) {
      showMessage("コピー先の日付を指定してください。", true);
      return;
    }

    try {
      const [selectedTodos, targetTodos] = await Promise.all([
        Promise.all(ids.map((id) => window.TMTDB.getTodo(id))),
        window.TMTDB.getTodosByDate(targetDate)
      ]);
      const duplicateKeys = new Set(targetTodos.map((todo) => getTodoDuplicateKey(todo)));
      let copiedCount = 0;
      let skippedCount = 0;

      for (const todo of selectedTodos.filter(Boolean)) {
        const duplicateKey = getTodoDuplicateKey(todo);

        if (duplicateKeys.has(duplicateKey)) {
          skippedCount += 1;
          continue;
        }

        // addTodo creates a new ID and resets the status. Routine metadata is intentionally not copied.
        await window.TMTDB.addTodo(todo.title, targetDate, todo.time || "");
        duplicateKeys.add(duplicateKey);
        copiedCount += 1;
      }

      if (!copiedCount) {
        showMessage("コピー先に同じToDoがあるため、追加しませんでした。", true);
        return;
      }

      clearTodoSelection();
      setSelectedDate(targetDate);
      const skippedMessage = skippedCount ? ` ${skippedCount}件は重複のためスキップしました。` : "";
      showMessage(`${targetDate} に ${copiedCount}件コピーしました。${skippedMessage}`);
      renderTodo();
      renderHome();
    } catch (error) {
      console.error("ToDo copy failed", error);
      showMessage("ToDoのコピーに失敗しました。", true);
    }
  }

  function getTodoDuplicateKey(todo) {
    return `${todo.title || ""}\u0000${todo.time || ""}`;
  }

  async function deleteTodoWithRoutineMemory(todo) {
    if (!todo) {
      return;
    }

    await rememberRoutineTodoDeletion(todo);
    await window.TMTDB.deleteTodo(todo.id);
  }

  async function rememberRoutineTodoDeletion(todo) {
    if (!todo.routineId || !todo.date) {
      return;
    }

    const routine = await window.TMTDB.getRoutine(todo.routineId);

    if (!routine) {
      return;
    }

    const excludedTodoDates = new Set(Array.isArray(routine.excludedTodoDates) ? routine.excludedTodoDates : []);
    excludedTodoDates.add(todo.date);
    await window.TMTDB.saveRoutine({
      ...routine,
      excludedTodoDates: Array.from(excludedTodoDates).sort()
    });
  }

  async function rememberRoutineTodoDeletionsForDateRange(startDate, endDate) {
    const routines = await window.TMTDB.getAllRoutines();

    for (const routine of routines) {
      if (!routine.isActive || !routine.autoCreateTodo) {
        continue;
      }

      const dates = getRoutineOccurrenceDatesInRange(routine, startDate, endDate);

      if (!dates.length) {
        continue;
      }

      const excludedTodoDates = new Set(Array.isArray(routine.excludedTodoDates) ? routine.excludedTodoDates : []);
      dates.forEach((date) => excludedTodoDates.add(date));
      await window.TMTDB.saveRoutine({
        ...routine,
        excludedTodoDates: Array.from(excludedTodoDates).sort()
      });
    }
  }

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

  function compareTodosByTime(a, b) {
    const timeA = a.time || "";
    const timeB = b.time || "";

    if (timeA && timeB) {
      return timeA.localeCompare(timeB) || a.createdAt.localeCompare(b.createdAt);
    }

    if (timeA) return -1;
    if (timeB) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  }

  function formatTodoTime(time) {
    return time || "--:--";
  }

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

  function handleNoteOpen(event) {
    const button = event.target.closest("button[data-note-id]");

    if (button) {
      navigate(`note-${button.dataset.noteId}`);
    }
  }

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

  async function renderRoutines() {
    try {
      const routines = await window.TMTDB.getAllRoutines();
      await syncAutoRoutineTodos(routines);
      const today = getTodayString();
      const dueRoutines = getDueRoutines(routines, today);
      const filteredRoutines = filterRoutines(routines, today);

      populateRoutineCategoryFilters(routines);
      elements.routineFilter.value = state.routineFilter;
      elements.routineCategoryFilter.value = state.routineCategoryFilter;
      renderRoutineCards(elements.dueRoutineList, dueRoutines, { emptyText: "今日やるルーチンはありません。" });
      renderRoutineCards(elements.routineList, filteredRoutines, { emptyText: "条件に合うルーチンはありません。" });
      elements.addAllDueTodos.disabled = !dueRoutines.length;
    } catch (error) {
      showMessage("ルーチン一覧の読み込みに失敗しました。", true);
    }
  }

  function getDueRoutines(routines, today) {
    return routines
      .filter((routine) => routine.isActive && routine.nextDueDate && routine.nextDueDate <= today)
      .sort(compareRoutines);
  }

  function filterRoutines(routines, today) {
    return routines.filter((routine) => {
      const categoryOk = state.routineCategoryFilter === "all" || routine.category === state.routineCategoryFilter;
      if (!categoryOk) return false;

      if (state.routineFilter === "due") return routine.isActive && routine.nextDueDate && routine.nextDueDate <= today;
      if (state.routineFilter === "overdue") return routine.isActive && routine.nextDueDate && routine.nextDueDate < today;
      if (state.routineFilter === "active") return routine.isActive;
      if (state.routineFilter === "inactive") return !routine.isActive;
      return true;
    }).sort(compareRoutines);
  }

  function compareRoutines(a, b) {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (!a.nextDueDate && b.nextDueDate) return 1;
    if (a.nextDueDate && !b.nextDueDate) return -1;
    return String(a.nextDueDate || "").localeCompare(String(b.nextDueDate || "")) || a.title.localeCompare(b.title);
  }

  function populateRoutineCategoryFilters(routines) {
    const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...routines.map((routine) => routine.category).filter(Boolean)]));
    const current = elements.routineCategoryFilter.value || state.routineCategoryFilter;

    elements.routineCategoryFilter.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "すべて";
    elements.routineCategoryFilter.append(allOption);

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      elements.routineCategoryFilter.append(option);
    });

    state.routineCategoryFilter = categories.includes(current) || current === "all" ? current : "all";
  }

  function renderRoutineCards(container, routines, options = {}) {
    container.innerHTML = "";

    if (!routines.length) {
      container.append(createEmptyState(options.emptyText || "ルーチンはありません。"));
      return;
    }

    routines.forEach((routine) => container.append(createRoutineItem(routine, options)));
  }

  function createRoutineItem(routine, options = {}) {
    const today = getTodayString();
    const dueState = getRoutineDueState(routine, today);
    const item = document.createElement("article");
    item.className = `routine-item ${dueState.kind === "overdue" ? "is-overdue" : ""} ${routine.isActive ? "" : "is-inactive"}`;

    const mainLine = document.createElement("div");
    mainLine.className = "routine-main-line";

    const title = document.createElement("div");
    title.className = "routine-title";
    title.textContent = routine.title;

    const chip = document.createElement("span");
    chip.className = `routine-chip is-${dueState.kind}`;
    chip.textContent = dueState.label;
    mainLine.append(title, chip);

    const metaLine = document.createElement("div");
    metaLine.className = "routine-meta-line";
    metaLine.append(
      createTextSpan(`カテゴリ: ${routine.category}`),
      createTextSpan(`次回: ${formatRoutineDue(routine)}`),
      createTextSpan(`繰り返し: ${formatRoutineRepeat(routine)}`)
    );

    const actions = document.createElement("div");
    actions.className = "routine-actions";
    actions.append(
      createRoutineActionButton("実施済み", "done", routine.id, "primary-button", !routine.isActive),
      createRoutineActionButton("ToDoへ追加", "todo", routine.id, "secondary-button", !routine.isActive),
      createRoutineActionButton("編集", "edit", routine.id, "secondary-button compact", false)
    );

    item.append(mainLine, metaLine);

    if (!options.compact) {
      item.append(actions);
    } else {
      const compactActions = document.createElement("div");
      compactActions.className = "routine-actions";
      compactActions.append(
        createRoutineActionButton("実施済み", "done", routine.id, "primary-button", !routine.isActive),
        createRoutineActionButton("ToDoへ追加", "todo", routine.id, "secondary-button", !routine.isActive),
        createRoutineActionButton("編集", "edit", routine.id, "secondary-button compact", false)
      );
      item.append(compactActions);
    }

    return item;
  }

  function createTextSpan(text) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }

  function createRoutineActionButton(text, action, routineId, className, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.routineAction = action;
    button.dataset.routineId = routineId;
    button.textContent = text;
    button.disabled = disabled;
    return button;
  }

  function getRoutineDueState(routine, today) {
    if (!routine.isActive) {
      return { kind: "inactive", label: "無効" };
    }

    if (!routine.nextDueDate) {
      return { kind: "upcoming", label: "予定日なし" };
    }

    if (routine.nextDueDate < today) {
      return { kind: "overdue", label: "期限超過" };
    }

    if (routine.nextDueDate === today) {
      return { kind: "today", label: "今日" };
    }

    return { kind: "upcoming", label: "予定" };
  }

  function formatRoutineDue(routine) {
    const dateLabel = routine.nextDueDate || "未設定";
    return routine.defaultTime ? `${dateLabel} ${routine.defaultTime}` : dateLabel;
  }

  function formatRoutineRepeat(routine) {
    if (routine.repeatType === "everyNDays") {
      return `${routine.intervalDays || 1}日ごと`;
    }

    if (routine.repeatType === "weekly") {
      const labels = WEEKDAYS.filter((day) => routine.daysOfWeek?.includes(day.value)).map((day) => day.label).join("・");
      return `毎週 ${labels || "曜日未設定"}`;
    }

    if (routine.repeatType === "monthly") {
      return `毎月 ${routine.dayOfMonth || 1}日`;
    }

    return REPEAT_LABELS[routine.repeatType] || "毎日";
  }

  async function handleRoutineListAction(event) {
    const button = event.target.closest("[data-routine-action]");

    if (!button) {
      return;
    }

    const routineId = button.dataset.routineId;
    const action = button.dataset.routineAction;

    if (action === "edit") {
      navigate(`routine-${encodeURIComponent(routineId)}`);
      return;
    }

    if (action === "done") {
      await markRoutineDone(routineId);
      return;
    }

    if (action === "todo") {
      const routine = await window.TMTDB.getRoutine(routineId);
      if (routine) {
        await addRoutineToTodayTodo(routine, { confirmDuplicate: true, navigateToTodo: true });
      }
    }
  }

  async function markRoutineDone(routineId) {
    try {
      const routine = await window.TMTDB.getRoutine(routineId);

      if (!routine) {
        showMessage("ルーチンが見つかりません。", true);
        return;
      }

      const today = getTodayString();
      const nextDueDate = calculateNextDueDate(routine, today);
      const savedRoutine = await window.TMTDB.saveRoutine({
        ...routine,
        lastDoneDate: today,
        nextDueDate
      });

      await window.TMTDB.addRoutineHistory(savedRoutine.id, today);
      showMessage("実施済みにしました。");
      renderHome();
      renderRoutines();
      if (state.editingRoutineId === routineId) {
        state.editingRoutine = savedRoutine;
        loadRoutineEditor();
      }
    } catch (error) {
      showMessage("ルーチンの更新に失敗しました。", true);
    }
  }

  async function addRoutineToTodayTodo(routine, options = {}) {
    const targetDate = options.date || getRoutineTodoDate(routine);

    if (!isRoutineOccurrenceAllowed(routine, targetDate)) {
      showMessage("このルーチンの期間外なのでToDoは追加しませんでした。", true);
      return false;
    }

    const todos = await window.TMTDB.getTodosByDate(targetDate);
    const duplicate = todos.find((todo) => todo.title === routine.title);

    if (duplicate && options.confirmDuplicate && !confirm(`${targetDate} に同じタイトルのToDoがすでにあります。追加しますか？`)) {
      return false;
    }

    if (duplicate && options.skipDuplicate) {
      return false;
    }

    await window.TMTDB.addTodo(routine.title, targetDate, routine.defaultTime || "", {
      routineId: routine.id,
      routineDate: targetDate,
      createdByRoutine: true
    });
    setSelectedDate(targetDate);
    if (!options.silent) {
      showMessage(`${targetDate} のToDoへ追加しました。`);
    }
    renderTodo();
    renderHome();
    if (options.navigateToTodo) {
      navigate("todo");
    }
    return true;
  }

  function getRoutineTodoDate(routine) {
    const today = getTodayString();

    if (routine.nextDueDate && routine.nextDueDate >= today) {
      return routine.nextDueDate;
    }

    return today;
  }

  async function addRoutineOccurrencesToTodos(routine, options = {}) {
    const dates = getRoutineTodoExpansionDates(routine);
    let added = 0;
    let skipped = 0;

    for (const date of dates) {
      const todos = await window.TMTDB.getTodosByDate(date);
      const duplicate = todos.some((todo) => todo.title === routine.title);

      if (duplicate) {
        skipped += 1;
        continue;
      }

      await window.TMTDB.addTodo(routine.title, date, routine.defaultTime || "", {
        routineId: routine.id,
        routineDate: date,
        createdByRoutine: true
      });
      added += 1;
    }

    if (dates.length && !options.keepSelectedDate) {
      setSelectedDate(dates[0]);
    }

    if (!options.skipRender) {
      renderTodo();
      renderHome();
    }

    return { added, skipped, dates };
  }

  async function syncAutoRoutineTodos(routines) {
    for (const routine of routines) {
      if (!routine.isActive || !routine.autoCreateTodo || !routine.nextDueDate) {
        continue;
      }

      await addRoutineOccurrencesToTodos(routine, {
        keepSelectedDate: true,
        skipRender: true
      });
    }
  }

  function getRoutineTodoExpansionDates(routine) {
    const startDate = getRoutineTodoDate(routine);
    const endDate = getRoutineTodoExpansionEndDate(routine, startDate);
    const dates = [];
    let currentDate = startDate;
    const excludedTodoDates = new Set(Array.isArray(routine.excludedTodoDates) ? routine.excludedTodoDates : []);

    for (let count = 0; count < ROUTINE_TODO_EXPANSION_LIMIT; count += 1) {
      if (!currentDate || currentDate > endDate) {
        break;
      }

      if (isRoutineOccurrenceAllowed(routine, currentDate) && !excludedTodoDates.has(currentDate)) {
        dates.push(currentDate);
      }

      if (routine.repeatType === "manual") {
        break;
      }

      const nextDate = calculateNextDueDate(routine, currentDate);
      if (!nextDate || nextDate <= currentDate) {
        break;
      }

      currentDate = nextDate;
    }

    return dates;
  }

  function getRoutineOccurrenceDatesInRange(routine, rangeStartDate, rangeEndDate) {
    const seedDate = routine.startDate || routine.nextDueDate;
    const dates = [];

    if (!seedDate || seedDate > rangeEndDate) {
      return dates;
    }

    let currentDate = seedDate;

    for (let count = 0; count < 1000; count += 1) {
      if (!currentDate || currentDate > rangeEndDate) {
        break;
      }

      if (currentDate >= rangeStartDate && isRoutineOccurrenceAllowed(routine, currentDate)) {
        dates.push(currentDate);
      }

      if (routine.repeatType === "manual") {
        break;
      }

      const nextDate = calculateNextDueDate(routine, currentDate);
      if (!nextDate || nextDate <= currentDate) {
        break;
      }

      currentDate = nextDate;
    }

    return dates;
  }

  function getRoutineTodoExpansionEndDate(routine, startDate) {
    const defaultEndDate = addDays(startDate, ROUTINE_TODO_EXPANSION_DAYS);

    if (routine.endDate && routine.endDate < defaultEndDate) {
      return routine.endDate;
    }

    return defaultEndDate;
  }

  function isRoutineOccurrenceAllowed(routine, date) {
    if (!date) {
      return false;
    }

    if (routine.startDate && date < routine.startDate) {
      return false;
    }

    if (routine.endDate && date > routine.endDate) {
      return false;
    }

    return true;
  }

  async function addAllDueRoutinesToTodo() {
    try {
      const today = getTodayString();
      const [routines, todos] = await Promise.all([
        window.TMTDB.getAllRoutines(),
        window.TMTDB.getTodosByDate(today)
      ]);
      const titles = new Set(todos.map((todo) => todo.title));
      const dueRoutines = getDueRoutines(routines, today);
      let added = 0;
      let skipped = 0;

      for (const routine of dueRoutines) {
        if (titles.has(routine.title)) {
          skipped += 1;
          continue;
        }

        await window.TMTDB.addTodo(routine.title, today, routine.defaultTime || "", {
          routineId: routine.id,
          routineDate: today,
          createdByRoutine: true
        });
        titles.add(routine.title);
        added += 1;
      }

      setSelectedDate(today);
      showMessage(`今日のToDoへ${added}件追加しました。${skipped ? ` 重複 ${skipped}件はスキップしました。` : ""}`);
      renderTodo();
      renderHome();
      renderRoutines();
      navigate("todo");
    } catch (error) {
      showMessage("ルーチンの一括ToDo追加に失敗しました。", true);
    }
  }

  function renderWeekdayInputs() {
    elements.routineWeekdayList.innerHTML = "";
    WEEKDAYS.forEach((day) => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = day.value;
      checkbox.name = "routine-weekday";
      label.append(checkbox, day.label);
      elements.routineWeekdayList.append(label);
    });
  }

  async function loadRoutineEditor() {
    populateRoutineCategorySelect([]);

    try {
      const routines = await window.TMTDB.getAllRoutines();
      populateRoutineCategorySelect(routines);

      if (!state.editingRoutineId) {
        state.editingRoutine = null;
        fillRoutineForm(createDefaultRoutine());
        elements.routineEditorTitle.textContent = "ルーチンを作成";
        elements.routineDeleteButton.disabled = true;
        elements.routineToggleActiveButton.disabled = true;
        elements.routineHistorySection.hidden = true;
        return;
      }

      const routine = await window.TMTDB.getRoutine(state.editingRoutineId);

      if (!routine) {
        showMessage("ルーチンが見つかりません。", true);
        navigate("routines");
        return;
      }

      state.editingRoutine = routine;
      fillRoutineForm(routine);
      elements.routineEditorTitle.textContent = "ルーチンを編集";
      elements.routineDeleteButton.disabled = false;
      elements.routineToggleActiveButton.disabled = false;
      elements.routineToggleActiveButton.textContent = routine.isActive ? "無効化" : "有効化";
      await renderRoutineHistory(routine.id);
    } catch (error) {
      showMessage("ルーチン編集画面の読み込みに失敗しました。", true);
    }
  }

  function populateRoutineCategorySelect(routines) {
    const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...routines.map((routine) => routine.category).filter(Boolean)]));
    elements.routineCategorySelect.innerHTML = "";

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      elements.routineCategorySelect.append(option);
    });
  }

  function createDefaultRoutine() {
    return {
      title: "",
      category: DEFAULT_CATEGORIES[0],
      description: "",
      repeatType: "daily",
      intervalDays: 7,
      daysOfWeek: [],
      dayOfMonth: new Date().getDate(),
      startDate: getTodayString(),
      endDate: "",
      lastDoneDate: "",
      nextDueDate: getTodayString(),
      defaultTime: "",
      isActive: true,
      autoCreateTodo: true
    };
  }

  function fillRoutineForm(routine) {
    elements.routineTitleInput.value = routine.title || "";
    elements.routineCategorySelect.value = DEFAULT_CATEGORIES.includes(routine.category) ? routine.category : "その他";
    elements.routineCategoryCustom.value = DEFAULT_CATEGORIES.includes(routine.category) ? "" : routine.category || "";
    elements.routineDescriptionInput.value = routine.description || "";
    elements.routineRepeatType.value = routine.repeatType || "daily";
    elements.routineNextDateInput.value = routine.nextDueDate || getTodayString();
    elements.routineEndDateInput.value = routine.endDate || "";
    elements.routineIntervalInput.value = routine.intervalDays || 7;
    elements.routineDayMonthInput.value = routine.dayOfMonth || 1;
    elements.routineTimeInput.value = routine.defaultTime || "";
    elements.routineLastDoneInput.value = routine.lastDoneDate || "";
    elements.routineActiveInput.checked = routine.isActive !== false;
    elements.routineAutoTodoInput.checked = routine.autoCreateTodo === true;
    document.querySelectorAll("input[name='routine-weekday']").forEach((checkbox) => {
      checkbox.checked = Array.isArray(routine.daysOfWeek) && routine.daysOfWeek.includes(checkbox.value);
    });
    syncRoutineRepeatFields();
  }

  function syncRoutineRepeatFields() {
    const repeatType = elements.routineRepeatType.value;
    elements.routineIntervalGroup.hidden = repeatType !== "everyNDays";
    elements.routineWeeklyGroup.hidden = repeatType !== "weekly";
    elements.routineMonthlyGroup.hidden = repeatType !== "monthly";
  }

  async function handleSaveRoutine(event) {
    event.preventDefault();
    const routine = collectRoutineForm();

    if (!routine) {
      return;
    }

    try {
      const savedRoutine = await window.TMTDB.saveRoutine({
        ...state.editingRoutine,
        ...routine
      });
      state.editingRoutine = savedRoutine;
      state.editingRoutineId = savedRoutine.id;
      if (savedRoutine.autoCreateTodo && savedRoutine.isActive && savedRoutine.nextDueDate) {
        const result = await addRoutineOccurrencesToTodos(savedRoutine);
        showMessage(`ルーチンを保存し、ToDoへ${result.added}件追加しました。${result.skipped ? `重複 ${result.skipped}件はスキップしました。` : ""}`);
        navigate("todo");
        return;
      }

      showMessage("ルーチンを保存しました。");
      navigate("routines");
    } catch (error) {
      showMessage("ルーチンの保存に失敗しました。", true);
    }
  }

  function collectRoutineForm() {
    const title = elements.routineTitleInput.value.trim();
    const category = elements.routineCategoryCustom.value.trim() || elements.routineCategorySelect.value || "その他";
    const repeatType = elements.routineRepeatType.value;
    const nextDueDate = elements.routineNextDateInput.value;
    const endDate = elements.routineEndDateInput.value || "";
    const intervalDays = Number(elements.routineIntervalInput.value || 1);
    const dayOfMonth = Number(elements.routineDayMonthInput.value || 1);
    const daysOfWeek = Array.from(document.querySelectorAll("input[name='routine-weekday']:checked")).map((input) => input.value);

    if (!title) {
      showMessage("ルーチン名を入力してください。", true);
      return null;
    }

    if (!nextDueDate) {
      showMessage("初回予定日 / 次回予定日を入力してください。", true);
      return null;
    }

    if (endDate && endDate < nextDueDate) {
      showMessage("終了日は開始日以降にしてください。", true);
      return null;
    }

    if (repeatType === "everyNDays" && (!Number.isFinite(intervalDays) || intervalDays < 1)) {
      showMessage("N日ごとは1以上で入力してください。", true);
      return null;
    }

    if (repeatType === "weekly" && !daysOfWeek.length) {
      showMessage("毎週ルーチンは曜日を選択してください。", true);
      return null;
    }

    if (repeatType === "monthly" && (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) {
      showMessage("毎月指定日は1から31で入力してください。", true);
      return null;
    }

    return {
      title,
      category,
      description: elements.routineDescriptionInput.value,
      repeatType,
      intervalDays,
      daysOfWeek,
      dayOfMonth,
      startDate: state.editingRoutine?.startDate || nextDueDate,
      endDate,
      lastDoneDate: elements.routineLastDoneInput.value || "",
      nextDueDate,
      defaultTime: elements.routineTimeInput.value || "",
      isActive: elements.routineActiveInput.checked,
      autoCreateTodo: elements.routineAutoTodoInput.checked
    };
  }

  async function toggleEditingRoutineActive() {
    if (!state.editingRoutine) {
      return;
    }

    try {
      state.editingRoutine = await window.TMTDB.saveRoutine({
        ...state.editingRoutine,
        isActive: !state.editingRoutine.isActive
      });
      fillRoutineForm(state.editingRoutine);
      elements.routineToggleActiveButton.textContent = state.editingRoutine.isActive ? "無効化" : "有効化";
      showMessage(state.editingRoutine.isActive ? "ルーチンを有効化しました。" : "ルーチンを無効化しました。");
    } catch (error) {
      showMessage("ルーチン状態の変更に失敗しました。", true);
    }
  }

  async function deleteEditingRoutine(event) {
    event?.preventDefault();
    event?.stopPropagation();

    if (state.isDeletingRoutine) {
      return;
    }

    let routine = state.editingRoutine;

    if (!routine && state.editingRoutineId) {
      routine = await window.TMTDB.getRoutine(state.editingRoutineId);
    }

    if (!routine) {
      showMessage("削除するルーチンが見つかりません。", true);
      navigate("routines");
      return;
    }

    try {
      state.isDeletingRoutine = true;
      elements.routineDeleteButton.disabled = true;
      elements.routineToggleActiveButton.disabled = true;

      const relatedTodos = await getTodosForRoutine(routine.id);
      const deleteRelatedTodos = relatedTodos.length > 0
        ? confirm(`このルーチンを削除しますか？\n\nこのルーチンから作成済みのToDoが${relatedTodos.length}件あります。これらも一緒に削除しますか？`)
        : confirm("このルーチンを削除しますか？");

      if (!deleteRelatedTodos) {
        return;
      }

      if (relatedTodos.length > 0) {
        await Promise.all(relatedTodos.map((todo) => window.TMTDB.deleteTodo(todo.id)));
      }

      await window.TMTDB.deleteRoutine(routine.id);
      state.editingRoutine = null;
      state.editingRoutineId = null;
      showMessage(relatedTodos.length > 0 ? `ルーチンと関連ToDo ${relatedTodos.length}件を削除しました。` : "ルーチンを削除しました。");
      navigate("routines");
    } catch (error) {
      showMessage("ルーチンの削除に失敗しました。", true);
    } finally {
      state.isDeletingRoutine = false;
      elements.routineDeleteButton.disabled = !state.editingRoutine;
      elements.routineToggleActiveButton.disabled = !state.editingRoutine;
    }
  }

  async function getTodosForRoutine(routineId) {
    const todos = await window.TMTDB.getAllTodos();
    return todos.filter((todo) => todo.routineId === routineId);
  }

  async function renderRoutineHistory(routineId) {
    const histories = await window.TMTDB.getRoutineHistories(routineId);
    elements.routineHistorySection.hidden = false;
    elements.routineHistoryList.innerHTML = "";

    if (!histories.length) {
      elements.routineHistoryList.append(createEmptyState("まだ実施履歴はありません。"));
      return;
    }

    histories.slice(0, 20).forEach((history) => {
      const item = document.createElement("div");
      item.className = "routine-history-item";
      item.textContent = history.doneDate;
      elements.routineHistoryList.append(item);
    });
  }

  function calculateNextDueDate(routine, doneDate) {
    if (routine.repeatType === "manual") {
      return routine.nextDueDate || "";
    }

    if (routine.repeatType === "daily") {
      return addDays(doneDate, 1);
    }

    if (routine.repeatType === "everyNDays") {
      return addDays(doneDate, Math.max(1, Number(routine.intervalDays || 1)));
    }

    if (routine.repeatType === "weekly") {
      return getNextWeeklyDate(doneDate, routine.daysOfWeek || []);
    }

    if (routine.repeatType === "monthly") {
      return getNextMonthlyDate(doneDate, Number(routine.dayOfMonth || 1));
    }

    return routine.nextDueDate || "";
  }

  function getNextWeeklyDate(doneDate, daysOfWeek) {
    const selected = daysOfWeek.length ? daysOfWeek : [WEEKDAYS[parseDate(doneDate).getDay()].value];

    for (let offset = 1; offset <= 14; offset += 1) {
      const candidate = parseDate(addDays(doneDate, offset));
      const weekday = WEEKDAYS[candidate.getDay()].value;
      if (selected.includes(weekday)) {
        return toDateString(candidate);
      }
    }

    return addDays(doneDate, 7);
  }

  function getNextMonthlyDate(doneDate, dayOfMonth) {
    const base = parseDate(doneDate);
    const targetDay = Math.min(31, Math.max(1, dayOfMonth));

    for (let offset = 1; offset <= 24; offset += 1) {
      const monthStart = new Date(base.getFullYear(), base.getMonth() + offset, 1);
      const daysInTargetMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      const candidate = new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(targetDay, daysInTargetMonth));
      if (candidate > base) {
        return toDateString(candidate);
      }
    }

    return addDays(doneDate, 30);
  }

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
        renderRoutines();
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

  function createEmptyState(text) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent = text;
    return div;
  }

  function createTitleFromBody(body) {
    const firstLine = body.trim().split(/\r?\n/).find(Boolean);
    return firstLine ? firstLine.slice(0, 30) : "無題メモ";
  }

  function showMessage(text, isError) {
    elements.message.textContent = text;
    elements.message.hidden = false;
    elements.message.classList.toggle("is-error", Boolean(isError));

    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => {
      elements.message.hidden = true;
    }, 3200);
  }

  function getTodayString() {
    const date = new Date();
    return toDateString(date);
  }

  function parseDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(dateString, amount) {
    const date = parseDate(dateString);
    date.setDate(date.getDate() + amount);
    return toDateString(date);
  }

  function buildDateString(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function getCompactDate() {
    return getTodayString().replaceAll("-", "");
  }

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(date);
  }

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
