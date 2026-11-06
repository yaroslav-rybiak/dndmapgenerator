import { visitMap, cell, clickCell, menuAction, pickAction, rightClickCell, app, LEGACY_MAP } from "../support/helpers.js";

describe("map library", () => {
  beforeEach(() => cy.task("resetMaps"));

  it("loads a map from the URL and shows its name", () => {
    visitMap("dungeon1");
    app().invoke("getMap").its("name").should("eq", "dungeon1");
    cy.get("#badgeName").should("have.text", "dungeon1");
    cy.get("#badge").should("not.have.class", "dirty");
  });

  it("unknown map in the URL shows an error and a blank map", () => {
    visitMap("nope");
    cy.get("#toast").should("contain", "Map not found: nope");
    app().invoke("getMap").should((m) => {
      expect(m.rows).to.eq(14);
      expect(m.cols).to.eq(24);
      expect(m.name).to.eq("untitled");
    });
  });

  it("Open map lists server maps and opens one", () => {
    visitMap();
    rightClickCell(0, 0);
    cy.get('#menu [data-sub="open-map"]').trigger("mouseover");
    cy.get("#menu [data-map]").should("have.length", 4);
    cy.get('#menu [data-map="dungeon4"]').click();
    app().invoke("getMap").its("name").should("eq", "dungeon4");
    cy.location("search").should("eq", "?map=dungeon4");
  });

  it("asks before discarding unsaved changes when opening another map", () => {
    visitMap("dungeon4");
    clickCell(0, 0);
    rightClickCell(0, 0);
    cy.get('#menu [data-sub="open-map"]').trigger("mouseover");
    cy.get('#menu [data-map="dungeon1"]').click();
    cy.get("#confirmDialog").should("have.attr", "open");
    cy.get('#confirmDialog button[value="cancel"]').click();
    app().invoke("getMap").its("name").should("eq", "dungeon4");
    rightClickCell(0, 0);
    cy.get('#menu [data-sub="open-map"]').trigger("mouseover");
    cy.get('#menu [data-map="dungeon1"]').click();
    cy.get('#confirmDialog button[value="ok"]').click();
    app().invoke("getMap").its("name").should("eq", "dungeon1");
  });

  it("Save as writes a new file, updates the URL and clears the dirty flag", () => {
    visitMap("dungeon4");
    clickCell(0, 0);
    menuAction(0, 0, "save-as");
    cy.get("#saveAsDialog").should("have.attr", "open");
    cy.get("#saveAsDialog input[name=name]").clear().type("cave-copy");
    cy.get('#saveAsDialog button[value="ok"]').click();
    cy.get("#toast").should("contain", "Saved cave-copy");
    cy.get("#badgeName").should("have.text", "cave-copy");
    cy.get("#badge").should("not.have.class", "dirty");
    cy.location("search").should("eq", "?map=cave-copy");
    cy.task("readMap", "cave-copy").should((m) => {
      expect(m.version).to.eq(2);
      expect(m.name).to.eq("cave-copy");
      expect(m.cells[0].terrain).to.eq("floor");
    });
    cy.task("readMap", "dungeon4").its("cells.0.terrain").should("eq", "wall"); // original untouched
  });

  it("Save (⌘S) overwrites the open map in place", () => {
    visitMap("dungeon4");
    clickCell(0, 0);
    cy.get("body").type("{meta}s");
    cy.get("#toast").should("contain", "Saved dungeon4");
    cy.task("readMap", "dungeon4").its("cells.0.terrain").should("eq", "floor");
  });

  it("Save as over an existing name asks for confirmation", () => {
    visitMap("dungeon4");
    menuAction(0, 0, "save-as");
    cy.get("#saveAsDialog input[name=name]").clear().type("dungeon3");
    cy.get('#saveAsDialog button[value="ok"]').click();
    cy.get("#confirmDialog h2").should("contain", "Overwrite");
    cy.get('#confirmDialog button[value="cancel"]').click();
    cy.task("readMap", "dungeon3").its("rows").should("eq", 14);
  });

  it("New map creates a filled grid of the requested size", () => {
    visitMap("dungeon4");
    menuAction(0, 0, "new");
    cy.get("#newMapDialog input[name=name]").clear().type("field");
    cy.get("#newMapDialog input[name=cols]").clear().type("10");
    cy.get("#newMapDialog input[name=rows]").clear().type("6");
    cy.get("#newMapDialog select[name=terrain]").select("grass");
    cy.get('#newMapDialog button[value="ok"]').click();
    app().invoke("getMap").should((m) => {
      expect(m.name).to.eq("field");
      expect(m.cols).to.eq(10);
      expect(m.rows).to.eq(6);
      expect(m.cells).to.have.length(60);
      expect(m.cells.every((c) => c.terrain === "grass")).to.eq(true);
    });
    app().invoke("savedName").should("eq", null);
    cy.location("search").should("eq", "");
  });

  it("Delete removes the file and keeps the map open as unsaved", () => {
    visitMap("dungeon2");
    menuAction(0, 0, "delete");
    cy.get('#confirmDialog button[value="ok"]').click();
    cy.get("#toast").should("contain", "Deleted dungeon2");
    cy.task("mapExists", "dungeon2").should("eq", false);
    cy.get("#badge").should("have.class", "dirty");
    cy.location("search").should("eq", "");
  });

  it("Export downloads <name>.json in the v2 format", () => {
    visitMap("dungeon4");
    menuAction(0, 0, "export");
    cy.readFile("cypress/downloads/dungeon4.json").should((m) => {
      expect(m.version).to.eq(2);
      expect(m.cells).to.have.length(25);
    });
  });

  it("Import accepts a legacy v1 file and migrates it", () => {
    visitMap();
    rightClickCell(0, 0);
    pickAction("import");
    cy.get("#fileInput").selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify(LEGACY_MAP)), fileName: "old-dungeon.json", mimeType: "application/json" },
      { force: true },
    );
    app().invoke("getMap").should((m) => {
      expect(m.name).to.eq("old-dungeon");
      expect(m.cells[0]).to.deep.eq({ terrain: "wall_torch" });
      expect(m.cells[1]).to.deep.eq({ terrain: "floor", object: { type: "door", state: "locked" } });
      expect(m.cells[2]).to.deep.eq({ terrain: "floor", token: { type: "monster", state: "injured" } });
    });
    cy.get("#badge").should("have.class", "dirty");
  });

  it("Import rejects garbage with an error toast", () => {
    visitMap();
    rightClickCell(0, 0);
    pickAction("import");
    cy.get("#fileInput").selectFile(
      { contents: Cypress.Buffer.from("{not json"), fileName: "bad.json", mimeType: "application/json" },
      { force: true },
    );
    cy.get("#toast").should("have.attr", "data-kind", "error").and("contain", "Not valid JSON");
  });

  it("unsaved work survives a reload", () => {
    visitMap("dungeon4");
    clickCell(0, 0);
    cell(0, 0).its("terrain").should("eq", "floor");
    cy.reload();
    app().invoke("getLayout").should("not.be.null");
    cy.get("#toast").should("contain", "Restored unsaved changes");
    cell(0, 0).its("terrain").should("eq", "floor");
    cy.get("#badge").should("have.class", "dirty");
  });
});
