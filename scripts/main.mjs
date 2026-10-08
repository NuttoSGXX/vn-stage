const MOD = "vn-stage";
const SOCK = `module.${MOD}`;
const SLOTS = 10;
const EXIT_MS = 750;
const S = (k) => game.settings.get(MOD, k);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emptySlot = () => ({ char: null, active: true, flip: false });

const ico = (d) => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const GEAR = (() => {
  const pts = [];
  for (let i = 0; i < 8; i++) for (const [d, r] of [[-16, 5], [-9, 7], [9, 7], [16, 5]]) {
    const a = ((i * 45 + d) * Math.PI) / 180;
    pts.push(`${(8 + r * Math.sin(a)).toFixed(2)} ${(8 - r * Math.cos(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
})();
const ICONS = {
  scene: ico('<path d="M1.5 4 5.2 3v10l-3.7-1ZM5.2 3h5.6v10H5.2ZM10.8 3l3.7 1v8l-3.7 1Z"/>'),
  chars: ico('<circle cx="8" cy="5.2" r="2.6"/><path d="M2.6 14c.5-3.2 2.7-4.8 5.4-4.8s4.9 1.6 5.4 4.8"/>'),
  detail: ico('<path d="M2 3.5h12M2 8h12M2 12.5h12"/>'),
  gear: ico(`<path d="${GEAR}"/><circle cx="8" cy="8" r="2"/>`),
  left: ico('<path d="M10 3 5 8l5 5"/>'),
  right: ico('<path d="M6 3l5 5-5 5"/>'),
  shake: ico('<path d="M1.5 8h2l1.6-4.5 2.8 9 2.8-9L12.3 8h2.2"/>'),
  exit: ico('<path d="M2 8h8M7 4.5 10.5 8 7 11.5M14 3v10"/>'),
  flip: ico('<path d="M2 8h12M5 5 2 8l3 3M11 5l3 3-3 3"/>'),
  del: ico('<path d="M4 4l8 8M12 4l-8 8"/>'),
};

let stage, panel;

/* ---------- state (one world setting, GM writes, everyone reads) ---------- */
function getState() {
  const raw = game.settings.get(MOD, "state") ?? {};
  return {
    hidden: !!raw.hidden,
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

  /** One-shot effects, broadcast to every client over the module socket. */
  fx({ t, id, dir }) {
    const n = this.nodes.get(id);
    if (!n) return;
    const img = n.querySelector("img");
    if (t === "shake") {
      img.classList.remove("shake");
      void img.offsetWidth;
      img.classList.add("shake");
      img.addEventListener("animationend", () => img.classList.remove("shake"), { once: true });
    } else if (t === "exit") {
      const w = n.getBoundingClientRect().width;
      const off = ((w / 2 + 60) / innerWidth) * 100;
      n.classList.add("running");
      img.classList.add("run");
      n.style.setProperty("--x", dir < 0 ? -off : 100 + off);
    }
  }

  render() {
    this.guides.style.display = game.user.isGM && S("showGuides") ? "" : "none";
    this.vars();
    const { chars, slots, hidden } = getState();
    this.el.classList.toggle("hide", hidden);
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
        n.innerHTML = `<div class="fl"><img draggable="false"></div>`;
        this.el.append(n);
        this.nodes.set(c.id, n);
        requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add("show")));
      }
      if (n.classList.contains("running")) continue; // mid-exit: leave it alone
      const img = n.querySelector("img");
      if (img.getAttribute("src") !== c.img) img.src = c.img;
      n.classList.toggle("off", !s.active);
      n.style.setProperty("--x", solo ? 50 : (s.i + 0.5) * 10);
      n.style.setProperty("--flip", s.flip ? -1 : 1);
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
const TABS = [["scene", "Scene", ICONS.scene], ["chars", "Characters", ICONS.chars], ["detail", "Detail", ICONS.detail], ["settings", "Setting", ICONS.gear]];
const OPEN_W = 700;

class Panel {
  constructor() {
    const p = S("panel");
    Object.assign(this, { x: p.x, y: p.y, tab: p.tab, open: p.open, skip: false, busy: false, shown: null });
    this.el = document.createElement("div");
    this.el.id = "vn-panel";
    this.el.innerHTML = `<div class="gv-box">
      <header><i class="gv-gem"></i><b>GRIM VN STAGE</b><button data-act="fold" title="Fold / unfold">▾</button></header>
      <div class="gv-rule"></div>
      <nav>${TABS.map(([k, l, i]) => `<button data-tab="${k}" title="${l}">${i}<span>${l}</span></button>`).join("")}</nav>
      <section></section></div>`;
    document.body.append(this.el);
    this.body = this.el.querySelector("section");
    this.pop = null;
    this.popEl = document.createElement("div");
    this.popEl.className = "gv-pop";
    this.popEl.hidden = true;
    this.el.querySelector(".gv-box").append(this.popEl);
    this.applyScale();
    this.place();
    this.sync();
    this.renderBody();
    this.bind();
  }

  applyScale(v = S("uiScale")) {
    this.el.style.setProperty("--gv-sc", v / 100);
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
    if (this.open) {
      const w = Math.min(innerWidth * 0.94, OPEN_W * (S("uiScale") / 100));
      this.x = clamp(this.x, 0, Math.max(0, innerWidth - w));
      this.place();
    }
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
    this.el.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.pop) { this.pop = null; this.renderBody(); this.renderPop(); } });
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

  /** Called when the world state changes. Our own slider/number edits skip the redraw so nothing jumps. */
  refresh() {
    if (!this.skip) this.renderBody();
    if (this.pop && !getState().chars.some((c) => c.id === this.pop)) { this.pop = null; this.renderPop(); }
  }

  renderBody() {
    if (this.pop && !(this.open && this.tab === "detail")) { this.pop = null; this.popEl.hidden = true; }
    const same = this.open && this.shown === this.tab;
    const top = same ? this.body.scrollTop : 0;
    const side = same ? this.body.querySelector(".slots,.lineup")?.scrollLeft ?? 0 : 0;
    this.body.innerHTML = this.open ? this[`t_${this.tab}`](getState()) : "";
    this.shown = this.open ? this.tab : null;
    if (same) {
      this.body.scrollTop = top;
      const sc = this.body.querySelector(".slots,.lineup");
      if (sc) sc.scrollLeft = side;
    }
  }

  /* --- tabs --- */
  t_scene({ chars, slots, hidden }) {
    const used = new Set(slots.map((x) => x.char));
    const on = slots.filter((x) => x.char).length;
    return `<div class="bar"><span>Stage · ${on}/${SLOTS}</span><button data-act="hideall" class="${hidden ? "on" : ""}">${hidden ? "Show all" : "Hide all"}</button></div>
    <div class="slots">${slots.map((sl, i) => {
      const c = chars.find((c) => c.id === sl.char);
      const opts = chars.filter((o) => o.id === sl.char || !used.has(o.id));
      const dis = c ? "" : "disabled";
      return `<div class="slot ${c && !sl.active ? "off" : ""}" data-i="${i}">
        <select data-f="slot" title="Character"><option value="">—</option>${opts.map((o) => `<option value="${o.id}" ${o.id === sl.char ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>
        <div class="thumb"><em>${i + 1}</em>${c ? `<img class="${sl.flip ? "flip" : ""}" src="${esc(c.img)}">` : ""}</div>
        <div class="ctl">
          <button data-act="left" ${dis} title="Move left">${ICONS.left}</button>
          <button data-act="active" class="act ${sl.active ? "on" : ""}" ${dis} title="Active on / off"><i class="dot"></i></button>
          <button data-act="right" ${dis} title="Move right">${ICONS.right}</button>
          <button data-act="shake" ${dis} title="Shake">${ICONS.shake}</button>
          <button data-act="exit" ${dis} title="Run off screen">${ICONS.exit}</button>
          <button data-act="flip" ${dis} title="Flip">${ICONS.flip}</button>
        </div></div>`;
    }).join("")}</div>`;
  }

  t_chars({ chars }) {
    return `<div class="bar"><span>Characters · ${chars.length}</span><button data-act="add" class="plus" title="Add character">+</button></div>
      <div class="list">${chars.map((c) => `<div class="row" data-id="${c.id}"><img src="${esc(c.img)}" data-act="reimg" title="Change image"><input type="text" data-f="name" value="${esc(c.name)}"><button data-act="del" title="Delete">${ICONS.del}</button></div>`).join("") || `<p class="hint">Press + to add a character image.</p>`}</div>`;
  }

  t_detail({ chars }) {
    if (!chars.length) return `<p class="hint">No characters yet.</p>`;
    const H = 230;
    const T = Math.max(1.5, Math.ceil(Math.max(...chars.map((c) => c.scale)) * 4) / 4); // ruler top, in Size units
    const topFt = 6 * T; // convention: Size 1 = 6'0"
    const ppf = H / topFt;
    const ftIn = (v) => { const n = Math.round(v * 72); return `${Math.floor(n / 12)}'${n % 12}"`; };
    let lines = "";
    for (let h = 0; h <= topFt + 1e-9; h += 0.5) {
      const major = Number.isInteger(h);
      const lab = major && h ? `<span class="l">${h}'0"</span><span class="r">${h}'0"</span>` : "";
      lines += `<div class="ln ${major ? "maj" : ""}" style="bottom:${((h / topFt) * 100).toFixed(2)}%">${lab}</div>`;
    }
    return `<div class="lineup" data-ppf="${ppf}" style="--lh:${H}px"><div class="lu-in"><div class="rule">${lines}</div>
      <div class="figs">${chars.map((c) => `<div class="col ${c.id === this.pop ? "sel" : ""}" data-id="${c.id}" data-act="pick" title="Click to adjust">
        <div class="fg"><img src="${esc(c.img)}" style="height:${(c.scale * 6 * ppf).toFixed(1)}px" draggable="false"></div>
        <div class="nmx"><b>${esc(c.name)}</b><small>${ftIn(c.scale)}</small></div></div>`).join("")}</div></div></div>`;
  }

  openPop(id) {
    this.pop = this.pop === id ? null : id;
    this.renderBody();
    this.renderPop();
  }

  renderPop() {
    const el = this.popEl;
    const c = this.pop ? getState().chars.find((x) => x.id === this.pop) : null;
    const col = c ? this.body.querySelector(`.col[data-id="${c.id}"]`) : null;
    if (!c || !col) { el.hidden = true; return; }
    const f = (k, l, min, max, step) => `<div class="fld"><span>${l}</span><input type="number" data-f="${k}" step="${step}" value="${c[k]}"><input type="range" data-f="${k}" min="${min}" max="${max}" step="${step}" value="${c[k]}"></div>`;
    el.dataset.id = c.id;
    el.innerHTML = `<div class="pop-h"><b>${esc(c.name)}</b><button data-act="popclose" title="Close">${ICONS.del}</button></div>
      ${f("scale", "Size", 0.3, 2.5, 0.01)}${f("y", "Y offset", -300, 300, 1)}${f("x", "X offset", -300, 300, 1)}
      <button data-act="reset" title="Reset to default">Reset</button>`;
    el.hidden = false;
    const sc = S("uiScale") / 100;
    const box = this.el.querySelector(".gv-box").getBoundingClientRect();
    const cr = col.getBoundingClientRect();
    const sr = this.body.getBoundingClientRect();
    el.style.left = `${clamp((cr.left + cr.width / 2 - box.left) / sc - 100, 8, box.width / sc - 208)}px`;
    el.style.top = `${(sr.top - box.top) / sc + 8}px`;
  }

  t_settings() {
    const r = (k, l, min, max, step, u) => `<label>${l}<input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${S(k)}"><output>${S(k)}</output><em>${u}</em></label>`;
    const cb = (k, l) => `<label class="cb"><input type="checkbox" data-set="${k}" ${S(k) ? "checked" : ""}> ${l}</label>`;
    return `<div class="set">${r("uiScale", "Panel size", 60, 140, 5, "%")}${r("baseHeight", "Portrait height", 30, 120, 1, "vh")}${r("bottom", "Bottom offset", -200, 200, 1, "px")}${r("speed", "Move speed", 0, 1500, 10, "ms")}${r("dim", "Inactive brightness", 0, 100, 5, "%")}
      ${cb("showGuides", "Show slot markers (GM only)")}<div><button data-act="clear">Clear stage</button></div></div>`;
  }

  /* --- events --- */
  onInput(e) {
    const t = e.target;
    if (!["range", "number"].includes(t.type) || t.value === "") return;
    const v = Number(t.value);
    t.closest(".fld, label")?.querySelectorAll("input[type=range],input[type=number],output").forEach((el) => {
      if (el === t) return;
      if (el.tagName === "OUTPUT") el.textContent = v;
      else el.value = v;
    });
    const id = t.closest("[data-id]")?.dataset.id;
    if (id) {
      stage.live(id, t.dataset.f, v);
      if (t.dataset.f === "scale") {
        const ln = this.body.querySelector(".lineup");
        const img = ln?.querySelector(`.col[data-id="${id}"] img`);
        if (img) img.style.height = `${(v * 6 * Number(ln.dataset.ppf)).toFixed(1)}px`;
      }
    }
    else if (t.dataset.set === "uiScale") this.applyScale(v);
    else if (t.dataset.set) stage.vars({ [t.dataset.set]: v });
  }

  onChange(e) {
    const t = e.target, f = t.dataset.f, id = t.closest("[data-id]")?.dataset.id;
    if (t.type === "number" && t.value === "") return;
    if (t.dataset.set) return game.settings.set(MOD, t.dataset.set, t.type === "checkbox" ? t.checked : Number(t.value));
    if (f === "slot") {
      const i = Number(t.closest("[data-i]").dataset.i);
      return commit((s) => { s.slots[i] = { char: t.value || null, active: true, flip: false }; });
    }
    if (f === "name" || ["scale", "x", "y"].includes(f)) {
      if (f === "name") this.skip = true; // keep focus in the name field
      const patch = f === "name" ? { name: t.value.trim() || "?" } : { [f]: Number(t.value) };
      return commit((s) => Object.assign(s.chars.find((c) => c.id === id), patch)).finally(() => { this.skip = false; });
    }
  }

  send(d) {
    game.socket.emit(SOCK, d);
    stage.fx(d);
  }

  async exit(i) {
    if (this.busy) return;
    const { slots } = getState();
    const id = slots[i].char;
    if (!id) return;
    this.busy = true;
    const solo = slots.filter((x) => x.char).length === 1;
    this.send({ t: "exit", id, dir: !solo && i < SLOTS / 2 ? -1 : 1 });
    await sleep(EXIT_MS + 100);
    await commit((s) => { const k = s.slots.findIndex((x) => x.char === id); if (k >= 0) s.slots[k] = emptySlot(); });
    this.busy = false;
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
    if (a === "hideall") return commit((s) => { s.hidden = !s.hidden; });
    if (a === "pick") return this.openPop(id);
    if (a === "popclose") { this.pop = null; this.renderBody(); return this.renderPop(); }
    if (a === "reset") return commit((s) => { Object.assign(s.chars.find((c) => c.id === id), { scale: 1, x: 0, y: 0 }); }).then(() => this.renderPop());
    if (a === "active") return commit((s) => { s.slots[i].active = !s.slots[i].active; });
    if (a === "left" || a === "right") return commit((s) => { push(s.slots, i, a === "left" ? -1 : 1); });
    if (a === "flip") return commit((s) => { s.slots[i].flip = !s.slots[i].flip; });
    if (a === "shake") return this.send({ t: "shake", id: getState().slots[i].char });
    if (a === "exit") return this.exit(i);
    if (a === "clear") return commit((s) => { s.slots = s.slots.map(emptySlot); });
  }
}

/* ---------- hooks ---------- */
Hooks.once("init", () => {
  const refresh = () => { stage?.render(); panel?.refresh(); };
  const world = (key, type, def) => game.settings.register(MOD, key, { scope: "world", config: false, type, default: def, onChange: refresh });
  world("state", Object, { chars: [], slots: [] });
  world("baseHeight", Number, 75);
  world("bottom", Number, 0);
  world("speed", Number, 450);
  world("dim", Number, 50);
  game.settings.register(MOD, "showGuides", { scope: "client", config: false, type: Boolean, default: true, onChange: refresh });
  game.settings.register(MOD, "uiScale", { scope: "client", config: false, type: Number, default: 100, onChange: () => panel?.applyScale() });
  game.settings.register(MOD, "panel", { scope: "client", config: false, type: Object, default: { x: 90, y: 90, tab: "scene", open: true } });
});

Hooks.once("ready", () => {
  stage = new Stage();
  stage.render();
  game.socket.on(SOCK, (d) => stage?.fx(d));
  if (game.user.isGM) panel = new Panel();
});
