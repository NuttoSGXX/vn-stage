const MOD = "vn-stage";
const SOCK = `module.${MOD}`;
const SLOTS = 10;
const EXIT_MS = 750;
const POP_W = 230;
const S = (k) => game.settings.get(MOD, k);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emptySlot = () => ({ char: null, active: true, flip: false, expr: null });
const stg = (s, id) => s.stages.find((x) => x.id === id);
const nameOf = (path) => decodeURIComponent(path.split("/").pop().replace(/\.[^.]+$/, ""));

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
  face: ico('<circle cx="8" cy="8" r="6"/><path d="M5.6 9.6c.6 1.1 1.4 1.6 2.4 1.6s1.8-.5 2.4-1.6M6 6.2v.4M10 6.2v.4"/>'),
  warp: ico('<path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>'),
  plus: ico('<path d="M8 3v10M3 8h10"/>'),
  copy: ico('<path d="M5.5 5.5H13V13H5.5ZM3 10.5V3h7.5"/>'),
};

/* expressions: the first one is always "Default" and uses the character's main image */
const exprList = (c) => [{ id: "default", name: c.dname || "Default", img: c.img }, ...(c.exprs ?? [])];
const exprOf = (c, id) => exprList(c).find((x) => x.id === id) ?? exprList(c)[0];

let stage, panel;

