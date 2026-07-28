(function () {
  "use strict";

  const sharedViewHtml = document.getElementById("view-shared")?.outerHTML || "";
  const shareDialogHtml = document.getElementById("personal-share-dialog")?.outerHTML || "";
  const passwordResetDialogHtml = document.getElementById("password-reset-dialog")?.outerHTML || "";

  document.addEventListener("DOMContentLoaded", initializeSharedBridge);

  function initializeSharedBridge() {
    const appMain = document.getElementById("app");
    const settingsView = document.getElementById("view-settings");
    const settingsNav = document.querySelector('.bottom-nav [data-go="settings"]');

    if (!appMain || !settingsView || !settingsNav || !sharedViewHtml || !shareDialogHtml || !passwordResetDialogHtml) {
      showBridgeMessage("共有画面の準備に失敗しました。ページを再読み込みしてください。", true);
      return;
    }

    settingsView.insertAdjacentHTML("beforebegin", sharedViewHtml);
    document.body.insertAdjacentHTML("beforeend", shareDialogHtml);
    document.body.insertAdjacentHTML("beforeend", passwordResetDialogHtml);

    const sharedNav = document.createElement("button");
    sharedNav.className = "nav-button";
    sharedNav.type = "button";
    sharedNav.dataset.go = "shared";
    sharedNav.innerHTML = '<span aria-hidden="true">↔</span><span>共有</span>';
    settingsNav.insertAdjacentElement("beforebegin", sharedNav);

    addPersonalShareButtons();
    bindBridgeEvents(sharedNav);
    ensureSupabaseSdk();

    if (window.TMTShared && typeof window.TMTShared.init === "function") {
      window.TMTShared.init();
    } else {
      showBridgeMessage("共有機能の読み込みに失敗しました。", true);
    }

    applySharedRoute();
  }

  function ensureSupabaseSdk() {
    if (window.supabase || document.getElementById("supabase-sdk")) return;

    const script = document.createElement("script");
    script.id = "supabase-sdk";
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.async = true;
    document.head.append(script);
  }

  function addPersonalShareButtons() {
    const bulkActions = document.querySelector("#todo-select-panel .todo-select-actions");
    if (bulkActions && !document.getElementById("todo-share-selected")) {
      const shareSelected = document.createElement("button");
      shareSelected.className = "primary-button";
      shareSelected.type = "button";
      shareSelected.id = "todo-share-selected";
      shareSelected.textContent = "共有家事に追加";
      bulkActions.prepend(shareSelected);
    }

    const dangerZone = document.querySelector("#todo-detail-display .danger-zone");
    if (dangerZone && !document.getElementById("todo-detail-share")) {
      const shareDetail = document.createElement("button");
      shareDetail.className = "secondary-button wide";
      shareDetail.type = "button";
      shareDetail.id = "todo-detail-share";
      shareDetail.textContent = "共有家事に追加";
      dangerZone.insertAdjacentElement("beforebegin", shareDetail);
    }
  }

  function bindBridgeEvents(sharedNav) {
    sharedNav.addEventListener("click", () => {
      if (location.hash === "#shared") {
        applySharedRoute();
      } else {
        location.hash = "shared";
      }
    });

    window.addEventListener("hashchange", applySharedRoute);
    window.addEventListener("tmt:message", (event) => {
      const detail = event.detail || {};
      showBridgeMessage(detail.text || "", Boolean(detail.isError));
    });

    document.getElementById("todo-share-selected")?.addEventListener("click", shareSelectedTodos);
    document.getElementById("todo-detail-share")?.addEventListener("click", shareCurrentTodo);
  }

  function applySharedRoute() {
    const isShared = location.hash.replace("#", "") === "shared";
    const sharedView = document.getElementById("view-shared");

    if (!sharedView) return;

    if (!isShared) {
      sharedView.classList.remove("is-active");
      return;
    }

    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("is-active", view === sharedView);
    });
    document.querySelectorAll(".nav-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.go === "shared");
    });
    requestAnimationFrame(() => {
      document.querySelector('.bottom-nav [data-go="shared"]')?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest"
      });
    });

    if (window.TMTShared && typeof window.TMTShared.render === "function") {
      window.TMTShared.render();
    }
  }

  async function shareSelectedTodos() {
    const ids = Array.from(document.querySelectorAll(".todo-row-check:checked"))
      .map((checkbox) => checkbox.closest("[data-todo-id]")?.dataset.todoId)
      .filter(Boolean);

    if (!ids.length) {
      showBridgeMessage("共有するToDoを選択してください。", true);
      return;
    }

    try {
      const todos = (await Promise.all(ids.map((id) => window.TMTDB.getTodo(id)))).filter(Boolean);
      window.TMTShared.openPersonalShareDialog(todos);
    } catch (error) {
      console.error("Personal todo sharing failed", error);
      showBridgeMessage("共有家事への追加準備に失敗しました。", true);
    }
  }

  async function shareCurrentTodo() {
    const route = location.hash.replace("#", "");
    if (!route.startsWith("todo-detail-")) {
      showBridgeMessage("共有するToDoが見つかりません。", true);
      return;
    }

    try {
      const id = decodeURIComponent(route.replace("todo-detail-", ""));
      const todo = await window.TMTDB.getTodo(id);
      if (!todo) {
        showBridgeMessage("共有するToDoが見つかりません。", true);
        return;
      }
      window.TMTShared.openPersonalShareDialog([todo]);
    } catch (error) {
      console.error("Personal todo sharing failed", error);
      showBridgeMessage("共有家事への追加準備に失敗しました。", true);
    }
  }

  function showBridgeMessage(text, isError) {
    const message = document.getElementById("message");
    if (!message || !text) return;

    message.textContent = text;
    message.classList.toggle("is-error", Boolean(isError));
    message.hidden = false;
    window.clearTimeout(showBridgeMessage.timer);
    showBridgeMessage.timer = window.setTimeout(() => {
      message.hidden = true;
    }, 5000);
  }
})();
