(() => {
  function waitForReadability(callback) {
    if (typeof Readability === "function") return callback();

    const checkInterval = setInterval(() => {
      if (typeof Readability === "function") {
        clearInterval(checkInterval);
        callback();
      }
    }, 50);
  }

  waitForReadability(() => {
    console.log("fluffkiller: Readability is ready, extracting...");

    const article = new Readability(document.cloneNode(true)).parse();
    const _container = document.createElement("div");
    _container.innerHTML = article?.content || "";
    const paragraphs = Array.from(_container.querySelectorAll("p"))
      .map((p) => p.innerText.trim())
      .filter(Boolean);

    window.postMessage({ type: "fluffkiller_ARTICLE", paragraphs }, "*");
  });
})();