/* ---------- state (one world setting, GM writes, everyone reads) ---------- */
function getState() {
  const raw = game.settings.get(MOD, "state") ?? {};
  const norm = (a) => Array.from({ length: SLOTS }, (_, i) => ({ ...emptySlot(), ...(a?.[i] ?? {}) }));
  const stages = raw.stages?.length
    ? raw.stages.map((x) => ({ id: x.id, name: x.name ?? "Stage", slots: norm(x.slots) }))
    : [{ id: "main", name: "Stage 1", slots: norm(raw.slots) }]; // migrates the pre-0.3 single stage
  const live = stages.some((x) => x.id === raw.live) ? raw.live : stages[0].id;
  return { hidden: !!raw.hidden, chars: raw.chars ?? [], stages, live, slots: stages.find((x) => x.id === live).slots };
}
async function commit(fn) {
  if (!game.user.isGM) return;
  const { slots, ...s } = structuredClone(getState()); // `slots` is just an alias of the live stage's slots
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

/* ---------- the on-screen layer (shows the LIVE stage) ---------- */
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
      const url = exprOf(c, s.expr).img;
      if (img.getAttribute("src") !== url) { // preload so an expression swap never flashes blank
        const pre = new Image();
        pre.onload = pre.onerror = () => { img.src = url; };
        pre.src = url;
      }
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
    Object.assign(this, { x: p.x, y: p.y, tab: p.tab, open: p.open, skip: false, busy: false, shown: null, pop: null, popPos: null, warpSel: null, toEnd: false, focusX: null });
    this.el = document.createElement("div");
    this.el.id = "vn-panel";
    this.el.innerHTML = `<div class="gv-box">
      <header><i class="gv-gem"></i><b>GRIM VN STAGE</b><button data-act="fold" title="Fold / unfold">▾</button></header>
      <div class="gv-rule"></div>
      <nav>${TABS.map(([k, l, i]) => `<button data-tab="${k}" title="${l}">${i}<span>${l}</span></button>`).join("")}</nav>
      <section></section></div>
      <div class="gv-pop" hidden></div><div class="gv-menu" hidden></div>`;
    document.body.append(this.el);
    this.body = this.el.querySelector("section");
    this.popEl = this.el.querySelector(".gv-pop");
    this.menuEl = this.el.querySelector(".gv-menu");
    this.applyScale();
    this.applyRows();
    this.place();
    this.sync();
    this.renderBody();
    this.bind();
  }

  applyScale(v = S("uiScale")) { this.el.style.setProperty("--gv-sc", v / 100); }
  applyRows(v = S("stageRows")) { this.el.style.setProperty("--rows", v); }
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
    this.el.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!this.menuEl.hidden) this.closeMenu();
      else if (this.pop) { this.pop = null; this.renderBody(); this.renderPop(); }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!this.menuEl.hidden && !e.target.closest(".gv-menu,[data-act='expr']")) this.closeMenu();
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

    // the adjust popup can be dragged anywhere on screen, not just inside the panel
    this.popEl.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".pop-h") || e.target.closest("button")) return;
      const pr = this.popEl.getBoundingClientRect();
      const dx = e.clientX - pr.left, dy = e.clientY - pr.top;
      const move = (ev) => {
        const sc = S("uiScale") / 100, o = this.el.getBoundingClientRect();
        this.popPos = this.placePop((ev.clientX - dx - o.left) / sc, (ev.clientY - dy - o.top) / sc);
      };
      const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }

  /** Called when the world state changes. Name edits skip the redraw so typing focus isn't lost. */
  refresh() {
    if (!this.skip) this.renderBody();
    if (this.pop && !getState().chars.some((c) => c.id === this.pop)) { this.pop = null; this.renderPop(); }
  }

  renderBody() {
    this.closeMenu();
    if (this.pop && !(this.open && this.tab === "detail")) { this.pop = null; this.popEl.hidden = true; this.popPos = null; }
    const same = this.open && this.shown === this.tab;
    const top = same ? this.body.scrollTop : 0;
    const side = same ? this.body.querySelector(".lineup")?.scrollLeft ?? 0 : 0;
    const rows = same ? this.body.querySelector(".stages")?.scrollTop ?? 0 : 0;
    this.body.innerHTML = this.open ? this[`t_${this.tab}`](getState()) : "";
    this.shown = this.open ? this.tab : null;
    const ln = this.body.querySelector(".lineup"), sg = this.body.querySelector(".stages");
    if (same) {
      this.body.scrollTop = top;
      if (ln) ln.scrollLeft = side;
      if (sg) sg.scrollTop = rows;
    }
    if (this.toEnd && sg) { sg.scrollTop = sg.scrollHeight; this.toEnd = false; } // a new stage lands at the bottom
  }

  /* --- tabs --- */
  t_scene({ chars, stages, live, hidden }) {
    const warp = stages.some((x) => x.id === this.warpSel) ? this.warpSel : live;
    const row = (st) => {
      const isLive = st.id === live;
      const used = new Set(st.slots.map((x) => x.char));
      return `<div class="stg ${isLive ? "live" : ""}" data-s="${st.id}">
        <div class="stg-h">
          ${isLive ? `<span class="tag">LIVE</span>` : `<button data-act="warp" title="Warp this stage onto the screen">${ICONS.warp}<span>Warp</span></button>`}
          <input type="text" data-f="sname" value="${esc(st.name)}" title="Stage name">
          <span class="cnt">${st.slots.filter((x) => x.char).length}/${SLOTS}</span>
          <button data-act="dup" title="Duplicate as a new stage">${ICONS.copy}</button>
          <button data-act="delstage" title="Delete this stage" ${stages.length < 2 ? "disabled" : ""}>${ICONS.del}</button>
        </div>
        <div class="slots">${st.slots.map((sl, i) => {
          const c = chars.find((c) => c.id === sl.char);
          const opts = chars.filter((o) => o.id === sl.char || !used.has(o.id));
          const dis = c ? "" : "disabled";
          const fx = c && isLive ? "" : "disabled"; // shake / run act on the screen, so live stage only
          const ex = c ? exprOf(c, sl.expr) : null;
          return `<div class="slot ${c && !sl.active ? "off" : ""}" data-i="${i}">
            <select data-f="slot" title="Character"><option value="">—</option>${opts.map((o) => `<option value="${o.id}" ${o.id === sl.char ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>
            <div class="thumb"><em>${i + 1}</em>${c ? `<img class="${sl.flip ? "flip" : ""}" src="${esc(ex.img)}">` : ""}</div>
            <div class="ctl">
              <button data-act="left" ${dis} title="Move left">${ICONS.left}</button>
              <button data-act="active" class="act ${sl.active ? "on" : ""}" ${dis} title="Active on / off"><i class="dot"></i></button>
              <button data-act="right" ${dis} title="Move right">${ICONS.right}</button>
              <button data-act="shake" ${fx} title="Shake">${ICONS.shake}</button>
              <button data-act="exit" ${fx} title="Run off screen">${ICONS.exit}</button>
              <button data-act="flip" ${dis} title="Flip">${ICONS.flip}</button>
              <button data-act="expr" class="emo" ${c && exprList(c).length > 1 ? "" : "disabled"} title="${c ? `Expression: ${esc(ex.name)}` : "Expression"}">${ICONS.face}<span>${c ? esc(ex.name) : ""}</span></button>
            </div></div>`;
        }).join("")}</div></div>`;
    };
    return `<div class="bar sbar">
        <select data-f="warpsel" title="Saved stages">${stages.map((st) => `<option value="${st.id}" ${st.id === warp ? "selected" : ""}>${st.id === live ? "● " : ""}${esc(st.name)}</option>`).join("")}</select>
        <button data-act="warpgo" class="${warp !== live ? "on" : ""}" ${warp === live ? "disabled" : ""} title="Warp the selected stage onto the screen">${ICONS.warp}<span>Warp</span></button>
        <button data-act="newstage" title="Add an empty stage at the bottom">${ICONS.plus}<span>New stage</span></button>
        <i class="grow"></i>
        <button data-act="hideall" class="${hidden ? "on" : ""}">${hidden ? "Show all" : "Hide all"}</button>
      </div>
      <div class="stages">${stages.map(row).join("")}</div>`;
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

  /** Position the popup (l/t are relative to the panel, in panel px) and keep it on screen. */
  placePop(l, t) {
    const sc = S("uiScale") / 100, o = this.el.getBoundingClientRect();
    const vl = clamp(o.left + l * sc, 0, Math.max(0, innerWidth - POP_W * sc));
    const vt = clamp(o.top + t * sc, 0, Math.max(0, innerHeight - 40));
    const r = { l: (vl - o.left) / sc, t: (vt - o.top) / sc };
    this.popEl.style.left = `${r.l}px`;
    this.popEl.style.top = `${r.t}px`;
    return r;
  }

  renderPop() {
    const el = this.popEl;
    const c = this.pop ? getState().chars.find((x) => x.id === this.pop) : null;
    const col = c ? this.body.querySelector(`.col[data-id="${c.id}"]`) : null;
    if (!c || !col) { el.hidden = true; this.popPos = null; return; }
    const f = (k, l, min, max, step) => `<div class="fld"><span>${l}</span><input type="number" data-f="${k}" step="${step}" value="${c[k]}"><input type="range" data-f="${k}" min="${min}" max="${max}" step="${step}" value="${c[k]}"></div>`;
    const ex = (x, k) => `<div class="ex" data-x="${x.id}"><img src="${esc(x.img)}" data-act="exreimg" title="Change image"><input type="text" data-f="xname" value="${esc(x.name)}">${k ? `<button data-act="exdel" title="Delete">${ICONS.del}</button>` : `<i class="ph"></i>`}</div>`;
    el.dataset.id = c.id;
    el.innerHTML = `<div class="pop-h"><b>${esc(c.name)}</b><button data-act="popclose" title="Close">${ICONS.del}</button></div>
      ${f("scale", "Size", 0.3, 2.5, 0.01)}${f("y", "Y offset", -300, 300, 1)}${f("x", "X offset", -300, 300, 1)}
      <div><button data-act="reset" title="Reset to default">Reset</button></div>
      <div class="ex-h"><span>Expressions</span><button data-act="exadd" class="plus" title="Add an expression image">+</button></div>
      <div class="exs">${exprList(c).map(ex).join("")}</div>`;
    el.hidden = false;
    const sc = S("uiScale") / 100, o = this.el.getBoundingClientRect();
    const cr = col.getBoundingClientRect(), sr = this.body.getBoundingClientRect();
    const right = (cr.right - o.left) / sc + 10; // default: beside the figure, not on top of it
    const l = right + POP_W + 8 <= o.width / sc ? right : (cr.left - o.left) / sc - POP_W - 10;
    const t = (sr.top - o.top) / sc + 8;
    this.placePop(this.popPos?.l ?? l, this.popPos?.t ?? t);
    if (this.focusX) { el.querySelector(`.ex[data-x="${this.focusX}"] input`)?.select(); this.focusX = null; }
  }

  t_settings() {
    const r = (k, l, min, max, step, u) => `<label>${l}<input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${S(k)}"><output>${S(k)}</output><em>${u}</em></label>`;
    const cb = (k, l) => `<label class="cb"><input type="checkbox" data-set="${k}" ${S(k) ? "checked" : ""}> ${l}</label>`;
    return `<div class="set">${r("uiScale", "Panel size", 60, 140, 5, "%")}${r("stageRows", "Stage rows shown", 1.5, 3.5, 0.5, "")}${r("baseHeight", "Portrait height", 30, 120, 1, "vh")}${r("bottom", "Bottom offset", -200, 200, 1, "px")}${r("speed", "Move speed", 0, 1500, 10, "ms")}${r("dim", "Inactive brightness", 0, 100, 5, "%")}
      ${cb("showGuides", "Show slot markers (GM only)")}<div><button data-act="clear">Clear live stage</button></div></div>`;
  }

  /* --- expression menu (opened from the face button under a character) --- */
  closeMenu() { this.menuEl.hidden = true; }

  openMenu(btn) {
    const sid = btn.closest("[data-s]")?.dataset.s, i = btn.closest("[data-i]")?.dataset.i;
    const el = this.menuEl;
    if (!el.hidden && el.dataset.s === sid && el.dataset.i === i) return this.closeMenu(); // second click closes
    const { chars, stages } = getState();
    const sl = stages.find((x) => x.id === sid)?.slots[Number(i)];
    const c = chars.find((x) => x.id === sl?.char);
    if (!c) return;
    el.dataset.s = sid;
    el.dataset.i = i;
    el.innerHTML = exprList(c).map((x) => `<button data-act="setexpr" data-x="${x.id}" class="${x.id === (sl.expr ?? "default") ? "on" : ""}"><img src="${esc(x.img)}"><span>${esc(x.name)}</span></button>`).join("");
    el.hidden = false;
    const sc = S("uiScale") / 100, o = this.el.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const est = (exprList(c).length * 26 + 8) * sc;
    const vl = clamp(br.left, 0, Math.max(0, innerWidth - 150 * sc));
    const vt = br.bottom + est > innerHeight ? Math.max(0, br.top - est - 2) : br.bottom + 2;
    el.style.left = `${(vl - o.left) / sc}px`;
    el.style.top = `${(vt - o.top) / sc}px`;
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
    } else if (t.dataset.set === "uiScale") this.applyScale(v);
    else if (t.dataset.set === "stageRows") this.applyRows(v);
    else if (t.dataset.set) stage.vars({ [t.dataset.set]: v });
  }

  onChange(e) {
    const t = e.target, f = t.dataset.f;
    const id = t.closest("[data-id]")?.dataset.id, sid = t.closest("[data-s]")?.dataset.s;
    if (t.type === "number" && t.value === "") return;
    if (t.dataset.set) return game.settings.set(MOD, t.dataset.set, t.type === "checkbox" ? t.checked : Number(t.value));
    if (f === "warpsel") { this.warpSel = t.value; return this.renderBody(); }
    if (f === "sname") return commit((s) => { stg(s, sid).name = t.value.trim() || "Stage"; });
    if (f === "slot") {
      const i = Number(t.closest("[data-i]").dataset.i);
      return commit((s) => { stg(s, sid).slots[i] = { ...emptySlot(), char: t.value || null }; });
    }
    if (f === "xname") {
      const x = t.closest("[data-x]").dataset.x, v = t.value.trim() || "Expression";
      return commit((s) => { const c = s.chars.find((c) => c.id === id); if (x === "default") c.dname = v; else c.exprs.find((q) => q.id === x).name = v; });
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
    const { slots } = getState(); // live stage
    const id = slots[i].char;
    if (!id) return;
    this.busy = true;
    const solo = slots.filter((x) => x.char).length === 1;
    this.send({ t: "exit", id, dir: !solo && i < SLOTS / 2 ? -1 : 1 });
    await sleep(EXIT_MS + 100);
    await commit((s) => { const L = stg(s, s.live).slots; const k = L.findIndex((x) => x.char === id); if (k >= 0) L[k] = emptySlot(); });
    this.busy = false;
  }

  async act(t) {
    const a = t.dataset.act;
    const id = t.closest("[data-id]")?.dataset.id;
    const sid = t.closest("[data-s]")?.dataset.s;
    const xid = t.closest("[data-x]")?.dataset.x;
    const i = Number(t.closest("[data-i]")?.dataset.i);
    const ch = (s) => s.chars.find((c) => c.id === id);

    if (a === "fold") { this.open = !this.open; this.sync(); this.renderBody(); return this.save(); }

    // characters
    if (a === "add" || a === "reimg") {
      const path = await pickImage();
      if (!path) return;
      return commit((s) => {
        if (a === "add") s.chars.push({ id: foundry.utils.randomID(), name: nameOf(path), img: path, scale: 1, x: 0, y: 0 });
        else ch(s).img = path;
      });
    }
    if (a === "del") return commit((s) => { s.chars = s.chars.filter((c) => c.id !== id); s.stages.forEach((st) => st.slots.forEach((x, k) => { if (x.char === id) st.slots[k] = emptySlot(); })); });

    // detail popup
    if (a === "pick") return this.openPop(id);
    if (a === "popclose") { this.pop = null; this.renderBody(); return this.renderPop(); }
    if (a === "reset") return commit((s) => { Object.assign(ch(s), { scale: 1, x: 0, y: 0 }); }).then(() => this.renderPop());
    if (a === "exadd") {
      const path = await pickImage();
      if (!path) return;
      const nid = foundry.utils.randomID();
      this.focusX = nid;
      return commit((s) => { (ch(s).exprs ??= []).push({ id: nid, name: nameOf(path), img: path }); }).then(() => this.renderPop());
    }
    if (a === "exreimg") {
      const path = await pickImage();
      if (!path) return;
      return commit((s) => { const c = ch(s); if (xid === "default") c.img = path; else c.exprs.find((q) => q.id === xid).img = path; }).then(() => this.renderPop());
    }
    if (a === "exdel") return commit((s) => {
      ch(s).exprs = ch(s).exprs.filter((q) => q.id !== xid);
      s.stages.forEach((st) => st.slots.forEach((x) => { if (x.char === id && x.expr === xid) x.expr = null; }));
    }).then(() => this.renderPop());

    // expression menu
    if (a === "expr") return this.openMenu(t);
    if (a === "setexpr") { this.closeMenu(); const mi = Number(this.menuEl.dataset.i), ms = this.menuEl.dataset.s; return commit((s) => { stg(s, ms).slots[mi].expr = xid === "default" ? null : xid; }); }

    // stages
    if (a === "hideall") return commit((s) => { s.hidden = !s.hidden; });
    if (a === "warp") return commit((s) => { s.live = sid; });
    if (a === "warpgo") { const v = t.closest(".bar").querySelector("select").value; return commit((s) => { if (stg(s, v)) s.live = v; }); }
    if (a === "newstage") { this.toEnd = true; return commit((s) => { s.stages.push({ id: foundry.utils.randomID(), name: `Stage ${s.stages.length + 1}`, slots: Array.from({ length: SLOTS }, emptySlot) }); }); }
    if (a === "dup") { this.toEnd = true; return commit((s) => { const src = stg(s, sid); s.stages.push({ id: foundry.utils.randomID(), name: `${src.name} copy`, slots: structuredClone(src.slots) }); }); }
    if (a === "delstage") return commit((s) => { if (s.stages.length < 2) return; s.stages = s.stages.filter((x) => x.id !== sid); if (s.live === sid) s.live = s.stages[0].id; });
    if (a === "clear") return commit((s) => { stg(s, s.live).slots = Array.from({ length: SLOTS }, emptySlot); });

    // slots
    if (a === "active") return commit((s) => { const sl = stg(s, sid).slots[i]; sl.active = !sl.active; });
    if (a === "flip") return commit((s) => { const sl = stg(s, sid).slots[i]; sl.flip = !sl.flip; });
    if (a === "left" || a === "right") return commit((s) => { push(stg(s, sid).slots, i, a === "left" ? -1 : 1); });
    if (a === "shake") return this.send({ t: "shake", id: getState().slots[i].char });
    if (a === "exit") return this.exit(i);
  }
}

/* ---------- hooks ---------- */
Hooks.once("init", () => {
  const refresh = () => { stage?.render(); panel?.refresh(); };
  const world = (key, type, def) => game.settings.register(MOD, key, { scope: "world", config: false, type, default: def, onChange: refresh });
  world("state", Object, { chars: [], stages: [] });
  world("baseHeight", Number, 75);
  world("bottom", Number, 0);
  world("speed", Number, 450);
  world("dim", Number, 50);
  game.settings.register(MOD, "showGuides", { scope: "client", config: false, type: Boolean, default: true, onChange: refresh });
  game.settings.register(MOD, "uiScale", { scope: "client", config: false, type: Number, default: 100, onChange: () => panel?.applyScale() });
  game.settings.register(MOD, "stageRows", { scope: "client", config: false, type: Number, default: 2.5, onChange: () => panel?.applyRows() });
  game.settings.register(MOD, "panel", { scope: "client", config: false, type: Object, default: { x: 90, y: 90, tab: "scene", open: true } });
});

Hooks.once("ready", () => {
  stage = new Stage();
  stage.render();
  game.socket.on(SOCK, (d) => stage?.fx(d));
  if (game.user.isGM) panel = new Panel();
});
