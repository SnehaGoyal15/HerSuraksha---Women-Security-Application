import { initFakeCallWatcher } from "./fake-call-scheduler.js";

function getCurrentPage() {
    const pageName = window.location.pathname.split("/").pop();
    return pageName || "index.html";
}

const stopWatching = initFakeCallWatcher({
    currentPage: getCurrentPage()
});

window.addEventListener("pagehide", stopWatching, { once: true });
