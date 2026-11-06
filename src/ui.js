// Small UI helpers: toast messages and <dialog>-based forms.

export function createToast(el) {
  let timer;
  return (message, kind = "info") => {
    el.textContent = message;
    el.dataset.kind = kind;
    el.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove("show"), kind === "error" ? 5000 : 2600);
  };
}

/**
 * Show a <dialog> containing a <form method="dialog">. Resolves with the form values when
 * the user confirms (a submit button with value "ok"), or null when cancelled.
 */
export function showForm(dialog, defaults = {}) {
  const form = dialog.querySelector("form");
  form.reset();
  for (const [k, v] of Object.entries(defaults)) {
    if (form.elements[k]) form.elements[k].value = v;
  }
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      if (dialog.returnValue !== "ok") return resolve(null);
      const out = {};
      for (const el of form.elements) if (el.name) out[el.name] = el.value;
      resolve(out);
    };
    dialog.addEventListener("close", onClose);
    dialog.returnValue = "";
    dialog.showModal();
    const first = form.querySelector("input, select");
    if (first) { first.focus(); first.select?.(); }
  });
}

export function confirmDialog(dialog, { title, message, okLabel = "OK", danger = false }) {
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("p").textContent = message;
  const ok = dialog.querySelector('button[value="ok"]');
  ok.textContent = okLabel;
  ok.classList.toggle("danger", danger);
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue === "ok");
    };
    dialog.addEventListener("close", onClose);
    dialog.returnValue = "";
    dialog.showModal();
    ok.focus();
  });
}
