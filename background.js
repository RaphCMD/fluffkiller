chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (msg.type === "GET_TAB_ID") {
    sendResponse({ tabId });
    return true;
  }

  if (msg.type === "fluffkiller_ARTICLE_STATUS") {
    const key = `fluffkiller_is_article_${tabId}`;
    chrome.storage.local.set({ [key]: msg.isArticle });
  }
  if (msg.type === "GET_TAB_DOMAIN") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({});
      return;
    }

    chrome.tabs.get(tabId, (tab) => {
      try {
        const domain = new URL(tab.url).hostname;
        sendResponse({ tabId, domain });
      } catch (err) {
        console.error("Failed to get domain for tab", tabId, err);
        sendResponse({});
      }
    });

    return true; // important! keeps message channel open
  }
});
