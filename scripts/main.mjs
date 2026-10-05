const MOD = "vn-stage";
const SLOTS = 10;
const S = (k) => game.settings.get(MOD, k);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const emptySlot = () => ({ char: null, active: true });

let stage, panel;

/* ---------- state (one world setting, GM writes, everyone reads) ---------- */
function getState() {
  const raw = game.settings.get(MOD, "state") ?? {};
  return {
    chars: raw.chars ?? [],
    slots: Array.from({ length: SLOTS }, (_, i) => ({ ...emptySlot(), ...(raw.slots?.[i] ?? {}) })),
  };
}
async function commit(fn) {
  if (!game.user.isGM) return;
  const s = structuredClone(getState());
  fn(s);
  await game.settings.set(MOD, "state", s);
}

/** Move slot i one step; if the target is occupied, push that occupant further in the same direction. */
function push(slots, i, dir) {
  const t = i + dir;
  if (t < 0 || t >= SLOTS) return false;
  if (slots[t].char && !push(slots, t, dir)) return false;
  slots[t] = slots[i];
  slots[i] = emptySlot();
  return true;
}

function pickImage() {
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? FilePicker;
  return new Promise((res) => new FP({ type: "image", callback: (p) => res(p) }).browse());
}

/* ---------- the on-screen layer ---------- */
class Stage {
  constructor() {
    this.nodes = new Map();
    this.el = document.createElement("div");
    this.el.id = "vn-stage";
    this.guides = document.createElement("div");
    this.guides.className = "vn-guides";
    this.guides.innerHTML = Array.from({ length: SLOTS }, (_, i) => `<span style="left:${(i + 0.5) * 10}%">${i + 1}</span>`).join("");
    this.el.append(this.guides);
    document.body.append(this.el);
  }

  vars(o = {}) {
    const v = { baseHeight: S("baseHeight"), bottom: S("bottom"), speed: S("speed"), dim: S("dim"), ...o };
    const st = this.el.style;
    st.setProperty("--base", `${v.baseHeight}vh`);
    st.setProperty("--bottom", `${v.bottom}px`);
    st.setProperty("--speed", `${v.speed}ms`);
    st.setProperty("--dim", v.dim / 100);
  }

  live(id, key, val) {
    const n = this.nodes.get(id);
    if (n) n.style.setProperty({ scale: "--s", x: "--ox", y: "--oy" }[key], val);
  }

  render() {
    this.guides.style.display = game.user.isGM && S("showGuides") ? "" : "none";
    this.vars();
    const { chars, slots } = getState();
    const filled = slots.map((s, i) => ({ ...s, i })).filter((s) => chars.some((c) => c.id === s.char));
    const solo = filled.length === 1; // a lone character sits between slot 5 and 6
    const keep = new Set();

    for (const s of filled) {
      const c = chars.find((c) => c.id === s.char);
      keep.add(c.id);
      let n = this.nodes.get(c.id);
      if (!n) {
        n = document.createElement("div");
        n.className = "vn-portrait";
        n.innerHTML = `<img draggable="false">`;
        this.el.append(n);
        this.nodes.set(c.id, n);
        requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add("show")));
      }
      const img = n.firstChild;
      if (img.getAttribute("src") !== c.img) img.src = c.img;
      n.classList.toggle("off", !s.active);
      n.style.setProperty("--x", solo ? 50 : (s.i + 0.5) * 10);
      n.style.setProperty("--s", c.scale);
      n.style.setProperty("--ox", c.x);
      n.style.setProperty("--oy", c.y);
    }
    for (const [id, n] of this.nodes) {
      if (keep.has(id)) continue;
      this.nodes.delete(id);
      n.classList.remove("show");
      setTimeout(() => n.remove(), S("speed") + 50);
    }
  }
}

/* ---------- the floating GM panel ---------- */
const TABS = [["scene", "Scene"], ["chars", "Characters"], ["detail", "Detail"], ["settings", "Setting"]];

