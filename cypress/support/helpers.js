// Spec helpers. The app exposes window.__dnd (read-only state) for assertions; cell
// coordinates are converted to pixels with the same hex math the app uses.
import { hexCenter } from "../../src/hex.js";

export const app = () => cy.window().its("__dnd");

/** Visit a map (or the default page) and wait until it is laid out. */
export function visitMap(name) {
  cy.visit(name ? `/?map=${name}` : "/");
  app().invoke("getLayout").should("not.be.null");
}

export const cell = (q, r) => app().invoke("getCell", q, r);

export function cellPoint(q, r) {
  return app().invoke("getLayout").then((layout) => hexCenter(layout, q, r));
}

export function clickCell(q, r) {
  cellPoint(q, r).then(({ x, y }) => cy.get("#canvas").click(x, y));
}

export function rightClickCell(q, r) {
  cellPoint(q, r).then(({ x, y }) => cy.get("#canvas").trigger("contextmenu", x, y));
  cy.get("#menu").should("have.class", "open");
}

export function dragCells(points) {
  const [first, ...rest] = points;
  cellPoint(first.q, first.r).then(({ x, y }) => cy.get("#canvas").trigger("mousedown", x, y, { button: 0 }));
  rest.forEach(({ q, r }) => cellPoint(q, r).then(({ x, y }) => cy.get("#canvas").trigger("mousemove", x, y)));
  cy.document().trigger("mouseup");
}

/** Open the context menu on a cell and pick an action, opening its submenu when needed. */
export function menuAction(q, r, action) {
  rightClickCell(q, r);
  pickAction(action);
}

export function pickAction(action) {
  cy.get(`#menu [data-action="${action}"]`).then(($b) => {
    const $sub = $b.closest(".has-sub");
    if ($sub.length) cy.wrap($sub).trigger("mouseover");
  });
  cy.get(`#menu [data-action="${action}"]`).click();
  cy.get("#menu").should("not.have.class", "open");
}

export const LEGACY_MAP = {
  version: 1,
  rows: 2,
  cols: 2,
  tiles: [
    { role: "terrain", state: "wall_torch" },
    { role: "door", state: "locked" },
    { role: "monster", state: "injured" },
    { role: "terrain", state: "floor" },
  ],
};
