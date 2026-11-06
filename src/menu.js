// Right-click menu. One menu does everything: edit the cell under the cursor, pick the
// brush, open/save maps, undo/redo, play mode. Built from a declarative spec so tests
// and future tile types only touch the catalog.
import { TERRAIN, OBJECTS, TOKENS } from "./tiles.js";

const SEP = { sep: true };
const MARGIN = 8;

function spec() {
  const states = (group, type) =>
    Object.entries(group[type].states).map(([state, s]) => ({ label: s.label, action: `${type}:${state}` }));
  return [
    { header: true, id: "brushLabel" },
    { label: "Terrain", sub: "terrain", cell: true, children: Object.entries(TERRAIN).map(([t, d]) => ({ label: d.label, action: `terrain:${t}` })) },
    { label: OBJECTS.door.label, sub: "door", cell: true, children: [...states(OBJECTS, "door"), SEP, { label: "Remove door", action: "door:remove" }] },
    { label: TOKENS.monster.label, sub: "monster", cell: true, children: [...states(TOKENS, "monster"), SEP, { label: "Remove monster", action: "monster:remove" }] },
    { label: "Clear tile", action: "clear", cell: true, hint: "eraser" },
    SEP,
    { label: "Open map", sub: "open-map", children: [] },
    { label: "New map…", action: "new" },
    { label: "Save", action: "save", hint: "⌘S" },
    { label: "Save as…", action: "save-as" },
    { label: "Delete map", action: "delete" },
    SEP,
    { label: "Export JSON", action: "export" },
    { label: "Import JSON…", action: "import" },
    SEP,
    { label: "Undo", action: "undo", hint: "⌘Z" },
    { label: "Redo", action: "redo", hint: "⇧⌘Z" },
    { label: "Play mode", action: "play", toggle: true },
    { label: "Fullscreen", action: "fullscreen" },
  ];
}

function buildItem(item) {
  if (item.sep) {
    const d = document.createElement("div");
    d.className = "sep";
    return d;
  }
  if (item.header) {
    const d = document.createElement("div");
    d.className = "menu-head";
    d.id = item.id;
    return d;
  }
  if (item.sub) {
    const d = document.createElement("div");
    d.className = "item has-sub";
    d.dataset.sub = item.sub;
    d.tabIndex = 0;
    if (item.cell) d.dataset.needsCell = "1";
    d.innerHTML = `<span class="label"></span><span class="chev">›</span>`;
    d.querySelector(".label").textContent = item.label;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.setAttribute("role", "menu");
    item.children.forEach((c) => sub.appendChild(buildItem(c)));
    d.appendChild(sub);
    return d;
  }
  const b = document.createElement("button");
  b.type = "button";
  b.className = "item";
  b.dataset.action = item.action;
  if (item.cell) b.dataset.needsCell = "1";
  if (item.toggle) b.setAttribute("aria-checked", "false");
  b.setAttribute("role", item.toggle ? "menuitemcheckbox" : "menuitem");
  b.innerHTML = `<span class="label"></span>${item.hint ? `<span class="hint"></span>` : ""}`;
  b.querySelector(".label").textContent = item.label;
  if (item.hint) b.querySelector(".hint").textContent = item.hint;
  return b;
}

function clampInto(el, x, y) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  if (r.right > vw - MARGIN) el.style.left = `${Math.max(MARGIN, x - r.width)}px`;
  if (r.bottom > vh - MARGIN) el.style.top = `${Math.max(MARGIN, vh - MARGIN - r.height)}px`;
}

function positionSub(parent) {
  const sub = parent.querySelector(":scope > .sub");
  sub.classList.remove("flip");
  sub.style.top = "";
  const r = sub.getBoundingClientRect();
  if (r.right > window.innerWidth - MARGIN) sub.classList.add("flip");
  const r2 = sub.getBoundingClientRect();
  if (r2.bottom > window.innerHeight - MARGIN) {
    sub.style.top = `${-(r2.bottom - (window.innerHeight - MARGIN)) - 6}px`;
  }
}

export function createMenu(root, onAction) {
  root.setAttribute("role", "menu");
  spec().forEach((item) => root.appendChild(buildItem(item)));
  const openMapSub = root.querySelector('[data-sub="open-map"] > .sub');
  let open = false;

  function closeSubs(except) {
    root.querySelectorAll(".has-sub.open").forEach((el) => el !== except && el.classList.remove("open"));
  }

  root.addEventListener("mouseover", (e) => {
    const parent = e.target.closest(".has-sub");
    closeSubs(parent);
    if (parent && !parent.classList.contains("open")) {
      parent.classList.add("open");
      positionSub(parent);
    }
  });
  root.addEventListener("click", (e) => {
    const parent = e.target.closest(".has-sub");
    const button = e.target.closest("button.item");
    if (button && root.contains(button)) {
      if (button.disabled) return;
      close();
      onAction(button.dataset.action);
      return;
    }
    if (parent && e.target.closest(".sub") == null) {
      const willOpen = !parent.classList.contains("open");
      closeSubs(parent);
      parent.classList.toggle("open", willOpen);
      if (willOpen) positionSub(parent);
    }
  });
  document.addEventListener("mousedown", (e) => {
    if (open && !root.contains(e.target)) close();
  });

  function openAt(x, y, { hasCell }) {
    root.querySelectorAll("[data-needs-cell]").forEach((el) => {
      el.classList.toggle("disabled", !hasCell);
      if (el.tagName === "BUTTON") el.disabled = !hasCell;
    });
    closeSubs();
    root.classList.add("open");
    open = true;
    clampInto(root, x + 4, y + 4);
  }

  function close() {
    root.classList.remove("open");
    closeSubs();
    open = false;
  }

  function setMaps(list, { error, current } = {}) {
    openMapSub.innerHTML = "";
    if (error) {
      const d = document.createElement("div");
      d.className = "menu-note";
      d.textContent = error;
      openMapSub.appendChild(d);
      return;
    }
    if (!list.length) {
      const d = document.createElement("div");
      d.className = "menu-note";
      d.textContent = "No saved maps yet";
      openMapSub.appendChild(d);
      return;
    }
    for (const m of list) {
      const b = buildItem({ label: m.name, action: `open:${m.name}`, hint: `${m.cols}×${m.rows}` });
      b.dataset.map = m.name;
      b.setAttribute("aria-checked", String(m.name === current));
      openMapSub.appendChild(b);
    }
  }

  function setBrush(label, activeAction) {
    root.querySelector("#brushLabel").textContent = `Brush: ${label}`;
    root.querySelectorAll(".sub button.item, button.item[data-action='clear']").forEach((b) => {
      if (b.dataset.action?.startsWith("open:")) return;
      b.setAttribute("aria-checked", String(b.dataset.action === activeAction));
    });
  }

  function setChecked(action, on) {
    root.querySelector(`button.item[data-action="${action}"]`)?.setAttribute("aria-checked", String(on));
  }

  function setEnabled(action, on) {
    const b = root.querySelector(`button.item[data-action="${action}"]`);
    if (b) b.disabled = !on;
  }

  return { openAt, close, setMaps, setBrush, setChecked, setEnabled, get isOpen() { return open; } };
}
