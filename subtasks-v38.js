(function () {
  "use strict";
  function editor(container, { kind, owner, onSaved }) {
    let current = owner;
    let busy = false;
    container.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "muted subtask-summary";
    const list = document.createElement("div");
    list.className = "subtask-list";
    const form = document.createElement("form");
    form.className = "subtask-add-form";
    const input = document.createElement("input");
    input.className = "input";
    input.placeholder = "サブToDoの内容";
    input.setAttribute("aria-label", "追加するサブToDoの内容");
    input.required = true;
    const add = button("サブToDoを追加", "primary-button compact");
    add.type = "submit";
    form.append(input, add);
    const message = document.createElement("p");
    message.className = "muted";
    message.setAttribute("role", "status");
    container.append(summary, list, form, message);
    async function mutate(change) {
      if (busy) return false;
      busy = true;
      container.querySelectorAll("button,input").forEach(el => el.disabled = true);
      try {
        current = await window.TMTDB.changeSubtask(kind, current.id, change);
        onSaved?.(current);
        render();
        message.textContent = "保存しました";
        return true;
      } catch (error) {
        message.textContent = "保存できませんでした。内容を残しています。もう一度お試しください。";
        return false;
      } finally {
        busy = false;
        container.querySelectorAll("button,input").forEach(el => el.disabled = false);
      }
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (title && await mutate({ action: "add", title })) { input.value = ""; input.focus({ preventScroll: true }); }
    });
    function render() {
      const items = window.TMTDB.normalizeSubtasks(current.subtasks);
      summary.textContent = kind === "routine" ? `${items.length}件（各日のToDoへ未完了で追加）` : `${items.filter(item => item.done).length}／${items.length}件完了`;
      list.replaceChildren();
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "サブToDoはありません。必要なときに追加できます。";
        list.append(empty);
      }
      items.forEach(item => {
        const row = document.createElement("div");
        row.className = `subtask-row ${item.done ? "is-done" : ""}`;
        row.dataset.subtaskId = item.id;
        const label = document.createElement("label");
        label.className = "subtask-label";
        if (kind !== "routine") {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = item.done;
          checkbox.setAttribute("aria-label", `${item.title}を${item.done ? "未完了" : "完了"}にする`);
          checkbox.addEventListener("change", async () => { if (!await mutate({ action: "done", id: item.id, done: checkbox.checked })) checkbox.checked = item.done; });
          label.append(checkbox);
        }
        const title = document.createElement("span");
        title.className = "subtask-title";
        title.textContent = item.title;
        label.append(title);
        const status = document.createElement("small");
        status.textContent = kind === "routine" ? "" : item.done ? "完了" : "未完了";
        const edit = button("編集", "secondary-button compact");
        edit.setAttribute("aria-label", `${item.title}を編集`);
        const remove = button("削除", "secondary-button compact");
        remove.setAttribute("aria-label", `${item.title}を削除`);
        remove.addEventListener("click", () => { if (confirm(`サブToDo「${item.title}」を削除しますか？`)) mutate({ action: "delete", id: item.id }); });
        edit.addEventListener("click", () => {
          const editForm = document.createElement("form");
          editForm.className = "subtask-edit-form";
          const field = document.createElement("input");
          field.className = "input";
          field.value = item.title;
          field.required = true;
          field.setAttribute("aria-label", "サブToDoの内容を編集");
          const save = button("保存", "primary-button compact"); save.type = "submit";
          const cancel = button("取消", "secondary-button compact");
          cancel.addEventListener("click", render);
          editForm.append(field, save, cancel);
          editForm.addEventListener("submit", event => { event.preventDefault(); if (field.value.trim()) mutate({ action: "title", id: item.id, title: field.value }); });
          row.replaceChildren(editForm);
          field.focus();
        });
        row.append(label, status, edit, remove);
        list.append(row);
      });
    }
    render();
  }
  function button(text, className) {
    const el = document.createElement("button"); el.type = "button"; el.textContent = text; el.className = className; return el;
  }
  window.TMTSubtasks = { editor };
})();
