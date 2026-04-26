import {
    scheduleFakeCall,
    clearScheduledFakeCall,
    getScheduledFakeCall,
    getRemainingFakeCallSeconds,
    markFakeCallTriggered
} from "../utils/fake-call-scheduler.js";
import { initSafetyTimerWatcher } from "../utils/safety-timer.js";
import { alertT, applyTranslations, t, translateTemplate } from "../utils/language.js";

applyTranslations();

const ringtone = document.getElementById("ringtone");
const schedulerScreen = document.getElementById("schedulerScreen");
const incomingScreen = document.getElementById("incomingScreen");
const scheduleStatus = document.getElementById("scheduleStatus");
const customDelayWrap = document.getElementById("customDelayWrap");
const customDelayInput = document.getElementById("customDelayInput");
const scheduleOptions = document.querySelectorAll(".schedule-option");

const fakeName = localStorage.getItem("fakeCallName") || "Mom";
const fakeNumber = localStorage.getItem("fakeCallNumber") || "+91 9876543210";
const fakeRingtonePreference = localStorage.getItem("fakeCallRingtone") || "default";

let selectedDelay = 30;
let fakeCallTimer = null;
let countdownTimer = null;

document.getElementById("previewCallerName").innerText = fakeName;
document.getElementById("previewCallerNumber").innerText = fakeNumber;
document.getElementById("callerName").innerText = fakeName;
document.getElementById("callerNumber").innerText = fakeNumber;

function formatCountdown(seconds) {
    if (seconds < 60) {
        return `${seconds} sec`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} min ${remainingSeconds.toString().padStart(2, "0")} sec`;
}

function updateStatus(message) {
    scheduleStatus.innerText = message;
    scheduleStatus.classList.remove("hidden");
}

function clearTimers() {
    if (fakeCallTimer) {
        clearTimeout(fakeCallTimer);
        fakeCallTimer = null;
    }

    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
}

function stopIncomingCallFeedback() {
    if (navigator.vibrate) {
        navigator.vibrate(0);
    }

    ringtone.pause();
    ringtone.currentTime = 0;
}

function playIncomingCallFeedback() {
    if (fakeRingtonePreference === "vibrate") {
        if (navigator.vibrate) {
            navigator.vibrate([400, 180, 400, 180, 400]);
        }
        return;
    }

    ringtone.playbackRate = fakeRingtonePreference === "bell" ? 1.15 : 1;
    ringtone.volume = fakeRingtonePreference === "phone" ? 1 : 0.92;

    const playPromise = ringtone.play();
    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
            updateStatus(t("Tap the screen if ringtone does not start automatically."));
        });
    }
}

function showIncomingCall() {
    markFakeCallTriggered();
    schedulerScreen.classList.add("hidden");
    incomingScreen.classList.remove("hidden");
    playIncomingCallFeedback();
}

function startCountdownLoop() {
    clearTimers();

    const updateCountdown = () => {
        const remainingSeconds = getRemainingFakeCallSeconds();

        if (remainingSeconds === null) {
            scheduleStatus.classList.add("hidden");
            return;
        }

        if (remainingSeconds <= 0) {
            clearTimers();
            updateStatus(t("Incoming call now..."));
            showIncomingCall();
            return;
        }

        updateStatus(translateTemplate("fake_call_scheduled_in", { time: formatCountdown(remainingSeconds) }));
    };

    countdownTimer = setInterval(() => {
        updateCountdown();
    }, 1000);

    updateCountdown();
}

scheduleOptions.forEach((option) => {
    option.addEventListener("click", () => {
        scheduleOptions.forEach((button) => button.classList.remove("active"));
        option.classList.add("active");
        selectedDelay = option.dataset.delay;
        customDelayWrap.classList.toggle("hidden", selectedDelay !== "custom");
    });
});

document.getElementById("startFakeCallBtn").onclick = function() {
    let delaySeconds = Number(selectedDelay);

    if (selectedDelay === "custom") {
        delaySeconds = Number(customDelayInput.value.trim());

        if (!Number.isFinite(delaySeconds) || delaySeconds < 5 || delaySeconds > 600) {
            alertT("Please enter a custom delay between 5 and 600 seconds.");
            return;
        }
    }

    const scheduled = scheduleFakeCall(delaySeconds);
    if (!scheduled) {
        alertT("Could not schedule the fake call. Please try again.");
        return;
    }

    startCountdownLoop();
    setTimeout(() => {
        window.location.href = "dashboard.html";
    }, 800);
};

document.getElementById("cancelScheduleBtn").onclick = function() {
    clearTimers();
    clearScheduledFakeCall();
    window.location.href = "dashboard.html";
};

document.getElementById("acceptBtn").onclick = function() {
    clearScheduledFakeCall();
    stopIncomingCallFeedback();

    setTimeout(function() {
        window.location.href = "call-screen.html";
    }, 1000);
};

document.getElementById("declineBtn").onclick = function() {
    clearScheduledFakeCall();
    stopIncomingCallFeedback();
    window.location.href = "dashboard.html";
};

const existingSchedule = getScheduledFakeCall();
if (existingSchedule && existingSchedule.triggered) {
    showIncomingCall();
} else if (existingSchedule) {
    startCountdownLoop();
}

initSafetyTimerWatcher({
    currentPage: "fake-call.html",
    onTriggerSOS: async () => {
        const { triggerSOS } = await import("./sos-button.js");
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});

window.addEventListener("beforeunload", () => {
    clearTimers();
    stopIncomingCallFeedback();
});
