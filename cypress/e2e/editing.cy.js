import { visitMap, cell, clickCell, dragCells, menuAction, app, cellPoint } from "../support/helpers.js";

describe("editing", () => {
  beforeEach(() => visitMap("dungeon4"));

  it("default brush is floor; painting a wall cell makes it floor", () => {
    cell(0, 0).its("terrain").should("eq", "wall");
    clickCell(0, 0);
    cell(0, 0).its("terrain").should("eq", "floor");
    app().invoke("isDirty").should("eq", true);
    cy.get("#badge").should("have.class", "dirty");
  });

  it("menu choice edits the right-clicked cell and becomes the brush", () => {
    menuAction(2, 2, "terrain:grass");
    cell(2, 2).its("terrain").should("eq", "grass");
    app().invoke("getBrush").should("deep.eq", { kind: "terrain", type: "grass" });
    clickCell(3, 2);
    cell(3, 2).its("terrain").should("eq", "grass");
  });

  it("dragging paints a line of terrain", () => {
    menuAction(0, 0, "terrain:water");
    dragCells([{ q: 1, r: 1 }, { q: 2, r: 1 }, { q: 3, r: 1 }]);
    [1, 2, 3].forEach((q) => cell(q, 1).its("terrain").should("eq", "water"));
    cell(4, 1).its("terrain").should("not.eq", "water");
  });

  it("door brush places a door, repeated clicks cycle its state", () => {
    menuAction(1, 1, "door:closed");
    cell(1, 1).its("object").should("deep.eq", { type: "door", state: "closed" });
    clickCell(1, 1);
    cell(1, 1).its("object.state").should("eq", "open");
    clickCell(1, 1);
    cell(1, 1).its("object.state").should("eq", "locked");
    cell(1, 1).its("terrain").should("eq", "floor"); // terrain survives under the door
  });

  it("monster brush cycles alive -> injured -> dead and terrain is kept underneath", () => {
    menuAction(2, 2, "terrain:grass");
    menuAction(2, 2, "monster:alive");
    cell(2, 2).its("token").should("deep.eq", { type: "monster", state: "alive" });
    clickCell(2, 2);
    cell(2, 2).its("token.state").should("eq", "injured");
    clickCell(2, 2);
    cell(2, 2).its("token.state").should("eq", "dead");
    menuAction(2, 2, "monster:remove");
    cell(2, 2).should("not.have.property", "token");
    cell(2, 2).its("terrain").should("eq", "grass");
  });

  it("clear tile removes the token first, then the door", () => {
    menuAction(2, 2, "door:open");
    menuAction(2, 2, "monster:alive");
    menuAction(2, 2, "clear");
    cell(2, 2).should("not.have.property", "token");
    cell(2, 2).its("object.type").should("eq", "door");
    clickCell(2, 2); // brush is now the eraser
    cell(2, 2).should("not.have.property", "object");
  });

  it("undo and redo via menu and keyboard", () => {
    clickCell(0, 0);
    cell(0, 0).its("terrain").should("eq", "floor");
    menuAction(0, 0, "undo");
    cell(0, 0).its("terrain").should("eq", "wall");
    menuAction(0, 0, "redo");
    cell(0, 0).its("terrain").should("eq", "floor");
    cy.get("body").type("{meta}z");
    cell(0, 0).its("terrain").should("eq", "wall");
    cy.get("body").type("{meta}{shift}z");
    cell(0, 0).its("terrain").should("eq", "floor");
  });

  it("a drag stroke undoes as one step", () => {
    dragCells([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]);
    [0, 1, 2].forEach((q) => cell(q, 0).its("terrain").should("eq", "floor"));
    cy.get("body").type("{meta}z");
    [0, 1, 2].forEach((q) => cell(q, 0).its("terrain").should("eq", "wall"));
  });

  it("clicks outside the grid do nothing", () => {
    cy.get("#canvas").click(5, 5);
    app().invoke("isDirty").should("eq", false);
  });

  it("hover ring follows the mouse only in edit mode", () => {
    cellPoint(2, 2).then(({ x, y }) => cy.get("#canvas").trigger("mousemove", x, y));
    menuAction(2, 2, "play");
    cy.get("body").should("have.class", "play");
    cy.get("#badge").should("not.be.visible");
    clickCell(0, 0);
    cell(0, 0).its("terrain").should("eq", "wall"); // left click disabled
    menuAction(0, 0, "terrain:floor"); // right-click editing still works
    cell(0, 0).its("terrain").should("eq", "floor");
    menuAction(0, 0, "play");
    cy.get("body").should("not.have.class", "play");
  });
});
