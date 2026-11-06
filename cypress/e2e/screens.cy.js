// Visual review: 1080p screenshots of every bundled map and the main UI states.
import { visitMap, rightClickCell, menuAction, cellPoint } from "../support/helpers.js";

const shot = (name) => cy.screenshot(name, { capture: "viewport", overwrite: true });
const settle = () => cy.wait(300); // let the toast settle and sprites rasterise

describe("screens", () => {
  ["dungeon1", "dungeon2", "dungeon3", "dungeon4"].forEach((name) => {
    it(`${name} at 1080p`, () => {
      visitMap(name);
      settle();
      shot(`map-${name}`);
    });
  });

  it("context menu with the terrain submenu", () => {
    visitMap("dungeon2");
    cellPoint(14, 6).then(({ x, y }) => cy.get("#canvas").trigger("mousemove", x, y));
    rightClickCell(14, 6);
    cy.get('#menu [data-sub="terrain"]').trigger("mouseover");
    settle();
    shot("menu-terrain");
  });

  it("open map submenu", () => {
    visitMap("dungeon2");
    rightClickCell(14, 6);
    cy.get('#menu [data-sub="open-map"]').trigger("mouseover");
    cy.get("#menu [data-map]").should("have.length.at.least", 1);
    settle();
    shot("menu-open-map");
  });

  it("new terrain types and play mode", () => {
    visitMap("dungeon4");
    menuAction(1, 1, "terrain:grass");
    menuAction(2, 1, "terrain:grass");
    menuAction(3, 3, "terrain:water");
    menuAction(2, 3, "terrain:water");
    cellPoint(2, 2).then(({ x, y }) => cy.get("#canvas").trigger("mousemove", x, y));
    settle();
    shot("edit-mode-new-tiles");
    menuAction(0, 0, "play");
    cy.wait(3000); // toast fades
    shot("play-mode");
  });

  it("new map dialog", () => {
    visitMap("dungeon4");
    menuAction(0, 0, "new");
    settle();
    shot("dialog-new-map");
  });
});
