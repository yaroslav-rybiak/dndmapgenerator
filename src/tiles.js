// Tile catalog: everything the editor can paint, with labels, art and fallback colours.
// Terrain is the ground layer. Objects (doors) and tokens (monsters) sit on top of it.

export const TERRAIN = {
  floor: { label: "Floor", image: "images/floor.png", color: "#8a8a8a" },
  wall: { label: "Wall", image: "images/wall_empty.png", color: "#2f2f2f" },
  wall_torch: { label: "Wall with torch", image: "images/wall_torch.png", color: "#4a3f2a" },
  grass: { label: "Grass", image: "images/grass.png", color: "#3f7a3a" },
  water: { label: "Water", image: "images/water.png", color: "#2a5d9d" },
};

export const OBJECTS = {
  door: {
    label: "Door",
    states: {
      locked: { label: "Locked", image: "images/door_locked.png", color: "#b74444" },
      closed: { label: "Closed", image: "images/door_closed.png", color: "#c98a2e" },
      open: { label: "Open", image: "images/door_open.png", color: "#2a9d6f" },
    },
  },
};

export const TOKENS = {
  monster: {
    label: "Monster",
    states: {
      alive: { label: "Alive", image: "images/monster_alive.png", color: "#7c3aed" },
      injured: { label: "Injured", image: "images/monster_injured.png", color: "#ef4444" },
      dead: { label: "Dead", image: "images/monster_dead.png", color: "#5b6472" },
    },
  },
};

export const DEFAULT_TERRAIN = "floor";

/** Sprite key for a layer entry, used by the renderer's image cache. */
export const spriteKey = (type, state) => (state ? `${type}:${state}` : `terrain:${type}`);

/** Every drawable sprite: key -> { image, color }. */
export function allSprites() {
  const out = {};
  for (const [type, def] of Object.entries(TERRAIN)) out[spriteKey(type)] = def;
  for (const group of [OBJECTS, TOKENS]) {
    for (const [type, def] of Object.entries(group)) {
      for (const [state, s] of Object.entries(def.states)) out[spriteKey(type, state)] = s;
    }
  }
  return out;
}

export function firstState(def) {
  return Object.keys(def.states)[0];
}

export function nextState(def, current) {
  const states = Object.keys(def.states);
  return states[(states.indexOf(current) + 1) % states.length];
}
