    const CONFIG = {
      user: "anith-vishwanath",
      slug: "practice-creative",
      per: 100,
      channelUrl: "https://www.are.na/anith-vishwanath/practice-creative",
      channelLabel: "Practice / Creative",
    };

    const API_BASE = "https://api.are.na/v2";
    const START_DATE = "2026-10-03";
    const CACHE_KEY = "pc:channel";
    const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;
    const PIN_PREFIX = "pc:day:";
    const PIN_MAX_DAYS = 60;

    let blocks = null;
    let hasPlayedArrival = false;
    let lightboxLoadId = 0;
    let renderToken = 0;
    let renderedDay = null;
    let renderedBlockId = null;
    let midnightTimer = null;
    let needsRender = false;

    const pageTitle = document.getElementById("page-title");
    const blockSlot = document.getElementById("block-slot");
    const creditEl = document.getElementById("credit");
    const noteEl = document.getElementById("note");
    const archiveEl = document.getElementById("archive");
    const navLink = document.getElementById("nav-link");
    const imageLightbox = document.getElementById("image-lightbox");
    const imageLightboxImg = document.getElementById("image-lightbox-img");
    const imageLightboxClose = document.getElementById("image-lightbox-close");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long" });
    const dayMonthFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" });
    const dateFormat = {
      // Always "Saturday, 3 October" / "Saturday, October 3": comma after the weekday in every locale.
      format: (d) => `${weekdayFormat.format(d)}, ${dayMonthFormat.format(d)}`,
    };

    /* ---------- helpers ---------- */

    function stripHtml(html) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html || "";
      return tmp.textContent.trim();
    }

    function blockImageUrl(block) {
      if (!block.image) return null;
      return block.image.display?.url || block.image.large?.url || block.image.original?.url;
    }

    function blockImageFullUrl(block) {
      if (!block.image) return null;
      return block.image.original?.url || block.image.large?.url || block.image.display?.url;
    }

    function blockTitle(block) {
      return block.title || block.generated_title || "Untitled";
    }

    function blockText(block) {
      return stripHtml(block.content_html) || block.content || "";
    }

    function blockSourceUrl(block) {
      return block.source?.url || null;
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function escapeAttr(str) {
      return escapeHtml(str).replace(/'/g, "&#39;");
    }

    function domainFromUrl(url) {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return url;
      }
    }

    function blockAuthor(block) {
      return block.user?.full_name || block.user?.username || "Unknown";
    }

    function isPdf(block) {
      return block.class === "Attachment" && (block.attachment?.extension || "").toLowerCase() === "pdf";
    }

    function blockTypeLabel(block) {
      switch (block.class) {
        case "Image": return "Image";
        case "Text": return "Text";
        case "Link": return "Link";
        case "Media": return "Video";
        case "Attachment": {
          const ext = block.attachment?.extension;
          return !ext || isPdf(block) ? "PDF" : ext.toUpperCase();
        }
        default: return block.class;
      }
    }

    function isQuote(text) {
      return !/\n\s*\n/.test(text.trim()) && text.trim().length <= 280;
    }

    /* ---------- dates ---------- */

    function pad(n) {
      return String(n).padStart(2, "0");
    }

    function dateKey(d) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function parseKey(key) {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m - 1, d);
    }

    function addDays(d, n) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    }

    function dayIndex(key) {
      const a = parseKey(START_DATE);
      const b = parseKey(key);
      return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
        Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
    }

    function todayKey() {
      return dateKey(new Date());
    }

    // The pick indexes the full position-ordered channel (Channel blocks included as
    // stubs) and steps past any Channel block, so one block can be fetched on its own.
    function pickFrom(list, key) {
      if (!list || !list.length) return null;
      const start = dayIndex(key) % list.length;
      for (let i = 0; i < list.length; i++) {
        const b = list[(start + i) % list.length];
        if (isDisplayableBlock(b)) return b;
      }
      return null;
    }

    function blockFor(key) {
      return pickFrom(blocks, key);
    }

    /* ---------- storage ---------- */

    function lsGet(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    }

    function lsSet(key, value) {
      try { localStorage.setItem(key, value); } catch { /* ignore */ }
    }

    function pruneOldPins() {
      try {
        const cutoff = dateKey(addDays(new Date(), -PIN_MAX_DAYS));
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PIN_PREFIX) && k.slice(PIN_PREFIX.length) < cutoff) localStorage.removeItem(k);
        }
      } catch { /* ignore */ }
    }

    function resolveBlock(key) {
      if (key !== todayKey()) return blockFor(key);
      const pinned = lsGet(PIN_PREFIX + key);
      if (pinned) {
        const found = blocks.find((b) => String(b.id) === pinned);
        if (found) return found;
      }
      const block = blockFor(key);
      if (block) lsSet(PIN_PREFIX + key, String(block.id));
      return block;
    }

    /* ---------- channel data ---------- */

    function isDisplayableBlock(block) {
      return block.class !== "Channel";
    }

    function filterDisplayableBlocks(contents) {
      return (contents || []).filter(isDisplayableBlock);
    }

    function slimBlock(b) {
      if (b.class === "Channel") return { id: b.id, class: "Channel", position: b.position };
      const img = (i) => (i ? { url: i.url } : undefined);
      return {
        id: b.id,
        class: b.class,
        position: b.position,
        title: b.title,
        generated_title: b.generated_title,
        content: b.content,
        content_html: b.content_html,
        description_html: b.description_html,
        source: b.source ? { url: b.source.url } : null,
        image: b.image
          ? { thumb: img(b.image.thumb), large: img(b.image.large), display: img(b.image.display), original: img(b.image.original) }
          : null,
        attachment: b.attachment ? { url: b.attachment.url, extension: b.attachment.extension } : null,
        embed: b.embed ? { type: b.embed.type } : null,
        user: b.user ? { full_name: b.user.full_name, username: b.user.username } : null,
      };
    }

    async function fetchChannelBlocks() {
      const pageUrl = (page) =>
        `${API_BASE}/channels/${CONFIG.slug}/contents?per=${CONFIG.per}&page=${page}&sort=position&direction=asc`;
      const fetchPage = async (page) => {
        const res = await fetch(pageUrl(page));
        if (!res.ok) throw new Error(`Are.na API returned ${res.status}`);
        return (await res.json()).contents || [];
      };

      // Page 1 and the channel length in parallel, then every other page at once.
      const [first, length] = await Promise.all([
        fetchPage(1),
        fetch(`${API_BASE}/channels/${CONFIG.slug}?user=${CONFIG.user}&per=1`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.length ?? null)
          .catch(() => null),
      ]);
      const all = [...first];
      if (first.length >= CONFIG.per) {
        if (length) {
          const pages = [];
          for (let p = 2; p <= Math.ceil(length / CONFIG.per); p++) pages.push(fetchPage(p));
          (await Promise.all(pages)).forEach((c) => all.push(...c));
        } else {
          for (let p = 2; p < 100; p++) {
            const c = await fetchPage(p);
            all.push(...c);
            if (c.length < CONFIG.per) break;
          }
        }
      }
      // Oldest first: position 1 is the earliest block added.
      all.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return all.map(slimBlock);
    }

    let loadPromise = null;

    function loadBlocks() {
      if (blocks) return Promise.resolve(blocks);
      if (!loadPromise) loadPromise = loadBlocksOnce().finally(() => { loadPromise = null; });
      return loadPromise;
    }

    async function loadBlocksOnce() {
      let cached = null;
      try { cached = JSON.parse(lsGet(CACHE_KEY)); } catch { /* ignore */ }
      const hasCache = cached && cached.v === 2 && Array.isArray(cached.blocks) && cached.blocks.length;
      const stale = !hasCache || Date.now() - cached.fetchedAt >= CACHE_MAX_AGE;
      const refresh = async () => {
        const list = await fetchChannelBlocks();
        if (!list.some(isDisplayableBlock)) throw new Error("No displayable blocks in channel");
        lsSet(CACHE_KEY, JSON.stringify({ v: 2, fetchedAt: Date.now(), blocks: list }));
        return list;
      };
      if (hasCache) {
        // Show the cached channel immediately; refresh in the background when stale.
        blocks = cached.blocks;
        if (stale) refresh().catch((err) => console.error(err));
        return blocks;
      }
      blocks = await refresh();
      return blocks;
    }

    /* ---------- rendering ---------- */

    function renderBlock(block) {
      const type = block.class;
      const imgUrl = blockImageUrl(block);
      const text = blockText(block);
      const source = blockSourceUrl(block);

      if (type === "Image" && imgUrl) {
        const fullUrl = blockImageFullUrl(block) || imgUrl;
        return `<button type="button" class="image-expand" data-full-url="${escapeAttr(fullUrl)}" aria-label="View full size">
          <img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(blockTitle(block))}" />
        </button>`;
      }

      if (type === "Text" && text) {
        if (isQuote(text)) {
          const t = text.trim();
          const quoted = /^["“]/.test(t) ? t : `“${t}”`;
          return `<blockquote class="block-quote">${escapeHtml(quoted)}</blockquote>`;
        }
        const paras = text.split(/\n\n+/).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
        return `<div class="block-text">${paras}</div>`;
      }

      if (type === "Link" && source) {
        const preview = imgUrl ? `<img src="${escapeAttr(imgUrl)}" alt="" />` : "";
        return `
          <a class="block-link${imgUrl ? " has-preview" : ""}" href="${escapeAttr(source)}" target="_blank" rel="noopener">
            ${preview}
            <div class="link-body">
              <div class="link-title">${escapeHtml(blockTitle(block))}</div>
              <p class="link-domain">${escapeHtml(domainFromUrl(source))} ↗</p>
            </div>
          </a>`;
      }

      if (type === "Media" && (imgUrl || source)) {
        if (imgUrl && source) {
          return `<a class="block-thumb is-video" href="${escapeAttr(source)}" target="_blank" rel="noopener" aria-label="${escapeAttr(blockTitle(block))}">
            <img src="${escapeAttr(imgUrl)}" alt="" />
            <span class="play-mark" aria-hidden="true"></span>
          </a>`;
        }
        if (imgUrl) {
          return `<div class="block-thumb is-video"><img src="${escapeAttr(imgUrl)}" alt="" /><span class="play-mark" aria-hidden="true"></span></div>`;
        }
      }

      if (type === "Attachment" && imgUrl) {
        const href = block.attachment?.url;
        const img = `<img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(blockTitle(block))}" />`;
        return href
          ? `<a class="block-thumb is-pdf" href="${escapeAttr(href)}" target="_blank" rel="noopener">${img}</a>`
          : `<div class="block-thumb is-pdf">${img}</div>`;
      }

      if (imgUrl) {
        return `<img class="block-fallback-img" src="${escapeAttr(imgUrl)}" alt="${escapeAttr(blockTitle(block))}" />`;
      }

      return `<p class="block-title">${escapeHtml(blockTitle(block))}</p>`;
    }

    function renderCredit(block) {
      const blockUrl = `https://www.are.na/block/${block.id}`;
      const link = (href, label) =>
        `<a href="${escapeAttr(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
      const parts = [
        `<span class="author">${escapeHtml(blockAuthor(block))}</span>`,
        `<span>${escapeHtml(blockTypeLabel(block))}</span>`,
      ];
      const source = blockSourceUrl(block);
      if (block.class === "Media" && source) {
        parts.push(link(source, `${domainFromUrl(source)} ↗`));
      } else if (block.class === "Attachment" && block.attachment?.url) {
        parts.push(link(block.attachment.url, isPdf(block) ? "Open PDF ↗" : "Open file ↗"));
      }
      parts.push(link(blockUrl, "Open block"));
      return parts.join('<span aria-hidden="true">·</span>');
    }

    function archiveThumb(block) {
      if (block.class === "Text") {
        const t = blockText(block).slice(0, 120);
        return `<div class="archive-thumb is-text" aria-hidden="true">${escapeHtml(t)}</div>`;
      }
      const url = block.image?.thumb?.url || block.image?.square?.url || blockImageUrl(block);
      return url
        ? `<div class="archive-thumb"><img src="${escapeAttr(url)}" alt="" loading="lazy" /></div>`
        : `<div class="archive-thumb"></div>`;
    }

    function renderArchive() {
      const today = parseKey(todayKey());
      const rows = [];
      for (let d = addDays(today, -1); dateKey(d) >= START_DATE; d = addDays(d, -1)) rows.push(d);

      if (!rows.length) {
        archiveEl.innerHTML = `<p class="archive-empty">Past days will appear here.</p>`;
        return;
      }

      const monthFmt = new Intl.DateTimeFormat(undefined, { month: "long" });
      const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
      let html = "";
      let lastMonth = null;
      for (const d of rows) {
        const monthId = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthId !== lastMonth) {
          lastMonth = monthId;
          const label = d.getFullYear() === today.getFullYear() ? monthFmt.format(d) : monthYearFmt.format(d);
          html += `<div class="archive-month">${escapeHtml(label)}</div>`;
        }
        const key = dateKey(d);
        const block = blockFor(key);
        if (!block) continue;
        html += `<a class="archive-row" href="#/${key}">
          <div>
            <div class="archive-date">${escapeHtml(dateFormat.format(d))}</div>
            <div class="archive-meta">${escapeHtml(blockAuthor(block))} · ${escapeHtml(blockTypeLabel(block))}</div>
          </div>
          ${archiveThumb(block)}
        </a>`;
      }
      archiveEl.innerHTML = html;
    }

    /* ---------- lightbox ---------- */

    function closeImageLightbox() {
      lightboxLoadId += 1;
      if (imageLightbox.open) imageLightbox.close();
      imageLightboxImg.removeAttribute("src");
      imageLightboxImg.alt = "";
      imageLightboxImg.classList.remove("is-ready");
    }

    function openImageLightbox(fullUrl, alt) {
      const loadId = ++lightboxLoadId;
      imageLightboxImg.classList.remove("is-ready");
      imageLightboxImg.removeAttribute("src");
      imageLightboxImg.alt = alt;
      imageLightbox.showModal();

      const loader = new Image();
      const reveal = () => {
        if (loadId !== lightboxLoadId) return;
        imageLightboxImg.src = fullUrl;
        imageLightboxImg.classList.add("is-ready");
      };
      loader.onload = reveal;
      loader.onerror = reveal;
      loader.src = fullUrl;
    }

    /* ---------- routing ---------- */

    function parseRoute() {
      const h = location.hash.replace(/^#\/?/, "");
      if (h === "archive") return { name: "archive" };
      const m = /^(\d{4}-\d{2}-\d{2})$/.exec(h);
      if (m) {
        const key = m[1];
        const valid = !isNaN(parseKey(key).getTime()) && dateKey(parseKey(key)) === key;
        if (!valid || key < START_DATE || key >= todayKey()) return { name: "redirect" };
        return { name: "day", key };
      }
      return { name: "today" };
    }

    function wait(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    function fadeIn(el, seconds) {
      el.style.setProperty("--dur", `${seconds}s`);
      // Force the starting opacity to be committed before toggling.
      void el.offsetWidth;
      el.classList.add("is-in");
    }

    function resetPage() {
      pageTitle.hidden = false;
      blockSlot.innerHTML = "";
      blockSlot.hidden = false;
      creditEl.hidden = true;
      creditEl.innerHTML = "";
      noteEl.hidden = true;
      noteEl.innerHTML = "";
      archiveEl.hidden = true;
      archiveEl.innerHTML = "";
      pageTitle.classList.remove("fade", "is-in");
      blockSlot.classList.remove("fade", "is-in");
      creditEl.classList.remove("fade", "is-in");
    }

    function showError() {
      noteEl.innerHTML = `Today’s block couldn’t be loaded. <a href="${escapeAttr(CONFIG.channelUrl)}" target="_blank" rel="noopener">Open the channel on Are.na</a>`;
      noteEl.hidden = false;
    }

    // First visit (no cached channel): fetch just today's block (two tiny requests)
    // instead of the whole channel. Uses the same pick rule as the full list.
    async function fetchTodayBlockFast(key) {
      try {
        const meta = await fetch(`${API_BASE}/channels/${CONFIG.slug}?user=${CONFIG.user}&per=1`).then((r) => r.json());
        const length = meta?.length;
        if (!length) return null;
        const start = dayIndex(key) % length;
        for (let i = 0; i < 5; i++) {
          const page = ((start + i) % length) + 1;
          const res = await fetch(`${API_BASE}/channels/${CONFIG.slug}/contents?per=1&page=${page}&sort=position&direction=asc`);
          if (!res.ok) return null;
          const item = (await res.json()).contents?.[0];
          if (item && isDisplayableBlock(item)) return slimBlock(item);
        }
      } catch (err) {
        console.error(err);
      }
      return null;
    }

    function hasCachedChannel() {
      try { return JSON.parse(lsGet(CACHE_KEY))?.v === 2; } catch { return false; }
    }

    async function render({ animate = false } = {}) {
      const token = ++renderToken;
      const route = parseRoute();

      if (route.name === "redirect") {
        location.replace("#/");
        return;
      }

      closeImageLightbox();
      needsRender = false;
      const isToday = route.name === "today";
      const key = route.name === "day" ? route.key : todayKey();
      renderedDay = todayKey();

      resetPage();
      window.scrollTo(0, 0);
      navLink.textContent = route.name === "archive" ? "Today" : "Archive";
      navLink.href = route.name === "archive" ? "#/" : "#/archive";

      if (route.name === "archive") {
        pageTitle.textContent = "Archive";
        document.title = "Archive · Practice / Creative";
        blockSlot.hidden = true;
        try { await loadBlocks(); } catch (err) { console.error(err); }
        if (token !== renderToken) return;
        archiveEl.hidden = false;
        if (blocks) renderArchive();
        else archiveEl.innerHTML = `<p class="archive-empty">The archive couldn’t be loaded.</p>`;
        return;
      }

      pageTitle.textContent = dateFormat.format(parseKey(key));
      document.title = "Practice / Creative";

      const doAnimate = isToday && animate && !reducedMotion.matches;
      if (doAnimate) {
        pageTitle.classList.add("fade");
        blockSlot.classList.add("fade");
        creditEl.classList.add("fade");
        fadeIn(pageTitle, 0.4);
      }
      const started = performance.now();

      let block = null;
      try {
        if (isToday && !hasCachedChannel() && !blocks) {
          const pinnedId = lsGet(PIN_PREFIX + key);
          block = await fetchTodayBlockFast(key);
          if (block && pinnedId && String(block.id) !== pinnedId) block = null; // keep a pinned pick stable
          if (block) lsSet(PIN_PREFIX + key, String(block.id));
        }
        if (!block) {
          await loadBlocks();
          block = resolveBlock(key);
        }
      } catch (err) {
        console.error(err);
      }
      if (token !== renderToken) return;

      if (!block) {
        showError();
        return;
      }

      renderedBlockId = block.id;
      blockSlot.innerHTML = renderBlock(block);
      creditEl.innerHTML = renderCredit(block);

      // Fill the channel cache once the image is out of the way, so it doesn't compete for bandwidth.
      if (!blocks) {
        const img = blockSlot.querySelector("img");
        const warm = () => loadBlocks().catch((err) => console.error(err));
        if (img && !img.complete) {
          img.addEventListener("load", warm, { once: true });
          img.addEventListener("error", warm, { once: true });
          setTimeout(warm, 6000);
        } else {
          warm();
        }
      }

      if (!doAnimate) {
        creditEl.hidden = false;
        return;
      }

      // Date first, then the block, then the credit once the block has finished.
      await wait(Math.max(0, 400 - (performance.now() - started)));
      if (token !== renderToken) return;
      creditEl.hidden = false;
      fadeIn(blockSlot, 0.7);
      hasPlayedArrival = true;
      await wait(700);
      if (token !== renderToken) return;
      fadeIn(creditEl, 0.4);
    }

    /* ---------- midnight ---------- */

    function scheduleMidnight() {
      clearTimeout(midnightTimer);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = setTimeout(checkDayChange, next - now + 250);
    }

    function checkDayChange() {
      scheduleMidnight();
      if (renderedDay === todayKey()) return;
      if (document.hidden) {
        needsRender = true;
        return;
      }
      const route = parseRoute();
      render({ animate: route.name === "today" });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      if (needsRender || renderedDay !== todayKey()) {
        needsRender = false;
        const route = parseRoute();
        render({ animate: route.name === "today" });
      }
      scheduleMidnight();
    });

    /* ---------- events ---------- */

    blockSlot.addEventListener("click", (e) => {
      const btn = e.target.closest(".image-expand");
      if (!btn) return;
      const img = btn.querySelector("img");
      openImageLightbox(btn.dataset.fullUrl, img?.alt || "Image");
    });

    imageLightboxClose.addEventListener("click", closeImageLightbox);
    imageLightbox.addEventListener("click", (e) => {
      if (e.target === imageLightbox) closeImageLightbox();
    });
    imageLightbox.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeImageLightbox();
    });

    window.addEventListener("hashchange", () => render({ animate: false }));

    // Warm visit: start downloading today's image before the render pipeline runs.
    function preloadTodayImage() {
      if (parseRoute().name !== "today") return;
      try {
        const cached = JSON.parse(lsGet(CACHE_KEY));
        const pinned = lsGet(PIN_PREFIX + todayKey());
        const list = cached?.blocks;
        if (cached?.v !== 2 || !Array.isArray(list) || !list.length) return;
        const block = pinned
          ? list.find((b) => String(b.id) === pinned)
          : pickFrom(list, todayKey());
        const url = block && blockImageUrl(block);
        if (url) new Image().src = url;
      } catch { /* ignore */ }
    }

    preloadTodayImage();
    pruneOldPins();
    scheduleMidnight();
    render({ animate: !hasPlayedArrival });
