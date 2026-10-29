#!/usr/bin/env node
/**
 * perf-probe:大数据量性能实测(工单 10a/10b 验收工具,ADR-0002)。
 *
 * 前置(见 docs/perf-5000-2026-10-29.md 的方法学):
 *   1) Windows 侧 Chrome 带调试端口启动(镜像网络下 WSL 可直连 127.0.0.1);
 *      必须带防节流旗标(窗口被遮挡时 Chrome 会暂停渲染管线,冷加载虚高 2-3 倍):
 *      chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\chrome-mcp\start-page-e2e \
 *        --disable-backgrounding-occluded-windows --disable-renderer-backgrounding \
 *        --disable-background-timer-throttling
 *   2) 扩展已装载(dist 拷贝到 C:\dev\start-page-dist,经 chrome://extensions 或
 *      CDP Extensions.loadUnpacked);本脚本会找到已打开的扩展初始页,没有则自建标签。
 *   3) Node ≥ 22(原生 WebSocket/fetch)。
 *
 * 用法:
 *   node scripts/perf-probe.mjs [收藏数=5000] [扩展初始页URL] [场景=both|expanded|collapsed]
 *
 * 场景(工单 10b 起双场景):
 *   expanded  —— 折叠键清除(老用户全展开基准,10a 的回归基线):首屏计到全部卡片就位。
 *   collapsed —— 全部分组折叠(全新安装/懒挂载语义,10b 验收):首屏只挂表头,
 *                计到全部分组表头就位(首屏定义见 GLOSSARY.md:应挂载内容就位)。
 *
 * 输出:JSON —— 各场景冷加载时间线 + 六项交互的主线程同步阻塞时长(毫秒)。
 * 预算(ADR-0002):首屏 ≤500ms;纯 UI 交互 ≤100ms;存储链路交互 ≤300ms。
 */
const EXT_URL_DEFAULT =
  "chrome-extension://iggapiegngibdfkcmibepdkajojdbbcp/src/newtab/index.html";
const N = parseInt(process.argv[2] ?? "5000", 10);
const EXT_URL = process.argv[3] ?? EXT_URL_DEFAULT;
const SCENARIO = process.argv[4] ?? "both";

// ---------- CDP 连接 ----------
async function connectPage() {
  const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  let page = list.find(
    (t) => t.type === "page" && t.url.startsWith("chrome-extension://")
  );
  if (!page) {
    const ver = await (
      await fetch("http://127.0.0.1:9222/json/version")
    ).json();
    const ws0 = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((r) => (ws0.onopen = r));
    const target = await new Promise((res, rej) => {
      const id = 1;
      ws0.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id === id) {
          m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
        }
      };
      ws0.send(
        JSON.stringify({
          id,
          method: "Target.createTarget",
          params: { url: EXT_URL },
        })
      );
    });
    ws0.close();
    await new Promise((r) => setTimeout(r, 1500));
    const list2 = await (await fetch("http://127.0.0.1:9222/json/list")).json();
    page = list2.find((t) => t.targetId === target.targetId);
    if (!page) throw new Error("扩展页创建后未出现在 target 列表");
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const call = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, (m) =>
        m.error
          ? rej(new Error(method + ": " + JSON.stringify(m.error)))
          : res(m.result)
      );
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJs = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        "eval: " + JSON.stringify(r.exceptionDetails).slice(0, 600)
      );
    return r.result.value;
  };
  return { ws, call, evalJs };
}

const { ws, call, evalJs } = await connectPage();
await call("Page.enable");
await call("Runtime.enable");
await call("Page.bringToFront");

/** 等到选择器就绪(防御延迟渲染/后台节流导致的瞬态查不到) */
const waitFor = (expr, timeoutMs = 8000) =>
  evalJs(`new Promise((resolve) => {
  const t0 = Date.now()
  const iv = setInterval(() => {
    if ((${expr}) || Date.now() - t0 > ${timeoutMs}) { clearInterval(iv); resolve() }
  }, 50)
})`);

