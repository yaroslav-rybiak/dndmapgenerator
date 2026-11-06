import { visitMap, cell, rightClickCell, cellPoint, app } from "../support/helpers.js";

const within = (rect, vw, vh) => rect.left >= 0 && rect.top >= 0 && rect.right <= vw && rect.bottom <= vh;

describe("context menu", () => {
  beforeEach(() => visitMap("dungeon1"));

  it("stays inside the viewport near the bottom-right corner, submenu flips left", () => {
    rightClickCell(23, 13); // bottom-right cell of a 24x14 map
    cy.get("#menu").then(($m) => {
      expect(within($m[0].getBoundingClientRect(), 1920, 1080)).to.eq(true);
    });
    cy.get('#menu [data-sub="terrain"]').trigger("mouseover");
    cy.get('#menu [data-sub="terrain"] > .sub').should("be.visible").then(($s) => {
      expect(within($s[0].getBoundingClientRect(), 1920, 1080)).to.eq(true);
    });
  });

  it("right-click outside the grid disables tile actions but keeps map actions", () => {
    cy.get("#canvas").trigger("contextmenu", 10, 10);
    cy.get("#menu").should("have.class", "open");
    cy.get('#menu [data-sub="terrain"]').should("have.class", "disabled");
    cy.get('#menu [data-action="clear"]').should("be.disabled");
    cy.get('#menu [data-action="new"]').should("not.be.disabled");
  });

  it("dismissing the menu with a canvas click does not edit the tile underneath", () => {
    rightClickCell(5, 5);
    cell(10, 5).its("terrain").then((before) => {
      cellPoint(10, 5).then(({ x, y }) => cy.get("#canvas").trigger("mousedown", x, y, { button: 0 }));
      cy.document().trigger("mouseup");
      cy.get("#menu").should("not.have.class", "open");
      cell(10, 5).its("terrain").should("eq", before);
      app().invoke("isDirty").should("eq", false);
    });
  });

  it("Escape closes the menu", () => {
    rightClickCell(5, 5);
    cy.get("body").type("{esc}");
    cy.get("#menu").should("not.have.class", "open");
  });

  it("shows the current brush and marks the active item", () => {
    rightClickCell(5, 5);
    cy.get("#brushLabel").should("have.text", "Brush: Floor");
    cy.get('#menu [data-sub="door"]').trigger("mouseover");
    cy.get('#menu [data-action="door:locked"]').click();
    rightClickCell(6, 5);
    cy.get("#brushLabel").should("have.text", "Brush: Door: Locked");
    cy.get('#menu [data-action="door:locked"]').should("have.attr", "aria-checked", "true");
    cy.get('#menu [data-action="terrain:floor"]').should("have.attr", "aria-checked", "false");
  });

  it("undo is disabled until there is something to undo", () => {
    rightClickCell(5, 5);
    cy.get('#menu [data-action="undo"]').should("be.disabled");
    cy.get('#menu [data-action="terrain:grass"]').click({ force: true });
    rightClickCell(5, 5);
    cy.get('#menu [data-action="undo"]').should("not.be.disabled");
  });
});
