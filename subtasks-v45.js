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
    container.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    container.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "muted subtask-summary";
    const hint = document.createElement("p");
    hint.className = "muted subtask-hint";
    hint.textContent = kind === "routine" ? "項目名を押すと編集・削除できます"
      : "左の欄を押すと、未完了 → △途中（まだ必要） → ✓完了 → 未完了。項目名で編集・削除できます。";
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
    container.append(summary, hint, list, toggle, form, message, dialog);

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
      const partialCount = items.filter(item => item.progress === "partial").length;
      summary.textContent = kind === "routine" ? `${items.length}件（各日のToDoへ未完了で追加）`
        : `${items.filter(item => item.done).length}／${items.length}件完了${partialCount ? `・△途中 ${partialCount}件` : ""}`;
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
        row.className = `subtask-row ${item.done ? "is-done" : item.progress === "partial" ? "is-partial" : ""} ${kind === "routine" ? "is-template" : ""}`;
        row.dataset.subtaskId = item.id;
        row.setAttribute("role", "listitem");
        if (kind !== "routine") {
          const hitArea = document.createElement("label");
          hitArea.className = "subtask-check";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = item.done;
          checkbox.indeterminate = item.progress === "partial";
          const currentState = item.done ? "完了" : item.progress === "partial" ? "途中（まだ必要）" : "未完了";
          const nextState = item.done ? "todo" : item.progress === "partial" ? "done" : "partial";
          const nextLabel = item.done ? "未完了" : item.progress === "partial" ? "完了" : "途中（△）";
          checkbox.setAttribute("aria-label", `${item.title}：${currentState}。${nextLabel}にする`);
          checkbox.addEventListener("change", async () => {
            if (!await mutate({ action: "state", id: item.id, state: nextState })) {
              checkbox.checked = item.done;
              checkbox.indeterminate = item.progress === "partial";
            }
            const updated = Array.from(list.children).find(row => row.dataset.subtaskId === item.id);
            updated?.querySelector("input")?.focus({ preventScroll: true });
          });
          const mark = document.createElement("span");
          mark.className = "subtask-check-mark";
          mark.setAttribute("aria-hidden", "true");
          mark.textContent = item.done ? "✓" : item.progress === "partial" ? "△" : "";
          hitArea.append(checkbox, mark);
          row.append(hitArea);
        }
        const title = button(item.title, "subtask-title");
        title.setAttribute("aria-label", `${item.title}を編集`);
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