// ---------- 1. 灌数据 ----------
// collapsed = true 时把全部分组写入折叠键(全新安装/懒挂载语义);false 清除折叠键(老用户全展开基准)
const seeded = await evalJs(`(() => {
  const domains = ['github.com','stackoverflow.com','developer.mozilla.org','news.ycombinator.com','reddit.com','x.com','youtube.com','wikipedia.org','zhihu.com','juejin.cn','csdn.net','segmentfault.com','v2ex.com','bilibili.com','douyin.com','taobao.com','jd.com','pinduoduo.com','weibo.com','douban.com','imdb.com','netflix.com','spotify.com','figma.com','dribbble.com','behance.net','notion.so','obsidian.md','atlassian.com','slack.com','discord.com','telegram.org','whatsapp.com','zoom.us','teams.microsoft.com','openai.com','anthropic.com','huggingface.co','arxiv.org','leetcode.cn','nowcoder.com','coursera.org','udemy.com','nowcoder2.com','w3school.com.cn','react.dev','vuejs.org','rust-lang.org','python.org','nodejs.org']
  const topics = ['入门指南','最佳实践','源码解析','踩坑记录','性能优化','面试准备','项目实战','工具推荐','周报摘要','论文笔记']
  const groups = [{ id:'inbox', name:'收集箱', color:'#3b82f6', order:0 }]
  const defs = [['开发工具','#0ea5e9'],['技术文档','#22c55e'],['设计灵感','#a855f7'],['新闻资讯','#f97316'],['社区讨论','#ef4444'],['学习课程','#14b8a6'],['影音娱乐','#eab308'],['购物比价','#ec4899'],['AI 前沿','#6366f1']]
  defs.forEach(([name,color],i)=>groups.push({id:'g'+i,name,color,order:i+1}))
  const bookmarks = []
  const nInbox = Math.min(300, Math.floor(${N}*0.06))
  const perGroup = Math.floor((${N}-nInbox)/9)
  let k = 0
  for (let i=0;i<nInbox;i++,k++) bookmarks.push({id:'b'+k,url:'https://'+domains[k%domains.length]+'/p/'+k,title:topics[k%topics.length]+' #'+k,note:'',groupId:'inbox',order:i})
  for (let g=0;g<9;g++) for (let i=0;i<perGroup;i++,k++) bookmarks.push({id:'b'+k,url:'https://'+domains[(g*7+i)%domains.length]+'/g'+g+'/p/'+i,title:topics[i%topics.length]+' - '+groups[g+1].name+' #'+i,note:i%3===0?'稍后细读':'',groupId:'g'+g,order:i})
  const state = { schemaVersion:1, groups, bookmarks }
  ${
    SCENARIO === "collapsed" || SCENARIO === "both"
      ? "localStorage.setItem('start-page:collapsed-groups', JSON.stringify(groups.map((g) => g.id)))"
      : "localStorage.removeItem('start-page:collapsed-groups')"
  }
  return chrome.storage.local.set({ state }).then(() => ({ count: bookmarks.length, bytes: JSON.stringify(state).length, groups: groups.length, nInbox }))
})()`);
console.error(`seeded: ${JSON.stringify(seeded)}`);