class Panel {
  constructor() {
    const p = S("panel");
    Object.assign(this, { x: p.x, y: p.y, tab: p.tab, open: p.open });
    this.el = document.createElement("div");
    this.el.id = "vn-panel";
    this.el.innerHTML = `<header><i>⠿</i><b>VN STAGE</b><button data-act="fold" title="Fold / unfold">▾</button></header>
      <nav>${TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join("")}</nav><section></section>`;
    document.body.append(this.el);
    this.body = this.el.querySelector("section");
    this.place();
    this.sync();
    this.renderBody();
    this.bind();
  }

  place() {
    this.el.style.left = `${this.x}px`;
    this.el.style.top = `${this.y}px`;
  }
  save() {
    game.settings.set(MOD, "panel", { x: this.x, y: this.y, tab: this.tab, open: this.open });
  }
  sync() {
    this.el.classList.toggle("open", this.open);
    this.el.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", this.open && b.dataset.tab === this.tab));
  }

  bind() {
    this.el.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab],[data-act]");
      if (!t) return;
      if (t.dataset.tab) {
        this.open = !(this.open && this.tab === t.dataset.tab); // click the active tab again = collapse
        this.tab = t.dataset.tab;
        this.sync();
        this.renderBody();
        this.save();
      } else this.act(t);
    });
    this.el.addEventListener("change", (e) => this.onChange(e));
    this.el.addEventListener("input", (e) => this.onInput(e));

    const head = this.el.querySelector("header");
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      const r = this.el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev) => {
        this.x = clamp(ev.clientX - dx, 0, innerWidth - 80);
        this.y = clamp(ev.clientY - dy, 0, innerHeight - 40);
        this.place();
      };
      const up = () => {
        head.removeEventListener("pointermove", move);
        head.removeEventListener("pointerup", up);
        this.save();
      };
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", up);
    });
  }

  renderBody() {
    this.body.innerHTML = this.open ? this[`t_${this.tab}`](getState()) : "";
  }

  /* --- tabs --- */
  t_scene({ chars, slots }) {
    const used = new Set(slots.map((x) => x.char));
    return `<div class="slots">${slots.map((sl, i) => {
      const c = chars.find((c) => c.id === sl.char);
      const opts = chars.filter((o) => o.id === sl.char || !used.has(o.id));
      const dis = c ? "" : "disabled";
      return `<div class="slot ${c && !sl.active ? "off" : ""}" data-i="${i}">
        <div class="n">${i + 1}</div>
        <select data-f="slot"><option value="">—</option>${opts.map((o) => `<option value="${o.id}" ${o.id === sl.char ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>
        <div class="thumb">${c ? `<img src="${esc(c.img)}">` : ""}</div>
        <div class="ctl"><button data-act="left" ${dis}>◀</button><button data-act="active" class="${sl.active ? "on" : ""}" ${dis} title="Active">⏻</button><button data-act="right" ${dis}>▶</button></div>
      </div>`;
    }).join("")}</div>`;
  }

  t_chars({ chars }) {
    return `<div class="bar"><span>Character list (${chars.length})</span><button data-act="add" class="plus">+</button></div>
      <div class="list">${chars.map((c) => `<div class="row" data-id="${c.id}"><img src="${esc(c.img)}" data-act="reimg" title="Change image"><input data-f="name" value="${esc(c.name)}"><button data-act="del" title="Delete">✕</button></div>`).join("") || `<p class="hint">Press + to add a character image.</p>`}</div>`;
  }

  t_detail({ chars }) {
    const r = (c, f, l, min, max, step) => `<label>${l}<input type="range" data-f="${f}" min="${min}" max="${max}" step="${step}" value="${c[f]}"><output>${c[f]}</output></label>`;
    return `<div class="cards">${chars.map((c) => `<div class="card" data-id="${c.id}">
      <div class="pv"><img src="${esc(c.img)}" style="height:${Math.round(80 * c.scale)}px"></div><b>${esc(c.name)}</b>
      ${r(c, "scale", "Size", 0.3, 2.5, 0.01)}${r(c, "y", "Y offset", -300, 300, 1)}${r(c, "x", "X offset", -300, 300, 1)}</div>`).join("") || `<p class="hint">No characters yet.</p>`}</div>`;
  }

  t_settings() {
    const r = (k, l, min, max, step, u) => `<label>${l}<input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${S(k)}"><output>${S(k)}</output><em>${u}</em></label>`;
    const cb = (k, l) => `<label class="cb"><input type="checkbox" data-set="${k}" ${S(k) ? "checked" : ""}> ${l}</label>`;
    return `<div class="set">${r("baseHeight", "Portrait height", 30, 120, 1, "vh")}${r("bottom", "Bottom offset", -200, 200, 1, "px")}${r("speed", "Move speed", 0, 1500, 10, "ms")}${r("dim", "Inactive brightness", 0, 100, 5, "%")}
      ${cb("showGuides", "Show slot markers (GM only)")}<button data-act="clear">Clear stage</button></div>`;
  }

  /* --- events --- */
  onInput(e) {
    const t = e.target;
    if (t.type !== "range") return;
    const v = Number(t.value);
    t.nextElementSibling.textContent = v;
    const id = t.closest("[data-id]")?.dataset.id;
    if (id) {
      stage.live(id, t.dataset.f, v);
      if (t.dataset.f === "scale") t.closest(".card").querySelector(".pv img").style.height = `${80 * v}px`;
    } else if (t.dataset.set) stage.vars({ [t.dataset.set]: v });
  }

  onChange(e) {
    const t = e.target, f = t.dataset.f, id = t.closest("[data-id]")?.dataset.id;
    if (t.dataset.set) return game.settings.set(MOD, t.dataset.set, t.type === "checkbox" ? t.checked : Number(t.value));
    if (f === "slot") {
      const i = Number(t.closest("[data-i]").dataset.i);
      return commit((s) => { s.slots[i] = { char: t.value || null, active: true }; });
    }
    if (f === "name") return commit((s) => { s.chars.find((c) => c.id === id).name = t.value.trim() || "?"; });
    if (["scale", "x", "y"].includes(f)) return commit((s) => { s.chars.find((c) => c.id === id)[f] = Number(t.value); });
  }

  async act(t) {
    const a = t.dataset.act;
    const id = t.closest("[data-id]")?.dataset.id;
    const i = Number(t.closest("[data-i]")?.dataset.i);
    if (a === "fold") { this.open = !this.open; this.sync(); this.renderBody(); return this.save(); }
    if (a === "add" || a === "reimg") {
      const path = await pickImage();
      if (!path) return;
      return commit((s) => {
        if (a === "add") s.chars.push({ id: foundry.utils.randomID(), name: decodeURIComponent(path.split("/").pop().replace(/\.[^.]+$/, "")), img: path, scale: 1, x: 0, y: 0 });
        else s.chars.find((c) => c.id === id).img = path;
      });
    }
    if (a === "del") return commit((s) => { s.chars = s.chars.filter((c) => c.id !== id); s.slots.forEach((x, k) => { if (x.char === id) s.slots[k] = emptySlot(); }); });
    if (a === "active") return commit((s) => { s.slots[i].active = !s.slots[i].active; });
    if (a === "left" || a === "right") return commit((s) => { push(s.slots, i, a === "left" ? -1 : 1); });
    if (a === "clear") return commit((s) => { s.slots = s.slots.map(emptySlot); });
  }
}

/* ---------- hooks ---------- */
Hooks.once("init", () => {
  const refresh = () => { stage?.render(); panel?.renderBody(); };
  const world = (key, type, def) => game.settings.register(MOD, key, { scope: "world", config: false, type, default: def, onChange: refresh });
  world("state", Object, { chars: [], slots: [] });
  world("baseHeight", Number, 75);
  world("bottom", Number, 0);
  world("speed", Number, 450);
  world("dim", Number, 50);
  game.settings.register(MOD, "showGuides", { scope: "client", config: false, type: Boolean, default: true, onChange: refresh });
  game.settings.register(MOD, "panel", { scope: "client", config: false, type: Object, default: { x: 90, y: 90, tab: "scene", open: true } });
});

Hooks.once("ready", () => {
  stage = new Stage();
  stage.render();
  if (game.user.isGM) panel = new Panel();
});
