const STORAGE_KEY = "travelSafetyTimer";
const GRACE_PERIOD_MINUTES = 10;

export function startSafetyTimer(destination, travelMinutes) {
    const minutes = Number(travelMinutes);
    if (!destination || !Number.isFinite(minutes) || minutes <= 0) {
        return false;
    }

    const now = Date.now();
    const expectedArrival = now + minutes * 60 * 1000;

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        destination,
        travelMinutes: minutes,
        startedAt: now,
        expectedArrival,
        graceEndsAt: null,
        status: "active"
    }));

    return true;
}

export function getSafetyTimer() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

function saveSafetyTimer(timer) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
}

export function completeSafetyTimer() {
    const timer = getSafetyTimer();
    if (!timer) return;

    saveSafetyTimer({
        ...timer,
        status: "completed",
        completedAt: Date.now()
    });
}

export function cancelSafetyTimer() {
    localStorage.removeItem(STORAGE_KEY);
}

export function getRemainingSafetyTimerMs(timer = getSafetyTimer()) {
    if (!timer) return null;

    if (timer.status === "active") {
        return Math.max(0, timer.expectedArrival - Date.now());
    }

    if (timer.status === "awaiting_checkin") {
        return Math.max(0, timer.graceEndsAt - Date.now());
    }

    return 0;
}

export function evaluateSafetyTimer() {
    const timer = getSafetyTimer();
    if (!timer) {
        return { timer: null, action: null };
    }

    const now = Date.now();

    if (timer.status === "active" && now >= timer.expectedArrival) {
        const updatedTimer = {
            ...timer,
            status: "awaiting_checkin",
            graceEndsAt: timer.expectedArrival + GRACE_PERIOD_MINUTES * 60 * 1000
        };
        saveSafetyTimer(updatedTimer);
        return { timer: updatedTimer, action: "awaiting_checkin" };
    }

    if (timer.status === "awaiting_checkin" && now >= timer.graceEndsAt) {
        const updatedTimer = {
            ...timer,
            status: "sos_triggered",
            sosTriggeredAt: now
        };
        saveSafetyTimer(updatedTimer);
        return { timer: updatedTimer, action: "trigger_sos" };
    }

    return { timer, action: null };
}

export function formatTimerDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "0m 00s";

    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
    }

    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function initSafetyTimerWatcher(options = {}) {
    const currentPage = options.currentPage || "";
    const dashboardPage = options.dashboardPage || "dashboard.html";
    const onTick = options.onTick || null;
    const onTriggerSOS = options.onTriggerSOS || null;

    const checkTimer = async () => {
        const evaluation = evaluateSafetyTimer();
        const timer = evaluation.timer;

        if (typeof onTick === "function") {
            onTick(timer, getRemainingSafetyTimerMs(timer));
        }

        if (evaluation.action === "awaiting_checkin" && currentPage !== dashboardPage) {
            window.location.href = dashboardPage;
            return;
        }

        if (evaluation.action === "trigger_sos" && typeof onTriggerSOS === "function") {
            await onTriggerSOS(timer);
        }
    };

    checkTimer();
    const intervalId = setInterval(checkTimer, 1000);

    return () => clearInterval(intervalId);
}
