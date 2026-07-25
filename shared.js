(function () {
  "use strict";

  const STATUS_LABELS = {
    todo: "未着手",
    doing: "対応中",
    done: "完了"
  };

  const state = {
    initialized: false,
    configured: false,
    client: null,
    session: null,
    membership: null,
    household: null,
    members: [],
    todos: [],
    invites: [],
    channel: null,
    refreshTimer: null,
    sdkFailed: false,
    syncKind: "idle",
    editingTodo: null,
    detailTodoId: null,
    displayMode: "compact",
    personalTodosToShare: [],
    busy: false
  };

  const elements = {};

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    cacheElements();
    restoreDisplayMode();
    bindEvents();
    setDefaultDates();
    prefillInviteFromUrl();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.session && state.household && navigator.onLine) {
        refreshSharedData({ silent: true });
      }
    });

    const config = window.TMT_SUPABASE_CONFIG || {};
    state.configured = isValidConfig(config);

    if (!state.configured) {
      renderState();
      return;
    }

    const sdkScript = document.getElementById("supabase-sdk");
    if (sdkScript) {
      sdkScript.addEventListener("load", initializeSupabaseClient, { once: true });
      sdkScript.addEventListener("error", () => {
        state.sdkFailed = true;
        renderState();
      }, { once: true });
    }
    initializeSupabaseClient();
  }

  function initializeSupabaseClient() {
    if (state.client || !state.configured || !window.supabase || typeof window.supabase.createClient !== "function") {
      renderState();
      return;
    }

    const config = window.TMT_SUPABASE_CONFIG;

    state.client = window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    state.client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => applySession(session), 0);
    });

    state.client.auth.getSession().then(({ data, error }) => {
      if (error) {
        setSyncState("error", "同期失敗");
        emitMessage("ログイン状態を確認できませんでした。", true);
        return;
      }
      applySession(data.session);
    });
  }

  function cacheElements() {
    [
      "shared-config-panel", "shared-config-heading", "shared-config-detail", "shared-signed-out", "shared-no-household", "shared-household",
      "shared-auth-form", "shared-auth-email", "shared-auth-password", "shared-sign-in",
      "shared-sign-up", "shared-sign-out-setup", "shared-create-form", "shared-household-name", "shared-owner-name",
      "shared-join-form", "shared-invite-code", "shared-member-name", "shared-account-email",
      "shared-sign-out", "shared-household-title", "shared-members-label", "shared-sync-status",
      "shared-invite-panel", "shared-create-invite", "shared-invite-result", "shared-invite-code-output",
      "shared-invite-link-output", "shared-copy-invite", "shared-active-invites", "shared-todo-form",
      "shared-form-title", "shared-title-input", "shared-date-input", "shared-time-input",
      "shared-assignee-input", "shared-status-input", "shared-priority-input", "shared-submit",
      "shared-edit-cancel", "shared-display-mode", "shared-filter-panel", "shared-filter-assignee",
      "shared-filter-self", "shared-filter-priority", "shared-filter-completed",
      "shared-todo-list", "shared-export", "shared-leave", "shared-delete-household",
      "shared-todo-detail-dialog", "shared-todo-detail-form", "shared-detail-close",
      "shared-detail-title", "shared-detail-date", "shared-detail-time", "shared-detail-assignee",
      "shared-detail-status", "shared-detail-priority", "shared-detail-meta",
      "shared-detail-complete", "shared-detail-delete",
      "personal-share-dialog", "personal-share-summary", "personal-share-assignee",
      "personal-share-confirm", "personal-share-cancel"
    ].forEach((id) => {
      elements[toCamelCase(id)] = document.getElementById(id);
    });
  }

  function bindEvents() {
    elements.sharedAuthForm.addEventListener("submit", (event) => {
      event.preventDefault();
      signIn();
    });
    elements.sharedSignIn.addEventListener("click", signIn);
    elements.sharedSignUp.addEventListener("click", signUp);
    elements.sharedSignOut.addEventListener("click", signOut);
    elements.sharedSignOutSetup.addEventListener("click", signOut);
    elements.sharedCreateForm.addEventListener("submit", createHousehold);
    elements.sharedJoinForm.addEventListener("submit", joinHousehold);
    elements.sharedCreateInvite.addEventListener("click", createInvite);
    elements.sharedCopyInvite.addEventListener("click", copyInviteLink);
    elements.sharedActiveInvites.addEventListener("click", handleInviteAction);
    elements.sharedTodoForm.addEventListener("submit", saveSharedTodo);
    elements.sharedEditCancel.addEventListener("click", cancelSharedEdit);
    elements.sharedTodoList.addEventListener("click", handleTodoAction);
    elements.sharedTodoList.addEventListener("keydown", handleTodoKeydown);
    elements.sharedDisplayMode.addEventListener("change", changeDisplayMode);
    elements.sharedFilterAssignee.addEventListener("change", renderTodoList);
    elements.sharedFilterSelf.addEventListener("change", renderTodoList);
    elements.sharedFilterPriority.addEventListener("change", renderTodoList);
    elements.sharedFilterCompleted.addEventListener("change", renderTodoList);
    elements.sharedTodoDetailForm.addEventListener("submit", saveTodoDetail);
    elements.sharedDetailClose.addEventListener("click", closeTodoDetail);
    elements.sharedDetailComplete.addEventListener("click", toggleTodoDetailComplete);
    elements.sharedDetailDelete.addEventListener("click", deleteTodoFromDetail);
    elements.sharedTodoDetailDialog.addEventListener("cancel", closeTodoDetail);
    elements.sharedExport.addEventListener("click", exportSharedTodos);
    elements.sharedLeave.addEventListener("click", leaveHousehold);
    elements.sharedDeleteHousehold.addEventListener("click", deleteHousehold);
    elements.personalShareConfirm.addEventListener("click", confirmPersonalShare);
    elements.personalShareCancel.addEventListener("click", closePersonalShareDialog);
  }

  function restoreDisplayMode() {
    try {
      const saved = localStorage.getItem("tmt-shared-display-mode");
      state.displayMode = saved === "detail" ? "detail" : "compact";
    } catch (_error) {
      state.displayMode = "compact";
    }
    elements.sharedDisplayMode.value = state.displayMode;
  }

  function changeDisplayMode() {
    state.displayMode = elements.sharedDisplayMode.value === "detail" ? "detail" : "compact";
    try {
      localStorage.setItem("tmt-shared-display-mode", state.displayMode);
    } catch (_error) {
      // 保存できない環境でも、現在の画面では表示切り替えを利用できる。
    }
    renderTodoList();
  }

  function isValidConfig(config) {
    return typeof config.url === "string"
      && /^https:\/\//.test(config.url)
      && !config.url.includes("YOUR_SUPABASE")
      && typeof config.anonKey === "string"
      && config.anonKey.length > 20
      && !config.anonKey.includes("YOUR_SUPABASE");
  }

  async function applySession(session) {
    const previousUserId = state.session && state.session.user ? state.session.user.id : null;
    const nextUserId = session && session.user ? session.user.id : null;
    state.session = session;

    if (!nextUserId) {
      await stopRealtime();
      state.membership = null;
      state.household = null;
      state.members = [];
      state.todos = [];
      state.invites = [];
      state.editingTodo = null;
      if (elements.sharedTodoDetailDialog && elements.sharedTodoDetailDialog.open) closeTodoDetail();
      renderState();
      setSyncState("idle", "未ログイン");
      return;
    }

    if (previousUserId !== nextUserId) {
      state.membership = null;
      state.household = null;
      state.todos = [];
    }

    await refreshAccountState();
  }

  async function refreshAccountState() {
    if (!state.client || !state.session) {
      renderState();
      return;
    }

    setSyncState(navigator.onLine ? "syncing" : "offline", navigator.onLine ? "同期中" : "オフライン");

    try {
      const { data: membership, error: membershipError } = await state.client
        .from("household_members")
        .select("household_id,user_id,display_name,role,joined_at")
        .eq("user_id", state.session.user.id)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        await stopRealtime();
        state.membership = null;
        state.household = null;
        state.members = [];
        state.todos = [];
        state.invites = [];
        renderState();
        setSyncState("idle", "未接続");
        return;
      }

      const { data: household, error: householdError } = await state.client
        .from("households")
        .select("id,name,owner_user_id,created_at")
        .eq("id", membership.household_id)
        .single();

      if (householdError) throw householdError;

      const householdChanged = !state.household || state.household.id !== household.id;
      state.membership = membership;
      state.household = household;
      renderState();
      await refreshSharedData({ silent: true });

      if (householdChanged || !state.channel) {
        await startRealtime();
      }
    } catch (error) {
      console.error(error);
      renderState();
      setSyncState("error", "同期失敗");
      emitMessage("共有データを読み込めませんでした。Supabaseの設定と通信状態を確認してください。", true);
    }
  }

  async function refreshSharedData(options = {}) {
    if (!state.client || !state.household || !state.session) return;
    if (!navigator.onLine) {
      setSyncState("offline", "オフライン");
      return;
    }

    if (!options.silent) setSyncState("syncing", "同期中");

    try {
      const membersRequest = state.client
        .from("household_members")
        .select("household_id,user_id,display_name,role,joined_at")
        .eq("household_id", state.household.id)
        .order("joined_at", { ascending: true });

      const todosRequest = state.client
        .from("shared_todos")
        .select("id,household_id,title,due_date,due_time,status,assignee_user_id,is_priority,created_by,created_at,updated_at")
        .eq("household_id", state.household.id)
        .order("is_priority", { ascending: false })
        .order("due_date", { ascending: true })
        .order("due_time", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      const requests = [membersRequest, todosRequest];
      if (isOwner()) {
        requests.push(
          state.client
            .from("household_invites")
            .select("id,household_id,created_by,created_at,expires_at,used_at,used_by,revoked_at")
            .eq("household_id", state.household.id)
            .is("used_at", null)
            .is("revoked_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
        );
      }

      const results = await Promise.all(requests);
      const firstError = results.find((result) => result.error);
      if (firstError) throw firstError.error;

      state.members = results[0].data || [];
      state.todos = results[1].data || [];
      state.invites = results[2] ? results[2].data || [] : [];
      renderHousehold();
      setSyncState("connected", "接続済み");
    } catch (error) {
      console.error(error);
      setSyncState("error", "同期失敗");
      emitMessage("共有データを同期できませんでした。", true);
    }
  }

  async function startRealtime() {
    await stopRealtime();
    if (!state.client || !state.household || !state.session || !navigator.onLine) return;

    setSyncState("syncing", "接続中…");

    try {
      await state.client.realtime.setAuth();
      const topic = `household:${state.household.id}`;
      state.channel = state.client
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "shared_todos_changed" }, scheduleRealtimeRefresh)
        .on("broadcast", { event: "household_members_changed" }, scheduleAccountRefresh)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setSyncState("connected", "接続済み");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setSyncState("error", "同期失敗");
          } else if (status === "CLOSED" && navigator.onLine) {
            setSyncState("error", "同期失敗");
          }
        });
    } catch (error) {
      console.error(error);
      setSyncState("error", "同期失敗");
    }
  }

  async function stopRealtime() {
    if (state.refreshTimer) {
      window.clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.client && state.channel) {
      const channel = state.channel;
      state.channel = null;
      await state.client.removeChannel(channel);
    }
  }

  function scheduleRealtimeRefresh() {
    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
    setSyncState("syncing", "同期中");
    state.refreshTimer = window.setTimeout(() => {
      state.refreshTimer = null;
      refreshSharedData({ silent: true });
    }, 160);
  }

  function scheduleAccountRefresh() {
    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
    setSyncState("syncing", "同期中");
    state.refreshTimer = window.setTimeout(() => {
      state.refreshTimer = null;
      refreshAccountState();
    }, 160);
  }

  function handleOnline() {
    if (!state.session || !state.household) return;
    setSyncState("syncing", "再接続中…");
    refreshSharedData({ silent: true }).then(startRealtime);
  }

  function handleOffline() {
    setSyncState("offline", "オフライン");
  }

  function render() {
    if (!state.initialized) init();
    renderState();
    if (state.session && state.household && navigator.onLine) {
      refreshSharedData({ silent: true });
    }
  }

  function renderState() {
    const signedIn = Boolean(state.session && state.session.user);
    const hasHousehold = Boolean(state.household && state.membership);
    const ready = state.configured && Boolean(state.client);

    elements.sharedConfigPanel.hidden = ready;
    elements.sharedSignedOut.hidden = !ready || signedIn;
    elements.sharedNoHousehold.hidden = !ready || !signedIn || hasHousehold;
    elements.sharedHousehold.hidden = !ready || !signedIn || !hasHousehold;

    if (!ready) {
      if (!state.configured) {
        elements.sharedConfigHeading.textContent = "Supabaseの接続設定が必要です";
        elements.sharedConfigDetail.innerHTML = "<code>supabase/schema.sql</code>をSupabaseへ適用し、<code>supabase-config.js</code>にProject URLとanon key（またはpublishable key）を設定してください。";
      } else if (!navigator.onLine) {
        elements.sharedConfigHeading.textContent = "オフラインです";
        elements.sharedConfigDetail.textContent = "共有機能はネット接続後に読み込まれます。個人用ToDo・メモはオフラインでも利用できます。";
        setSyncState("offline", "オフライン");
      } else if (state.sdkFailed) {
        elements.sharedConfigHeading.textContent = "共有機能を読み込めませんでした";
        elements.sharedConfigDetail.textContent = "ネット接続またはCDNへのアクセスを確認して、画面を再読み込みしてください。";
        setSyncState("error", "同期失敗");
      } else {
        elements.sharedConfigHeading.textContent = "共有機能を読み込んでいます";
        elements.sharedConfigDetail.textContent = "しばらくお待ちください。読み込みが続く場合はネット接続を確認してください。";
        setSyncState("syncing", "接続中…");
      }
    }

    if (signedIn) {
      elements.sharedAccountEmail.textContent = state.session.user.email || "ログイン中";
    }
    if (hasHousehold) renderHousehold();
  }

  function renderHousehold() {
    if (!state.household || !state.membership) return;

    elements.sharedHouseholdTitle.textContent = state.household.name;
    elements.sharedMembersLabel.textContent = state.members.length
      ? state.members.map((member) => member.user_id === currentUserId() ? `自分（${member.display_name}）` : member.display_name).join("・")
      : state.membership.display_name;
    elements.sharedInvitePanel.hidden = !isOwner();
    elements.sharedDeleteHousehold.hidden = !isOwner();
    elements.sharedLeave.hidden = isOwner();

    populateMemberSelect(elements.sharedAssigneeInput, true);
    populateMemberSelect(elements.sharedFilterAssignee, true, true);
    populateMemberSelect(elements.personalShareAssignee, true);
    renderInvites();
    renderTodoList();
  }

  function populateMemberSelect(select, includeUnassigned, includeAll = false) {
    const previous = select.value;
    select.innerHTML = "";

    if (includeAll) appendOption(select, "all", "すべての担当者");
    if (includeUnassigned) appendOption(select, includeAll ? "unassigned" : "", "未割り当て");

    const ownMember = state.members.find((member) => member.user_id === currentUserId());
    if (ownMember) appendOption(select, ownMember.user_id, `自分（${ownMember.display_name}）`);

    state.members
      .filter((member) => member.user_id !== currentUserId())
      .forEach((member) => appendOption(select, member.user_id, member.display_name));

    if (Array.from(select.options).some((option) => option.value === previous)) {
      select.value = previous;
    } else if (includeAll) {
      select.value = "all";
    } else {
      select.value = "";
    }
  }

  function renderInvites() {
    elements.sharedActiveInvites.innerHTML = "";
    if (!isOwner()) return;

    if (!state.invites.length) {
      const text = document.createElement("p");
      text.className = "muted shared-small-text";
      text.textContent = "有効な招待はありません。新しい招待を発行できます。";
      elements.sharedActiveInvites.append(text);
      return;
    }

    state.invites.forEach((invite) => {
      const row = document.createElement("div");
      row.className = "shared-invite-row";
      const label = document.createElement("span");
      label.textContent = `有効期限: ${formatDateTime(invite.expires_at)}`;
      const button = createButton("無効にする", "danger-button compact");
      button.dataset.inviteId = invite.id;
      row.append(label, button);
      elements.sharedActiveInvites.append(row);
    });
  }

  function renderTodoList() {
    elements.sharedTodoList.innerHTML = "";
    if (!state.household) return;

    const assigneeFilter = elements.sharedFilterAssignee.value || "all";
    const selfOnly = elements.sharedFilterSelf.checked;
    const priorityOnly = elements.sharedFilterPriority.checked;
    const includeDone = elements.sharedFilterCompleted.checked;
    const filtered = state.todos.filter((todo) => {
      if (!includeDone && todo.status === "done") return false;
      if (selfOnly && todo.assignee_user_id !== currentUserId()) return false;
      if (priorityOnly && !todo.is_priority) return false;
      if (!selfOnly && assigneeFilter === "unassigned" && todo.assignee_user_id !== null) return false;
      if (!selfOnly && assigneeFilter !== "all" && assigneeFilter !== "unassigned" && todo.assignee_user_id !== assigneeFilter) return false;
      return true;
    }).sort(compareSharedTodos);

    elements.sharedTodoList.dataset.displayMode = state.displayMode;

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.todos.length ? "条件に一致する共有家事はありません。" : "共有家事はまだありません。";
      elements.sharedTodoList.append(empty);
      syncOpenTodoDetail();
      return;
    }

    filtered.forEach((todo) => elements.sharedTodoList.append(createTodoCard(todo)));
    syncOpenTodoDetail();
  }

  function compareSharedTodos(a, b) {
    const completionOrder = Number(a.status === "done") - Number(b.status === "done");
    if (completionOrder !== 0) return completionOrder;

    const priorityOrder = Number(Boolean(b.is_priority)) - Number(Boolean(a.is_priority));
    if (priorityOrder !== 0) return priorityOrder;

    const dateOrder = String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31"));
    if (dateOrder !== 0) return dateOrder;

    const timeOrder = String(a.due_time || "99:99").localeCompare(String(b.due_time || "99:99"));
    if (timeOrder !== 0) return timeOrder;

    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  }

  function createTodoCard(todo) {
    const card = document.createElement("article");
    card.className = `shared-todo-card display-${state.displayMode} ${todo.status === "done" ? "is-done" : ""} ${todo.is_priority ? "is-priority" : ""}`;
    card.dataset.sharedTodoId = todo.id;

    const content = document.createElement("div");
    content.className = "shared-todo-content shared-todo-open";
    content.tabIndex = 0;
    content.setAttribute("role", "button");
    content.setAttribute("aria-label", `${todo.title}の詳細を開く`);
    content.dataset.sharedAction = "open";

    const heading = document.createElement("div");
    heading.className = "shared-todo-heading";
    const title = document.createElement("h3");
    title.textContent = todo.title;

    const badges = document.createElement("div");
    badges.className = "shared-todo-badges";
    const assignment = getAssigneePresentation(todo.assignee_user_id);
    const assigneeBadge = document.createElement("span");
    assigneeBadge.className = `assignee-badge ${assignment.className}`;
    assigneeBadge.textContent = assignment.label;
    const statusBadge = document.createElement("span");
    statusBadge.className = `status-badge status-${todo.status}`;
    statusBadge.textContent = STATUS_LABELS[todo.status] || STATUS_LABELS.todo;
    badges.append(assigneeBadge, statusBadge);
    heading.append(title, badges);

    const date = document.createElement("p");
    date.className = "shared-todo-date";
    const priorityText = todo.is_priority ? "　★ 優先" : "";
    date.textContent = `${formatDate(todo.due_date)}${todo.due_time ? ` ${String(todo.due_time).slice(0, 5)}` : ""}${priorityText}`;

    const meta = document.createElement("p");
    meta.className = "shared-todo-meta";
    meta.textContent = `作成: ${memberName(todo.created_by)} / ${formatDateTime(todo.created_at)}　更新: ${formatDateTime(todo.updated_at)}`;

    content.append(heading, date, meta);

    const complete = createButton(todo.status === "done" ? "戻す" : "完了", todo.status === "done"
      ? "secondary-button compact shared-complete-button"
      : "primary-button compact shared-complete-button");
    complete.dataset.sharedAction = todo.status === "done" ? "reopen" : "complete";
    complete.setAttribute("aria-label", todo.status === "done" ? `${todo.title}を未着手に戻す` : `${todo.title}を完了にする`);

    card.append(content, complete);
    return card;
  }

  function populateCardAssigneeSelect(select, selectedValue) {
    select.innerHTML = "";
    appendOption(select, "", "未割り当て");
    const ownMember = state.members.find((member) => member.user_id === currentUserId());
    if (ownMember) appendOption(select, ownMember.user_id, `自分（${ownMember.display_name}）`);
    state.members
      .filter((member) => member.user_id !== currentUserId())
      .forEach((member) => appendOption(select, member.user_id, member.display_name));
    select.value = selectedValue || "";
  }

  async function signIn() {
    const email = elements.sharedAuthEmail.value.trim();
    const password = elements.sharedAuthPassword.value;
    if (!email || !password) {
      emitMessage("メールアドレスとパスワードを入力してください。", true);
      return;
    }

    await runBusy(async () => {
      const { error } = await state.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      elements.sharedAuthPassword.value = "";
      emitMessage("ログインしました。");
    }, "ログインできませんでした。メールアドレスとパスワードを確認してください。");
  }

  async function signUp() {
    const email = elements.sharedAuthEmail.value.trim();
    const password = elements.sharedAuthPassword.value;
    if (!email || password.length < 6) {
      emitMessage("メールアドレスと6文字以上のパスワードを入力してください。", true);
      return;
    }

    await runBusy(async () => {
      const redirectUrl = `${location.origin}${location.pathname}#shared`;
      const { data, error } = await state.client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl }
      });
      if (error) throw error;
      elements.sharedAuthPassword.value = "";
      emitMessage(data.session ? "アカウントを作成しました。" : "確認メールを送信しました。メール内のリンクを開いてください。");
    }, "アカウントを作成できませんでした。入力内容を確認してください。");
  }

  async function signOut() {
    if (!state.client) return;
    await runBusy(async () => {
      await stopRealtime();
      const { error } = await state.client.auth.signOut();
      if (error) throw error;
      emitMessage("ログアウトしました。");
    }, "ログアウトできませんでした。");
  }

  async function createHousehold(event) {
    event.preventDefault();
    const name = elements.sharedHouseholdName.value.trim();
    const displayName = elements.sharedOwnerName.value.trim();
    if (!name || !displayName) {
      emitMessage("グループ名と自分の表示名を入力してください。", true);
      return;
    }

    await runBusy(async () => {
      const { data, error } = await state.client.rpc("create_household", {
        p_name: name,
        p_display_name: displayName
      });
      if (error || !data) throw error || new Error("Household was not created");
      elements.sharedCreateForm.reset();
      await refreshAccountState();
      emitMessage("家族グループを作成しました。");
    }, "家族グループを作成できませんでした。");
  }

  async function joinHousehold(event) {
    event.preventDefault();
    const code = normalizeInviteInput(elements.sharedInviteCode.value);
    const displayName = elements.sharedMemberName.value.trim();
    if (!code || !displayName) {
      emitMessage("招待コードと表示名を入力してください。", true);
      return;
    }

    await runBusy(async () => {
      const { data, error } = await state.client.rpc("join_household_by_invite", {
        p_invite_code: code,
        p_display_name: displayName
      });
      if (error || !data) throw error || new Error("Household was not joined");
      clearInviteFromUrl();
      elements.sharedJoinForm.reset();
      await refreshAccountState();
      emitMessage("家族グループに参加しました。");
    }, "招待に参加できませんでした。コードの期限・使用状況を確認してください。");
  }

  async function createInvite() {
    if (!isOwner()) return;
    await runBusy(async () => {
      const { data, error } = await state.client.rpc("create_household_invite", {
        p_household_id: state.household.id,
        p_valid_hours: 72
      });
      if (error) throw error;
      const invite = data && data[0];
      if (!invite) throw new Error("Invite was not returned");

      const url = new URL(location.href);
      url.searchParams.set("invite", invite.invite_code);
      url.hash = "shared";
      elements.sharedInviteCodeOutput.value = invite.invite_code;
      elements.sharedInviteLinkOutput.value = url.toString();
      elements.sharedInviteResult.hidden = false;
      await refreshSharedData({ silent: true });
      emitMessage("72時間有効・1回限りの招待を発行しました。");
    }, "招待を発行できませんでした。");
  }

  async function copyInviteLink() {
    const text = elements.sharedInviteLinkOutput.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      emitMessage("招待リンクをコピーしました。");
    } catch (_error) {
      elements.sharedInviteLinkOutput.select();
      emitMessage("招待リンクを選択しました。端末のコピー操作を使ってください。");
    }
  }

  async function handleInviteAction(event) {
    const button = event.target.closest("[data-invite-id]");
    if (!button) return;
    if (!confirm("この招待を無効にしますか？ 無効にすると、このコードでは参加できなくなります。")) return;

    await runBusy(async () => {
      const { data, error } = await state.client.rpc("revoke_household_invite", {
        p_invite_id: button.dataset.inviteId
      });
      if (error || !data) throw error || new Error("Invite was not revoked");
      elements.sharedInviteResult.hidden = true;
      await refreshSharedData({ silent: true });
      emitMessage("招待を無効にしました。");
    }, "招待を無効にできませんでした。");
  }

  async function saveSharedTodo(event) {
    event.preventDefault();
    if (!canSaveSharedData()) return;

    const title = elements.sharedTitleInput.value.trim();
    const dueDate = elements.sharedDateInput.value;
    if (!title || !dueDate) {
      emitMessage("内容と予定日を入力してください。", true);
      return;
    }

    const values = {
      title,
      due_date: dueDate,
      due_time: elements.sharedTimeInput.value || null,
      status: elements.sharedStatusInput.value,
      assignee_user_id: elements.sharedAssigneeInput.value || null,
      is_priority: elements.sharedPriorityInput.checked
    };

    await saveMutation(async () => {
      let result;
      if (state.editingTodo) {
        result = await state.client
          .from("shared_todos")
          .update(values)
          .eq("id", state.editingTodo.id)
          .select("id")
          .maybeSingle();
      } else {
        result = await state.client
          .from("shared_todos")
          .insert({
            ...values,
            household_id: state.household.id,
            created_by: currentUserId()
          })
          .select("id")
          .single();
      }
      if (result.error || !result.data) throw result.error || new Error("Shared todo was not saved");
      const wasEditing = Boolean(state.editingTodo);
      resetSharedForm();
      await refreshSharedData({ silent: true });
      emitMessage(wasEditing ? "共有家事を更新しました。" : "共有家事を追加しました。");
    });
  }

  function handleTodoAction(event) {
    const button = event.target.closest("[data-shared-action]");
    const card = event.target.closest("[data-shared-todo-id]");
    if (!card) return;
    const todo = state.todos.find((item) => item.id === card.dataset.sharedTodoId);
    if (!todo) return;

    if (!button) {
      openTodoDetail(todo);
      return;
    }

    event.stopPropagation();
    const action = button.dataset.sharedAction;
    if (action === "open") {
      openTodoDetail(todo);
    } else if (action === "complete" || action === "reopen") {
      updateSharedTodo(todo.id, { status: action === "complete" ? "done" : "todo" });
    }
  }

  function handleTodoKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-shared-todo-id]");
    if (!card || !event.target.closest(".shared-todo-open")) return;
    const todo = state.todos.find((item) => item.id === card.dataset.sharedTodoId);
    if (!todo) return;
    event.preventDefault();
    openTodoDetail(todo);
  }

  function openTodoDetail(todo) {
    state.detailTodoId = todo.id;
    elements.sharedDetailTitle.value = todo.title;
    elements.sharedDetailDate.value = todo.due_date || "";
    elements.sharedDetailTime.value = todo.due_time ? String(todo.due_time).slice(0, 5) : "";
    populateCardAssigneeSelect(elements.sharedDetailAssignee, todo.assignee_user_id);
    elements.sharedDetailStatus.value = todo.status;
    elements.sharedDetailPriority.checked = Boolean(todo.is_priority);
    elements.sharedDetailMeta.textContent = `作成者: ${memberName(todo.created_by)}　作成: ${formatDateTime(todo.created_at)}　更新: ${formatDateTime(todo.updated_at)}`;
    elements.sharedDetailComplete.textContent = todo.status === "done" ? "未着手に戻す" : "完了にする";

    if (typeof elements.sharedTodoDetailDialog.showModal === "function") {
      if (!elements.sharedTodoDetailDialog.open) elements.sharedTodoDetailDialog.showModal();
    } else {
      elements.sharedTodoDetailDialog.setAttribute("open", "");
    }
  }

  function closeTodoDetail(event) {
    if (event && event.type === "cancel") event.preventDefault();
    state.detailTodoId = null;
    if (typeof elements.sharedTodoDetailDialog.close === "function" && elements.sharedTodoDetailDialog.open) {
      elements.sharedTodoDetailDialog.close();
    } else {
      elements.sharedTodoDetailDialog.removeAttribute("open");
    }
  }

  function syncOpenTodoDetail() {
    if (!state.detailTodoId || !elements.sharedTodoDetailDialog.open) return;
    const todo = state.todos.find((item) => item.id === state.detailTodoId);
    if (!todo) {
      closeTodoDetail();
      return;
    }
    openTodoDetail(todo);
  }

  async function saveTodoDetail(event) {
    event.preventDefault();
    const todo = state.todos.find((item) => item.id === state.detailTodoId);
    if (!todo) {
      emitMessage("共有家事が見つかりません。", true);
      closeTodoDetail();
      return;
    }

    const title = elements.sharedDetailTitle.value.trim();
    const dueDate = elements.sharedDetailDate.value;
    if (!title || !dueDate) {
      emitMessage("内容と予定日を入力してください。", true);
      return;
    }

    const saved = await updateSharedTodo(todo.id, {
      title,
      due_date: dueDate,
      due_time: elements.sharedDetailTime.value || null,
      assignee_user_id: elements.sharedDetailAssignee.value || null,
      status: elements.sharedDetailStatus.value,
      is_priority: elements.sharedDetailPriority.checked
    });
    if (saved) closeTodoDetail();
  }

  async function toggleTodoDetailComplete() {
    const todo = state.todos.find((item) => item.id === state.detailTodoId);
    if (!todo) return;
    await updateSharedTodo(todo.id, { status: todo.status === "done" ? "todo" : "done" });
  }

  async function deleteTodoFromDetail() {
    const todo = state.todos.find((item) => item.id === state.detailTodoId);
    if (!todo) return;
    const deleted = await deleteSharedTodo(todo);
    if (deleted) closeTodoDetail();
  }

  async function updateSharedTodo(id, values) {
    if (!canSaveSharedData()) {
      await refreshSharedData({ silent: true });
      return;
    }
    return saveMutation(async () => {
      const { data, error } = await state.client
        .from("shared_todos")
        .update(values)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error || !data) throw error || new Error("Shared todo was not updated");
      await refreshSharedData({ silent: true });
      emitMessage("共有家事を更新しました。");
    });
  }

  async function deleteSharedTodo(todo) {
    if (!confirm(`共有家事「${todo.title}」を削除しますか？ この操作は家族全員に反映され、元に戻せません。`)) return false;
    if (!canSaveSharedData()) return false;
    return saveMutation(async () => {
      const { data, error } = await state.client
        .from("shared_todos")
        .delete()
        .eq("id", todo.id)
        .select("id")
        .maybeSingle();
      if (error || !data) throw error || new Error("Shared todo was not deleted");
      if (state.editingTodo && state.editingTodo.id === todo.id) resetSharedForm();
      await refreshSharedData({ silent: true });
      emitMessage("共有家事を削除しました。");
    });
  }

  function startSharedEdit(todo) {
    state.editingTodo = todo;
    elements.sharedFormTitle.textContent = "共有家事を編集";
    elements.sharedTitleInput.value = todo.title;
    elements.sharedDateInput.value = todo.due_date;
    elements.sharedTimeInput.value = todo.due_time ? String(todo.due_time).slice(0, 5) : "";
    elements.sharedStatusInput.value = todo.status;
    elements.sharedAssigneeInput.value = todo.assignee_user_id || "";
    elements.sharedPriorityInput.checked = todo.is_priority;
    elements.sharedSubmit.textContent = "変更を保存";
    elements.sharedEditCancel.hidden = false;
    elements.sharedTodoForm.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.sharedTitleInput.focus();
  }

  function cancelSharedEdit() {
    resetSharedForm();
  }

  function resetSharedForm() {
    state.editingTodo = null;
    elements.sharedTodoForm.reset();
    elements.sharedFormTitle.textContent = "共有家事を追加";
    elements.sharedDateInput.value = getTodayString();
    elements.sharedStatusInput.value = "todo";
    elements.sharedAssigneeInput.value = "";
    elements.sharedSubmit.textContent = "共有家事を追加";
    elements.sharedEditCancel.hidden = true;
  }

  async function exportSharedTodos() {
    if (!state.household) return;
    await refreshSharedData({ silent: true });
    const exported = {
      app: "今日メモTodo 共有家事",
      version: 1,
      household: { id: state.household.id, name: state.household.name },
      exportedAt: new Date().toISOString(),
      sharedTodos: state.todos
    };
    downloadJson(exported, `shared-household-todos-${getTodayString().replaceAll("-", "")}.json`);
    emitMessage("共有家事をJSON出力しました。クラウド上のデータは変更していません。");
  }

  async function leaveHousehold() {
    if (!state.household || isOwner()) return;
    const ok = confirm(`「${state.household.name}」から脱退しますか？\n\n脱退後は共有家事を閲覧・変更できません。共有家事そのものはグループに残ります。`);
    if (!ok) return;

    await runBusy(async () => {
      const { data, error } = await state.client.rpc("leave_household", { p_household_id: state.household.id });
      if (error || !data) throw error || new Error("Household was not left");
      await stopRealtime();
      await refreshAccountState();
      emitMessage("家族グループから脱退しました。");
    }, "家族グループから脱退できませんでした。");
  }

  async function deleteHousehold() {
    if (!state.household || !isOwner()) return;
    const householdName = state.household.name;
    const ok = confirm(`家族グループ「${householdName}」を削除しますか？\n\n次のデータが全員から削除され、元に戻せません。\n・すべての共有家事\n・メンバー情報\n・未使用の招待\n\n個人用ToDo・メモは削除されません。`);
    if (!ok) return;
    const typed = prompt(`確認のため、グループ名「${householdName}」を入力してください。`);
    if (typed !== householdName) {
      emitMessage("グループ名が一致しないため、削除を中止しました。", true);
      return;
    }

    await runBusy(async () => {
      const { data, error } = await state.client.rpc("delete_household", { p_household_id: state.household.id });
      if (error || !data) throw error || new Error("Household was not deleted");
      await stopRealtime();
      await refreshAccountState();
      emitMessage("家族グループと共有家事を削除しました。個人データは変更していません。");
    }, "家族グループを削除できませんでした。");
  }

  function openPersonalShareDialog(todos) {
    const validTodos = (Array.isArray(todos) ? todos : [todos]).filter(Boolean);
    if (!validTodos.length) return;

    if (!state.configured || !state.client || !state.session || !state.household) {
      emitMessage("共有家事を使うには、共有画面でログインして家族グループに参加してください。", true);
      location.hash = "shared";
      return;
    }

    state.personalTodosToShare = validTodos;
    populateMemberSelect(elements.personalShareAssignee, true);
    elements.personalShareSummary.textContent = validTodos.length === 1
      ? `「${validTodos[0].title}」を共有家事として新規追加します。個人用ToDoはそのまま残ります。`
      : `選択した${validTodos.length}件を共有家事として新規追加します。個人用ToDoはそのまま残ります。`;

    if (typeof elements.personalShareDialog.showModal === "function") {
      elements.personalShareDialog.showModal();
    } else {
      elements.personalShareDialog.setAttribute("open", "");
    }
  }

  async function confirmPersonalShare() {
    const todos = state.personalTodosToShare.slice();
    if (!todos.length || !canSaveSharedData()) return;
    const assignee = elements.personalShareAssignee.value || null;
    let added = 0;
    let skipped = 0;

    await saveMutation(async () => {
      for (const todo of todos) {
        let duplicateRequest = state.client
          .from("shared_todos")
          .select("id")
          .eq("household_id", state.household.id)
          .eq("title", todo.title)
          .eq("due_date", todo.date)
          .limit(1);

        duplicateRequest = todo.time
          ? duplicateRequest.eq("due_time", todo.time)
          : duplicateRequest.is("due_time", null);

        const { data: duplicates, error: duplicateError } = await duplicateRequest;
        if (duplicateError) throw duplicateError;

        if (duplicates && duplicates.length) {
          const proceed = confirm(`「${todo.title}」は同じ予定日・時刻で既に共有されています。それでも追加しますか？`);
          if (!proceed) {
            skipped += 1;
            continue;
          }
        }

        const { data, error } = await state.client
          .from("shared_todos")
          .insert({
            household_id: state.household.id,
            title: todo.title,
            due_date: todo.date,
            due_time: todo.time || null,
            status: "todo",
            assignee_user_id: assignee,
            is_priority: Boolean(todo.isPriority),
            created_by: currentUserId()
          })
          .select("id")
          .single();
        if (error || !data) throw error || new Error("Personal todo was not shared");
        added += 1;
      }

      closePersonalShareDialog();
      await refreshSharedData({ silent: true });
      emitMessage(`共有家事に${added}件追加しました。個人用ToDoは変更していません。${skipped ? ` 重複の可能性がある${skipped}件は追加しませんでした。` : ""}`);
    });
  }

  function closePersonalShareDialog() {
    state.personalTodosToShare = [];
    if (typeof elements.personalShareDialog.close === "function") {
      elements.personalShareDialog.close();
    } else {
      elements.personalShareDialog.removeAttribute("open");
    }
  }

  function canSaveSharedData() {
    if (!navigator.onLine) {
      setSyncState("offline", "オフライン");
      emitMessage("オフラインのため保存できません。接続後にもう一度操作してください。", true);
      return false;
    }
    if (!state.client || !state.session || !state.household || state.busy) {
      emitMessage("共有データを保存できませんでした。ログイン状態を確認してください。", true);
      return false;
    }
    return true;
  }

  async function saveMutation(operation) {
    if (state.busy) return false;
    state.busy = true;
    setFormDisabled(true);
    setSyncState("syncing", "同期中");
    try {
      await operation();
      if (state.syncKind !== "error") setSyncState("connected", "接続済み");
      return true;
    } catch (error) {
      console.error(error);
      setSyncState("error", "同期失敗");
      renderTodoList();
      emitMessage("共有データを保存できませんでした。通信状態を確認して、もう一度お試しください。", true);
      return false;
    } finally {
      state.busy = false;
      setFormDisabled(false);
    }
  }

  async function runBusy(operation, errorMessage) {
    if (state.busy) return;
    state.busy = true;
    setFormDisabled(true);
    try {
      await operation();
    } catch (error) {
      console.error(error);
      emitMessage(errorMessage, true);
    } finally {
      state.busy = false;
      setFormDisabled(false);
    }
  }

  function setFormDisabled(disabled) {
    document.querySelectorAll("#view-shared button, #view-shared input, #view-shared select, #personal-share-dialog button, #personal-share-dialog select")
      .forEach((control) => {
        control.disabled = disabled;
      });
  }

  function setSyncState(kind, label) {
    if (!elements.sharedSyncStatus) return;
    state.syncKind = kind;
    elements.sharedSyncStatus.className = `sync-status sync-${kind}`;
    elements.sharedSyncStatus.textContent = label;
    elements.sharedSyncStatus.setAttribute("aria-label", `共有家事の接続状態: ${label}`);
  }

  function getAssigneePresentation(userId) {
    if (!userId) return { label: "未割り当て", className: "assignee-unassigned" };
    if (userId === currentUserId()) return { label: "自分", className: "assignee-self" };
    return { label: memberName(userId), className: "assignee-other" };
  }

  function memberName(userId) {
    if (userId === currentUserId()) return "自分";
    const member = state.members.find((item) => item.user_id === userId);
    return member ? member.display_name : "元メンバー";
  }

  function currentUserId() {
    return state.session && state.session.user ? state.session.user.id : null;
  }

  function isOwner() {
    return Boolean(state.household && state.household.owner_user_id === currentUserId());
  }

  function setDefaultDates() {
    if (elements.sharedDateInput) elements.sharedDateInput.value = getTodayString();
  }

  function getTodayString() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(value) {
    if (!value) return "日付なし";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function appendOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function createButton(label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    return button;
  }

  function downloadJson(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function prefillInviteFromUrl() {
    const code = new URL(location.href).searchParams.get("invite");
    if (code) elements.sharedInviteCode.value = normalizeInviteInput(code);
  }

  function normalizeInviteInput(value) {
    const text = String(value || "").trim();
    try {
      const url = new URL(text);
      return (url.searchParams.get("invite") || "").trim().toLowerCase();
    } catch (_error) {
      return text.toLowerCase();
    }
  }

  function clearInviteFromUrl() {
    const url = new URL(location.href);
    url.searchParams.delete("invite");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function emitMessage(text, isError = false) {
    window.dispatchEvent(new CustomEvent("tmt:message", { detail: { text, isError } }));
  }

  function toCamelCase(id) {
    return id.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
  }

  window.TMTShared = {
    init,
    render,
    openPersonalShareDialog
  };
})();