// ---------- 2. 冷加载 ----------
// expectedCards:全展开场景 = 收藏总数;折叠场景 = Infinity(应挂载卡片为 0)。
// expectedGroups:两场景都计分组表头;doneOn 决定「首屏完成」以哪个标记为准。
async function coldLoad({ expectedCards, expectedGroups, doneOn }) {
  // 先预热一次导航:消除冷进程的首次解析/编译噪声
  await call("Page.navigate", { url: "about:blank" });
  await new Promise((r) => setTimeout(r, 300));
  await call("Page.navigate", { url: EXT_URL });
  await call("Page.bringToFront");
  await new Promise((r) => setTimeout(r, 2500));
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
  try {
    const M = { cards: 0, firstCards: null, cardsDone: null, groups: 0, firstGroups: null, groupsDone: null, longtasks: [] }
    window.__marks = M
    window.__expectedCards = ${expectedCards}
    window.__expectedGroups = ${expectedGroups}
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) M.longtasks.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true }) } catch {}
    const check = () => {
      M.cards = document.querySelectorAll('.card').length
      if (M.cards > 0 && M.firstCards === null) M.firstCards = performance.now()
      if (M.cards >= window.__expectedCards && M.cardsDone === null) {
        setTimeout(() => setTimeout(() => { M.cardsDone = performance.now() }, 0), 0)
      }
      M.groups = document.querySelectorAll('.group').length
      if (M.groups > 0 && M.firstGroups === null) M.firstGroups = performance.now()
      if (M.groups >= window.__expectedGroups && M.groupsDone === null) {
        setTimeout(() => setTimeout(() => { M.groupsDone = performance.now() }, 0), 0)
      }
    }
    const startObs = () => new MutationObserver(() => check()).observe(document.documentElement, { childList: true, subtree: true })
    if (document.documentElement) startObs()
    else document.addEventListener('readystatechange', () => { if (document.documentElement) startObs() }, { once: true })
  } catch (e) { window.__collectorError = String(e) }
})()`,
  });
  await call("Page.navigate", { url: "about:blank" });
  await new Promise((r) => setTimeout(r, 300));
  await call("Page.navigate", { url: EXT_URL });
  await call("Page.bringToFront");
  await evalJs(`new Promise((resolve) => {
  const t0 = Date.now()
  const iv = setInterval(() => {
    const M = window.__marks || {}
    if ((M.${doneOn} !== null) || Date.now() - t0 > 30000) { clearInterval(iv); resolve() }
  }, 100)
})`);
  await new Promise((r) => setTimeout(r, 1000));
  return evalJs(`(() => {
  const M = window.__marks || {}
  const nav = performance.getEntriesByType('navigation')[0]
  const r = Math.round
  return { cards: M.cards, groups: M.groups, expected: window.__expectedCards === Infinity ? 0 : window.__expectedCards,
    firstCards: M.firstCards != null ? r(M.firstCards) : null,
    cardsDone: M.cardsDone != null ? r(M.cardsDone) : null,
    firstGroups: M.firstGroups != null ? r(M.firstGroups) : null,
    groupsDone: M.groupsDone != null ? r(M.groupsDone) : null,
    load: r(nav.loadEventEnd),
    longtaskCount: M.longtasks.length, longtaskMax: M.longtasks.length ? Math.max(...M.longtasks) : 0,
    domNodes: document.getElementsByTagName('*').length, collectorError: window.__collectorError || null }
})()`);
}

// ---------- 3. 交互(同步阻塞时长:dispatch 前后 performance.now 差) ----------
const measure = async (expr) => evalJs(expr);

/** 添加/删除全链路(submit → storage 写 → 单提交;MutationObserver 判完成,不受定时器节流影响) */
const addBookmarkScript = `(() => {
  const setInput = (sel, value) => {
    const input = document.querySelector(sel)
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  setInput('input[placeholder="example.com"]', 'example.com/perf-probe')
  setInput('input[placeholder="留空自动取网站地址"]', '性能探针')
  const form = document.querySelector('input[placeholder="example.com"]').closest('form')
  const t0 = performance.now()
  form.requestSubmit()
  return new Promise((resolve) => {
    const mo = new MutationObserver(() => {
      if ([...document.querySelectorAll('.card')].some((c) => c.textContent.includes('性能探针'))) { mo.disconnect(); resolve() }
    })
    mo.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(resolve, 15000)
  }).then(() => Math.round(performance.now() - t0))
})()`;
const deleteBookmarkScript = `(() => {
  const card = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('性能探针'))
  if (!card) return Promise.resolve(-1)
  const del = [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === '删除')
  const t0 = performance.now()
  del.click()
  return new Promise((resolve) => {
    const mo = new MutationObserver(() => {
      if (![...document.querySelectorAll('.card')].some((c) => c.textContent.includes('性能探针'))) { mo.disconnect(); resolve() }
    })
    mo.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(resolve, 15000)
  }).then(() => Math.round(performance.now() - t0))
})()`;

/** 全展开基准(10a 回归):全部卡片挂载,交互在展开态下测。 */
async function expandedInteractions() {
  const interactions = {};
  interactions["搜索过滤 github"] = await measure(
    `window.__setInput(document.querySelector('input[aria-label="搜索收藏"]'), 'github')`
  );
  await waitFor(
    `document.querySelectorAll('.card').length < 500 && document.querySelectorAll('.card').length > 0`
  );
  interactions["清空搜索"] = await measure(
    `window.__setInput(document.querySelector('input[aria-label="搜索收藏"]'), '')`
  );
  await waitFor(
    `document.querySelectorAll('.card').length >= ${seeded.count - seeded.nInbox}`
  );
  await waitFor(
    `document.querySelector('.group button[aria-expanded="true"]') !== null`
  );
  interactions["折叠分组"] = await measure(
    `window.__clickBtn(document.querySelector('.group button[aria-expanded="true"]'))`
  );
  await waitFor(
    `document.querySelector('.group button[aria-expanded="false"]') !== null`
  );
  interactions["展开分组"] = await measure(
    `window.__clickBtn(document.querySelector('.group button[aria-expanded="false"]'))`
  );
  await waitFor(
    `document.querySelectorAll('.card').length >= ${seeded.count - seeded.nInbox}`
  );
  interactions["添加收藏"] = await measure(addBookmarkScript);
  interactions["删除收藏"] = await measure(deleteBookmarkScript);
  return interactions;
}

/**
 * 折叠场景(10b 懒挂载验收):首屏全部折叠;搜索强制展开、清空恢复折叠、
 * 展开/折叠收集箱(300 条)、添加/删除走展开的收集箱。
 */
async function collapsedInteractions() {
  const interactions = {};
  interactions["搜索过滤 github"] = await measure(
    `window.__setInput(document.querySelector('input[aria-label="搜索收藏"]'), 'github')`
  );
  await waitFor(
    `document.querySelectorAll('.card').length < 500 && document.querySelectorAll('.card').length > 0`
  );
  interactions["清空搜索"] = await measure(
    `window.__setInput(document.querySelector('input[aria-label="搜索收藏"]'), '')`
  );
  // 清空后全部恢复折叠:卡片归零、十个折叠表头
  await waitFor(`document.querySelectorAll('.card').length === 0`);
  await waitFor(
    `document.querySelectorAll('.group button[aria-expanded="false"]').length >= ${seeded.groups}`
  );
  // 展开收集箱(第一个折叠表头,order 0):懒挂载的「重挂昂贵」路径
  interactions["展开分组"] = await measure(
    `window.__clickBtn(document.querySelector('.group button[aria-expanded="false"]'))`
  );
  await waitFor(
    `document.querySelectorAll('.card').length >= ${seeded.nInbox}`
  );
  interactions["添加收藏"] = await measure(addBookmarkScript);
  interactions["删除收藏"] = await measure(deleteBookmarkScript);
  interactions["折叠分组"] = await measure(
    `window.__clickBtn(document.querySelector('.group button[aria-expanded="true"]'))`
  );
  await waitFor(`document.querySelectorAll('.card').length === 0`);
  return interactions;
}

/** 视图切换 + 全量写放大(附录指标,两场景同形) */
async function appendixInteractions() {
  const interactions = {};
  interactions["进入设置"] = await measure(
    `window.__clickBtn(document.querySelector('button[aria-label="设置"]'))`
  );
  await waitFor(`document.body.textContent.includes('搜索引擎')`);
  interactions["返回初始页"] = await measure(`(async () => {
  const back = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('返回') || b.textContent.includes('完成'))
  if (!back) return -1
  return window.__clickBtn(back)
})()`);
  await waitFor(
    `document.querySelector('input[aria-label="搜索收藏"]') !== null`
  );
  interactions["全量storage写x3"] = await measure(`(async () => {
  const s = await chrome.storage.local.get('state')
  const times = []
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    await chrome.storage.local.set({ state: s.state })
    times.push(Math.round(performance.now() - t0))
  }
  return times
})()`);
  return interactions;
}

/** 按场景重灌数据(折叠键按场景写入)→ 冷加载 → 交互。 */
async function runScenario(mode) {
  const collapsed = mode === "collapsed";
  await evalJs(`(() => {
  const ids = ['inbox', ${Array.from({ length: 9 }, (_, i) => `'g${i}'`).join(", ")}]
  ${
    collapsed
      ? "localStorage.setItem('start-page:collapsed-groups', JSON.stringify(ids))"
      : "localStorage.removeItem('start-page:collapsed-groups')"
  }
  return Promise.resolve(null)
})()`);
  const cold = await coldLoad({
    expectedCards: collapsed ? "Infinity" : `${seeded.count}`,
    expectedGroups: `${seeded.groups}`,
    doneOn: collapsed ? "groupsDone" : "cardsDone",
  });
  // 交互辅助函数注入当前文档(冷加载导航会重建 document,必须在其后安装)
  await call("Page.bringToFront");
  await evalJs(`(() => {
  window.__setInput = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    const t0 = performance.now()
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return Math.round(performance.now() - t0)
  }
  window.__clickBtn = (btn) => {
    const t0 = performance.now()
    btn.click()
    return Math.round(performance.now() - t0)
  }
})()`);
  const interactions = collapsed
    ? await collapsedInteractions()
    : await expandedInteractions();
  Object.assign(interactions, await appendixInteractions());
  return { cold, interactions };
}

const out = { seeded };
if (SCENARIO === "both" || SCENARIO === "expanded") {
  console.error("---- 场景:expanded(全展开基准,10a 回归)----");
  out.expanded = await runScenario("expanded");
}
if (SCENARIO === "both" || SCENARIO === "collapsed") {
  console.error("---- 场景:collapsed(全新安装/懒挂载,10b 验收)----");
  out.collapsed = await runScenario("collapsed");
}

console.log(JSON.stringify(out, null, 1));
ws.close();
process.exit(0);
