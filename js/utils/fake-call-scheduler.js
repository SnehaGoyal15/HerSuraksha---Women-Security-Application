const STORAGE_KEY = "scheduledFakeCall";

export function scheduleFakeCall(delaySeconds) {
    const delay = Number(delaySeconds);
    if (!Number.isFinite(delay) || delay <= 0) {
        return false;
    }

    const scheduledAt = Date.now();
    const triggerAt = scheduledAt + delay * 1000;

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        delaySeconds: delay,
        scheduledAt,
        triggerAt,
        triggered: false
    }));

    return true;
}

export function getScheduledFakeCall() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const scheduledCall = JSON.parse(raw);
        if (
            !scheduledCall ||
            !Number.isFinite(Number(scheduledCall.triggerAt)) ||
            !Number.isFinite(Number(scheduledCall.scheduledAt)) ||
            !Number.isFinite(Number(scheduledCall.delaySeconds))
        ) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }

        return {
            ...scheduledCall,
            delaySeconds: Number(scheduledCall.delaySeconds),
            scheduledAt: Number(scheduledCall.scheduledAt),
            triggerAt: Number(scheduledCall.triggerAt),
            triggered: scheduledCall.triggered === true
        };
    } catch (error) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

export function clearScheduledFakeCall() {
    localStorage.removeItem(STORAGE_KEY);
}

export function getRemainingFakeCallSeconds() {
    const scheduledCall = getScheduledFakeCall();
    if (!scheduledCall) return null;

    return Math.max(0, Math.ceil((scheduledCall.triggerAt - Date.now()) / 1000));
}

export function markFakeCallTriggered() {
    const scheduledCall = getScheduledFakeCall();
    if (!scheduledCall) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...scheduledCall,
        triggered: true
    }));
}

export function shouldLaunchFakeCall() {
    const scheduledCall = getScheduledFakeCall();
    if (!scheduledCall || scheduledCall.triggered) {
        return false;
    }

    return Date.now() >= scheduledCall.triggerAt;
}

export function initFakeCallWatcher(options = {}) {
    const currentPage = options.currentPage || "";
    const destination = options.destination || "fake-call.html";
    const ignorePages = options.ignorePages || [destination, "call-screen.html"];
    const onTick = options.onTick || null;

    if (ignorePages.includes(currentPage)) {
        return () => {};
    }

    const checkAndRedirect = () => {
        const scheduledCall = getScheduledFakeCall();

        if (scheduledCall && !scheduledCall.triggered && Date.now() >= scheduledCall.triggerAt) {
            window.location.href = destination;
            return;
        }

        if (typeof onTick === "function") {
            onTick(scheduledCall, scheduledCall ? getRemainingFakeCallSeconds() : null);
        }
    };

    const handleVisibilityChange = () => {
        if (!document.hidden) {
            checkAndRedirect();
        }
    };

    checkAndRedirect();
    const intervalId = setInterval(checkAndRedirect, 1000);
    window.addEventListener("focus", checkAndRedirect);
    window.addEventListener("pageshow", checkAndRedirect);
    window.addEventListener("storage", checkAndRedirect);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
        clearInterval(intervalId);
        window.removeEventListener("focus", checkAndRedirect);
        window.removeEventListener("pageshow", checkAndRedirect);
        window.removeEventListener("storage", checkAndRedirect);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
}
