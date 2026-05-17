    const CONFIG = {
      user: "anith-vishwanath",
      slug: "practice-creative",
      per: 20,
      channelUrl: "https://www.are.na/anith-vishwanath/practice-creative",
      channelLabel: "Practice / Creative",
    };

    const API_BASE = "https://api.are.na/v2";

    let channelLength = null;
    let lastId = null;
    let busy = false;
    let lightboxLoadId = 0;
    let currentBlock = null;
    const blockHistory = [];
    const HISTORY_MAX = 5;

    const loading = document.getElementById("loading");
    const blockWrap = document.getElementById("block-wrap");
    const anotherBtn = document.getElementById("another");
    const imageLightbox = document.getElementById("image-lightbox");
    const imageLightboxImg = document.getElementById("image-lightbox-img");
    const imageLightboxClose = document.getElementById("image-lightbox-close");
    const topbarChannel = document.querySelector(".topbar-channel");
    if (topbarChannel) topbarChannel.href = CONFIG.channelUrl;

    function channelUrl(page) {
      return `${API_BASE}/channels/${CONFIG.slug}?user=${CONFIG.user}&page=${page}&per=${CONFIG.per}`;
    }

    function randomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function stripHtml(html) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html || "";
      return tmp.textContent.trim();
    }

    function blockImageUrl(block) {
      if (!block.image) return null;
      return block.image.large?.url || block.image.display?.url || block.image.original?.url;
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
        const paras = text.split(/\n\n+/).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
        return `<div class="block-text">${paras}</div>`;
      }

      if (type === "Link" && source) {
        const preview = imgUrl ? `<img src="${escapeAttr(imgUrl)}" alt="" />` : "";
        return `
          <a class="block-link" href="${escapeAttr(source)}" target="_blank" rel="noopener">
            ${preview}
            <div class="link-title">${escapeHtml(blockTitle(block))}</div>
            <p class="link-domain">${escapeHtml(domainFromUrl(source))}</p>
          </a>`;
      }

      if (type === "Media") {
        const desc = stripHtml(block.description_html);
        const body = text || desc;
        const openUrl = source;
        const thumb = imgUrl
          ? `<div class="media-thumb">
               <img src="${escapeAttr(imgUrl)}" alt="" />
               <span class="media-badge">▶ ${escapeHtml(block.embed?.type || "media")}</span>
             </div>`
          : "";
        const open = openUrl
          ? `<a class="media-open block-link" href="${escapeAttr(openUrl)}" target="_blank" rel="noopener">${thumb || escapeHtml(blockTitle(block))}</a>`
          : thumb;
        const bodyPart = body ? `<p class="media-body">${escapeHtml(body)}</p>` : "";
        return `<div class="block-media">${open}${bodyPart}</div>`;
      }

      if (imgUrl) {
        return `<img src="${escapeAttr(imgUrl)}" alt="" />`;
      }

      if (text) {
        return `<div class="block-text"><p>${escapeHtml(text)}</p></div>`;
      }

      return `<p class="loading">No preview</p>`;
    }

    function renderCardMeta(block) {
      const author = block.user?.username || block.user?.full_name || "Unknown";
      const blockUrl = `https://www.are.na/block/${block.id}`;
      return `
        <span>${escapeHtml(author)} · ${escapeHtml(block.class)} · </span>
        <a href="${escapeAttr(blockUrl)}" target="_blank" rel="noopener">Open block</a>`;
    }

    function isDisplayableBlock(block) {
      return block.class !== "Channel";
    }

    function filterDisplayableBlocks(contents) {
      return (contents || []).filter(isDisplayableBlock);
    }

    async function fetchChannelMeta() {
      const res = await fetch(channelUrl(1));
      if (!res.ok) throw new Error(`Are.na API returned ${res.status}`);
      const data = await res.json();
      channelLength = data.length;
      return data;
    }

    async function fetchRandomBlock() {
      if (channelLength == null) await fetchChannelMeta();

      const totalPages = Math.max(1, Math.ceil(channelLength / CONFIG.per));
      let block = null;
      let attempts = 0;

      while (!block && attempts < 12) {
        attempts++;
        const page = randomInt(1, totalPages);
        const res = await fetch(channelUrl(page));
        if (!res.ok) throw new Error(`Are.na API returned ${res.status}`);
        const data = await res.json();
        const eligible = filterDisplayableBlocks(data.contents);
        if (!eligible.length) continue;

        const candidate = eligible[randomInt(0, eligible.length - 1)];
        if (candidate.id === lastId && eligible.length > 1) continue;
        if (candidate.id === lastId && totalPages > 1) continue;
        block = candidate;
      }

      if (!block) {
        for (let page = 1; page <= totalPages && !block; page++) {
          const res = await fetch(channelUrl(page));
          if (!res.ok) continue;
          const data = await res.json();
          const eligible = filterDisplayableBlocks(data.contents);
          block = eligible.find((b) => b.id !== lastId) || eligible[0] || null;
        }

      }

      if (!block) throw new Error("No displayable blocks in channel");

      return block;
    }

    function pushHistory(block) {
      if (!block) return;
      const top = blockHistory[blockHistory.length - 1];
      if (top && top.id === block.id) return;
      blockHistory.push(block);
      if (blockHistory.length > HISTORY_MAX) blockHistory.shift();
    }

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

    function showBlock(block) {
      const inner = renderBlock(block);
      blockWrap.innerHTML = `
        <article class="inspiration-card">
          <div class="card-body">${inner}</div>
          <footer class="card-meta">${renderCardMeta(block)}</footer>
        </article>`;

      loading.hidden = true;
      blockWrap.hidden = false;
    }

    async function revealBlock(block, { animate = true, fromHistory = false } = {}) {
      if (animate && !blockWrap.hidden) {
        blockWrap.classList.add("is-leaving");
        await new Promise((r) => setTimeout(r, 300));
      }

      showBlock(block);
      currentBlock = block;
      lastId = block.id;
      blockWrap.classList.remove("is-leaving");
      blockWrap.classList.add("is-entering");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          blockWrap.classList.remove("is-entering");
        });
      });
    }

    async function nextBlock({ animate = true } = {}) {
      if (busy) return;
      closeImageLightbox();
      busy = true;
      anotherBtn.disabled = true;

      try {
        if (currentBlock) pushHistory(currentBlock);
        const block = await fetchRandomBlock();
        await revealBlock(block, { animate });
      } catch (err) {
        console.error(err);
        loading.hidden = false;
        loading.textContent = "Could not load channel.";
        blockWrap.hidden = true;
      } finally {
        busy = false;
        anotherBtn.disabled = false;
      }
    }

    async function previousBlock() {
      if (busy || blockHistory.length === 0) return;
      closeImageLightbox();
      busy = true;
      anotherBtn.disabled = true;

      try {
        const block = blockHistory.pop();
        await revealBlock(block, { animate: true, fromHistory: true });
      } catch (err) {
        console.error(err);
      } finally {
        busy = false;
        anotherBtn.disabled = false;
      }
    }

    anotherBtn.addEventListener("click", () => nextBlock());

    blockWrap.addEventListener("click", (e) => {
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

    document.addEventListener("keydown", (e) => {
      if (imageLightbox.open) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeImageLightbox();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        if (e.target.closest("a, input, textarea, button")) return;
        e.preventDefault();
        previousBlock();
        return;
      }
      if (e.key !== " " && e.key !== "ArrowRight") return;
      if (e.target.closest("a, input, textarea, button")) return;
      e.preventDefault();
      nextBlock();
    });

    nextBlock({ animate: false });
  
