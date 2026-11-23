(function () {
  "use strict";

  // A browser Back action must not leave a modal covering another page.
  window.addEventListener("hashchange", () => {
    document.querySelectorAll(".subtask-dialog[open]").forEach(dialog => dialog.close());
  });

  function editor(container, { kind, owner, onSaved, saveChange }) {
    let current = owner;
    let busy = false;
    let selectedId = null;
    let mode = 1;
    try { const saved = Number(localStorage.getItem("tmt-subtask-button-count")); if ([1,2,3].includes(saved)) mode = saved; } catch {}
    const modeToggle = button("", "secondary-button subtask-mode-toggle");
    modeToggle.hidden = kind === "routine";
    modeToggle.addEventListener("click", () => {
      if (busy) return;
      mode = mode % 3 + 1;
      try { localStorage.setItem("tmt-subtask-button-count", String(mode)); } catch {}
      render();
    });
    container.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    container.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "muted subtask-summary";
    const hint = document.createElement("p");
    hint.className = "muted subtask-hint";
    hint.textContent = kind === "routine" ? "項目名を押すと編集・削除できます"
      : "数字は独立してオン／オフできます。表示を減らしても記録は残ります。項目名で編集・削除できます。";
    const list = document.createElement("div");
    list.className = "subtask-list";
    list.setAttribute("role", "list");
    const toggle = button("＋ サブToDoを追加", "text-button subtask-add-toggle");
    toggle.setAttribute("aria-expanded", "false");
    const form = document.createElement("form");
    form.className = "subtask-add-form";
    form.id = `${container.id}-add-form`;
    form.hidden = true;
    toggle.setAttribute("aria-controls", form.id);
    const input = document.createElement("input");
    input.className = "input";
    input.placeholder = "サブToDoの内容";
    input.setAttribute("aria-label", "追加するサブToDoの内容");
    input.required = true;
    const add = button("追加", "primary-button compact");
    add.type = "submit";
    form.append(input, add);
    toggle.addEventListener("click", () => {
      form.hidden = !form.hidden;
      toggle.setAttribute("aria-expanded", String(!form.hidden));
      toggle.textContent = form.hidden ? "＋ サブToDoを追加" : "入力欄を閉じる";
      if (!form.hidden) input.focus({ preventScroll: true });
    });
    const message = document.createElement("p");
    message.className = "muted subtask-message";
    message.setAttribute("role", "status");

    const dialog = document.createElement("dialog");
    dialog.className = "subtask-dialog";
    const heading = document.createElement("h2");
    heading.id = `${container.id}-edit-heading`;
    heading.textContent = "サブToDoを編集";
    dialog.setAttribute("aria-labelledby", heading.id);
    const editForm = document.createElement("form");
    editForm.className = "subtask-edit-form";
    const label = document.createElement("label");
    label.textContent = "内容";
    label.htmlFor = `${container.id}-edit-input`;
    const field = document.createElement("textarea");
    field.id = label.htmlFor;
    field.className = "textarea";
    field.rows = 3;
    field.required = true;
    field.setAttribute("aria-label", "サブToDoの内容を編集");
    const editMessage = document.createElement("p");
    editMessage.className = "muted subtask-message";
    editMessage.setAttribute("role", "status");
    const actions = document.createElement("div");
    actions.className = "subtask-dialog-actions";
    const save = button("保存", "primary-button");
    save.type = "submit";
    const cancel = button("キャンセル", "secondary-button");
    cancel.autofocus = true;
    cancel.addEventListener("click", () => { if (!busy) dialog.close(); });
    const remove = button("削除", "danger-button subtask-delete");
    actions.append(save, cancel);
    editForm.append(heading, label, field, editMessage, actions, remove);
    dialog.append(editForm);
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
    dialog.addEventListener("close", () => {
      // The saved row has been re-rendered; return focus to its new button.
      if (!container.closest(".view")?.classList.contains("is-active")) return;
      const row = Array.from(list.children).find(row => row.dataset.subtaskId === selectedId);
      (row?.querySelector(".subtask-title") || toggle).focus({ preventScroll: true });
    });
    container.append(modeToggle, summary, hint, list, toggle, form, message, dialog);

    async function mutate(change) {
      if (busy) return false;
      busy = true;
      dialog.setAttribute("aria-busy", "true");
      container.querySelectorAll("button,input,textarea").forEach(el => el.disabled = true);
      try {
        current = saveChange
          ? await saveChange(change, current)
          : await window.TMTDB.changeSubtask(kind, current.id, change);
        onSaved?.(current);
        render();
        message.textContent = "保存しました";
        editMessage.textContent = "";
        return true;
      } catch (error) {
        const text = "保存できませんでした。内容を残しています。もう一度お試しください。";
        message.textContent = text;
        editMessage.textContent = text;
        return false;
      } finally {
        busy = false;
        dialog.removeAttribute("aria-busy");
        container.querySelectorAll("button,input,textarea").forEach(el => el.disabled = false);
      }
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (title && await mutate({ action: "add", title })) {
        input.value = "";
        input.focus({ preventScroll: true });
      }
    });
    editForm.addEventListener("submit", async event => {
      event.preventDefault();
      const title = field.value.trim();
      if (!title) { editMessage.textContent = "内容を入力してください。"; field.focus(); return; }
      if (await mutate({ action: "title", id: selectedId, title })) dialog.close();
    });
    remove.addEventListener("click", async () => {
      const item = window.TMTDB.normalizeSubtasks(current.subtasks).find(item => item.id === selectedId);
      if (item && !busy && confirm(`サブToDo「${item.title}」を削除しますか？`)) {
        if (await mutate({ action: "delete", id: item.id })) dialog.close();
      }
    });

    function render() {
      const items = window.TMTDB.normalizeSubtasks(current.subtasks);
      modeToggle.textContent = `ボタン表示：${mode}個 → ${mode % 3 + 1}個`;
      modeToggle.setAttribute("aria-label", `ボタン表示は現在${mode}個。${mode % 3 + 1}個に切り替える`);
      summary.textContent = kind === "routine" ? `${items.length}件（各日のToDoへ未完了で追加）`
        : `${items.length}件・チェック数：${[0,1,2].map(i => `${i+1}＝${items.filter(item => item.checks[i]).length}件`).join("、")}`;
      hint.hidden = !items.length;
      list.replaceChildren();
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "サブToDoはありません。必要なときに追加できます。";
        list.append(empty);
      }
      items.forEach(item => {
        const row = document.createElement("div");
        row.className = `subtask-row subtask-numbered ${kind === "routine" ? "is-template" : ""}`;
        row.style.setProperty("--subtask-button-count", mode);
        row.dataset.subtaskId = item.id;
        row.setAttribute("role", "listitem");
        if (kind !== "routine") {
          for (let index = 0; index < mode; index++) {
            const control = button(String(index + 1), "subtask-state subtask-number");
            control.dataset.checkIndex = index;
            control.setAttribute("aria-pressed", String(item.checks[index]));
            control.setAttribute("aria-label", `${item.title}：チェック${index+1}を${item.checks[index] ? "外す" : "付ける"}`);
            control.addEventListener("click", async () => {
              const saved = await mutate({ action: "check", id: item.id, index, checked: !item.checks[index] });
              if (saved) {
                const updated = Array.from(list.children).find(row => row.dataset.subtaskId === item.id);
                updated?.querySelector(`[data-check-index="${index}"]`)?.focus({ preventScroll: true });
              }
            });
            row.append(control);
          }
        }
        const title = button(item.title, "subtask-title");
        const hiddenChecks = item.checks.map((on,i) => on && i >= mode ? i+1 : null).filter(Boolean);
        if (kind !== "routine" && hiddenChecks.length) {
          const indicator = document.createElement("small");
          indicator.className = "subtask-hidden-checks";
          indicator.textContent = `（${hiddenChecks.join("・")}にチェック済み）`;
          title.append(indicator);
        }
        title.setAttribute("aria-label", `${item.title}を編集${hiddenChecks.length && kind !== "routine" ? "。" + hiddenChecks.join("・") + "にチェック済み" : ""}`);
        title.setAttribute("aria-haspopup", "dialog");
        title.addEventListener("click", () => {
          selectedId = item.id;
          field.value = item.title;
          editMessage.textContent = "";
          dialog.showModal();
          // Keep the keyboard closed until the user taps the text field.
          cancel.focus({ preventScroll: true });
        });
        row.append(title);
        list.append(row);
      });
    }
    render();
  }
  function button(text, className) {
    const el = document.createElement("button");
    el.type = "button"; el.textContent = text; el.className = className;
    return el;
  }
  window.TMTSubtasks = { editor };
})();






