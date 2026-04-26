import { getCurrentUser, isLoggedIn } from "../firebase/auth.js";
import { triggerSOS, checkReturnFromCall } from "./sos-button.js";
import { initFakeCallWatcher } from "../utils/fake-call-scheduler.js";
import {
    startSafetyTimer,
    getSafetyTimer,
    completeSafetyTimer,
    cancelSafetyTimer,
    initSafetyTimerWatcher,
    formatTimerDuration
} from "../utils/safety-timer.js";
import { applyTranslations, alertT, confirmT, t, translateTemplate } from "../utils/language.js";

if (!isLoggedIn()) {
    window.location.href = "login.html";
}

checkReturnFromCall();
applyTranslations();

const user = getCurrentUser();
const travelTimerModal = document.getElementById("travelTimerModal");
const travelStatusCard = document.getElementById("travelStatusCard");
const travelStatusTitle = document.getElementById("travelStatusTitle");
const travelStatusSubtitle = document.getElementById("travelStatusSubtitle");
const travelStatusBadge = document.getElementById("travelStatusBadge");
const travelDestinationValue = document.getElementById("travelDestinationValue");
const travelCountdownValue = document.getElementById("travelCountdownValue");
const emergencySirenAudio = document.getElementById("emergencySirenAudio");
const sirenCard = document.getElementById("sirenCard");
const sirenCardDesc = document.getElementById("sirenCardDesc");
const sirenFlashScreen = document.getElementById("sirenFlashScreen");
const voiceTriggerToggleBtn = document.getElementById("voiceTriggerToggleBtn");
const voiceTriggerStatus = document.getElementById("voiceTriggerStatus");
const voiceTriggerBadge = document.getElementById("voiceTriggerBadge");
const voiceSosToggle = document.getElementById("voiceSosToggle");
const voiceSirenToggle = document.getElementById("voiceSirenToggle");
let sirenActive = false;
let voiceTriggerEnabled = false;
let voiceRecognition = null;
let voiceRecognitionStarting = false;

const SOS_TRIGGER_PHRASES = ["help", "help me", "sos", "send location"];
const SIREN_TRIGGER_PHRASES = ["play sound", "play siren", "siren", "police sound"];
const VOICE_SETTINGS_KEY = "voiceTriggerSettings";

function getTimeGreeting() {
    const hours = new Date().getHours();
    if (hours >= 5 && hours < 12) return "Good Morning";
    if (hours >= 12 && hours < 17) return "Good Afternoon";
    if (hours >= 17 && hours < 21) return "Good Evening";
    return "Good Night";
}

function showGreeting() {
    const welcomeEl = document.getElementById("welcomeMessage");
    if (welcomeEl && user) {
        const firstName = user.name ? user.name.split(" ")[0] : "User";
        const greeting = getTimeGreeting();
        welcomeEl.innerHTML = translateTemplate("dashboard_safe_greeting", { name: firstName });
    }
}

showGreeting();
applyVoiceTriggerSettings();

function renderSafetyTimer(timer, remainingMs) {
    if (!travelStatusCard) return;

    if (!timer || timer.status === "completed") {
        travelStatusCard.classList.add("hidden");
        return;
    }

    travelStatusCard.classList.remove("hidden");
    travelDestinationValue.textContent = timer.destination || "--";

    if (timer.status === "active") {
        travelStatusTitle.textContent = t("Travel Check-In Active");
        travelStatusSubtitle.textContent = t("Your normal travel timer is running.");
        travelStatusBadge.textContent = t("ACTIVE");
        travelCountdownValue.textContent = formatTimerDuration(remainingMs);
    } else if (timer.status === "awaiting_checkin") {
        travelStatusTitle.textContent = t("Did You Reach Safely?");
        travelStatusSubtitle.textContent = t("Please confirm now. After the 10 minute grace period, SOS will be sent to your top 4 contacts.");
        travelStatusBadge.textContent = t("CHECK IN");
        travelCountdownValue.textContent = formatTimerDuration(remainingMs);
    } else if (timer.status === "sos_triggered") {
        travelStatusTitle.textContent = t("Safety Timer Escalated");
        travelStatusSubtitle.textContent = t("Automatic SOS was triggered for this trip.");
        travelStatusBadge.textContent = t("SOS SENT");
        travelCountdownValue.textContent = t("Completed");
    }
}

function showToast(message, type) {
    const existingToast = document.querySelector(".toast-message");
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement("div");
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast) toast.remove();
    }, 5000);
}

function setVoiceTriggerState(enabled, statusText) {
    voiceTriggerEnabled = enabled;

    if (voiceTriggerBadge) {
        voiceTriggerBadge.textContent = enabled ? t("ON") : t("OFF");
        voiceTriggerBadge.classList.toggle("active", enabled);
    }

    if (voiceTriggerToggleBtn) {
        voiceTriggerToggleBtn.textContent = enabled ? t("Disable Voice Trigger") : t("Enable Voice Trigger");
    }

    if (voiceTriggerStatus) {
        voiceTriggerStatus.textContent = statusText;
    }
}

function getVoiceTriggerSettings() {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) {
        return { sosEnabled: true, sirenEnabled: true };
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        return { sosEnabled: true, sirenEnabled: true };
    }
}

function applyVoiceTriggerSettings() {
    const settings = getVoiceTriggerSettings();
    if (voiceSosToggle) {
        voiceSosToggle.checked = settings.sosEnabled !== false;
    }
    if (voiceSirenToggle) {
        voiceSirenToggle.checked = settings.sirenEnabled !== false;
    }
}

function saveVoiceTriggerSettings() {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify({
        sosEnabled: !!voiceSosToggle?.checked,
        sirenEnabled: !!voiceSirenToggle?.checked
    }));
}

function matchVoiceTrigger(transcript, phrases) {
    return phrases.some((phrase) => transcript.includes(phrase));
}

function createVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        setVoiceTriggerState(false, t("Voice trigger is not supported on this browser."));
        if (voiceTriggerToggleBtn) {
            voiceTriggerToggleBtn.disabled = true;
        }
        return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onstart = () => {
        voiceRecognitionStarting = false;
        setVoiceTriggerState(true, t("Listening for SOS and siren phrases..."));
    };

    recognition.onresult = async (event) => {
        const latestResult = event.results[event.results.length - 1];
        if (!latestResult || !latestResult.isFinal) return;

        const transcript = (latestResult[0]?.transcript || "")
            .toLowerCase()
            .trim();

        if (!transcript) return;
        const settings = getVoiceTriggerSettings();

        if (settings.sosEnabled !== false && matchVoiceTrigger(transcript, SOS_TRIGGER_PHRASES)) {
            setVoiceTriggerState(true, translateTemplate("voice_sos_detected", { transcript }));
            showToast(t("Voice trigger detected SOS phrase."), "error");
            stopVoiceRecognition();
            await triggerSOS();
            return;
        }

        if (settings.sirenEnabled !== false && matchVoiceTrigger(transcript, SIREN_TRIGGER_PHRASES)) {
            setVoiceTriggerState(true, translateTemplate("voice_siren_detected", { transcript }));
            showToast(t("Voice trigger detected siren phrase."), "info");
            await startSiren();
        }
    };

    recognition.onerror = (event) => {
        voiceRecognitionStarting = false;
        const message = event.error === "not-allowed"
            ? t("Microphone permission denied.")
            : t("Voice trigger stopped. Tap to enable again.");
        setVoiceTriggerState(false, message);
    };

    recognition.onend = () => {
        voiceRecognitionStarting = false;
        if (voiceTriggerEnabled) {
            try {
                recognition.start();
            } catch (error) {
                setVoiceTriggerState(false, t("Voice trigger stopped. Tap to enable again."));
            }
        }
    };

    return recognition;
}

function startVoiceRecognition() {
    if (voiceRecognitionStarting) return;

    if (!voiceRecognition) {
        voiceRecognition = createVoiceRecognition();
    }

    if (!voiceRecognition) return;

    voiceRecognitionStarting = true;
    voiceTriggerEnabled = true;
    setVoiceTriggerState(true, t("Starting microphone..."));

    try {
        voiceRecognition.start();
    } catch (error) {
        voiceRecognitionStarting = false;
        setVoiceTriggerState(false, t("Could not start voice trigger. Please try again."));
    }
}

function stopVoiceRecognition() {
    voiceTriggerEnabled = false;
    voiceRecognitionStarting = false;
    if (voiceRecognition) {
        try {
            voiceRecognition.stop();
        } catch (error) {
            console.error("Could not stop voice recognition:", error);
        }
    }
    setVoiceTriggerState(false, t("Microphone is off."));
}

async function startSiren() {
    if (!emergencySirenAudio) return;

    try {
        emergencySirenAudio.pause();
        emergencySirenAudio.currentTime = 0;
        emergencySirenAudio.volume = 1;
        await emergencySirenAudio.play();
        sirenActive = true;
        document.body.classList.add("siren-active");
        if (sirenCard) {
            sirenCard.classList.add("siren-playing");
        }
        if (sirenCardDesc) {
            sirenCardDesc.textContent = t("Siren and flashing warning are active. Tap the card again to stop them.");
        }
        sirenFlashScreen?.classList.remove("hidden");
        showToast(t("Emergency siren started."), "success");
    } catch (error) {
        console.error("Could not start siren:", error);
        showToast(t("Your browser may have blocked audio. Tap the siren card again."), "error");
    }
}

function stopSiren() {
    if (!emergencySirenAudio) return;

    emergencySirenAudio.pause();
    emergencySirenAudio.currentTime = 0;
    sirenActive = false;
    document.body.classList.remove("siren-active");
    if (sirenCard) {
        sirenCard.classList.remove("siren-playing");
    }
    if (sirenCardDesc) {
        sirenCardDesc.textContent = t("Tap once to start the loud siren and flashing warning screen. Tap again to stop it.");
    }
    sirenFlashScreen?.classList.add("hidden");
}

let locationRequested = false;

function requestLocationPermission() {
    if (!locationRequested && navigator.geolocation) {
        locationRequested = true;

        console.log("Requesting location permission");

        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log("Location allowed:", position.coords.latitude, position.coords.longitude);
                sessionStorage.setItem("userLat", position.coords.latitude);
                sessionStorage.setItem("userLng", position.coords.longitude);
                showToast(t("Location access granted! You can now use SOS feature."), "success");
            },
            (error) => {
                console.log("Location denied or error:", error.message);
                if (error.code === 1) {
                    showToast(t("Location access denied. Please enable location in browser settings for SOS feature."), "error");
                } else if (error.code === 2) {
                    showToast(t("Location unavailable. Please check your GPS."), "error");
                } else if (error.code === 3) {
                    showToast(t("Location request timed out. Please try again."), "error");
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }
}

function openCurrentLocation() {
    console.log("Location button clicked");
    const locationBtn = document.getElementById("locationBtn");
    const originalText = locationBtn.innerHTML;

    if (locationBtn) {
        locationBtn.innerHTML = '<span style="opacity:0.7;">...</span>';
    }

    if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        alertT("Geolocation is not supported by your browser.");
        if (locationBtn) locationBtn.innerHTML = originalText;
        return;
    }

    console.log("Requesting location...");

    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        function(position) {
            console.log("Location obtained:", position.coords);
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            sessionStorage.setItem("userLat", lat);
            sessionStorage.setItem("userLng", lng);

            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            console.log("Opening URL:", mapsUrl);

            window.open(mapsUrl, "_blank");

            if (locationBtn) locationBtn.innerHTML = originalText;
            showToast(t("Opening your location in Google Maps"), "success");
        },
        function(error) {
            console.error("Location error:", error.code, error.message);

            if (locationBtn) locationBtn.innerHTML = originalText;

            let errorMessage = "";
            let userMessage = "";

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = "Location permission denied";
                    userMessage = "Location access is blocked.\n\nPlease enable location access:\n1. Click the lock icon in address bar\n2. Go to Site Settings\n3. Set Location to Allow\n4. Refresh the page";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = "Location information unavailable";
                    userMessage = "Location information unavailable. Please check your GPS or network connection.";
                    break;
                case error.TIMEOUT:
                    errorMessage = "Location request timed out";
                    userMessage = "Location request timed out. Please try again.";
                    break;
                default:
                    errorMessage = error.message;
                    userMessage = `Unable to get location: ${error.message}`;
            }

            console.log(errorMessage);

            const cachedLat = sessionStorage.getItem("userLat");
            const cachedLng = sessionStorage.getItem("userLng");

            if (cachedLat && cachedLng) {
                console.log("Using cached location:", cachedLat, cachedLng);
                const useCached = confirm(translateTemplate("use_last_known_location", { lat: cachedLat, lng: cachedLng }));
                if (useCached) {
                    const mapsUrl = `https://www.google.com/maps?q=${cachedLat},${cachedLng}`;
                    window.open(mapsUrl, "_blank");
                    showToast(t("Using last known location"), "info");
                    return;
                }
            }

            alert(userMessage);
            showToast(errorMessage, "error");
        },
        options
    );
}

function testLocation() {
    console.log("Testing location...");

    if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        alertT("Geolocation is not supported by your browser.");
        return;
    }

    console.log("Getting location...");

    navigator.geolocation.getCurrentPosition(
        (position) => {
            console.log("Location successful!");
            console.log("Latitude:", position.coords.latitude);
            console.log("Longitude:", position.coords.longitude);
            console.log("Accuracy:", position.coords.accuracy, "meters");

            const mapsUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
            console.log("Maps URL:", mapsUrl);

            alert(translateTemplate("location_working_message", {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            }));

            window.open(mapsUrl, "_blank");
        },
        (error) => {
            console.error("Location failed:", error.code, error.message);
            let errorMsg = "";
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = "Location permission denied. Please enable location in browser settings:\n\n1. Click the lock icon in address bar\n2. Go to Site Settings\n3. Set Location to Allow\n4. Refresh the page";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = "Location information unavailable.";
                    break;
                case error.TIMEOUT:
                    errorMsg = "Location request timed out.";
                    break;
                default:
                    errorMsg = error.message;
            }
            alert(`${t("Location failed:")} ${t(errorMsg)}`);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

document.getElementById("sosCard").onclick = function() {
    triggerSOS();
};

document.getElementById("fakeCallCard").onclick = function() {
    window.location.href = "fake-call.html";
};

document.getElementById("sirenCard").onclick = async function() {
    if (sirenActive) {
        stopSiren();
        showToast(t("Emergency siren stopped."), "info");
        return;
    }

    await startSiren();
};

document.getElementById("nearbyPlacesCard").onclick = function() {
    window.location.href = "nearby-places.html";
};

document.getElementById("safetyTimerCard").onclick = function() {
    if (travelTimerModal) {
        travelTimerModal.classList.remove("hidden");
    }
};

document.getElementById("helpBtn").onclick = function() {
    window.location.href = "help.html";
};

document.getElementById("calculatorBtn").onclick = function() {
    stopSiren();
    stopVoiceRecognition();
    window.location.href = "stealth.html";
};

document.getElementById("notesBtn").onclick = function() {
    stopSiren();
    stopVoiceRecognition();
    window.location.href = "notes.html";
};

document.getElementById("homeBtn").onclick = function() {
    window.location.href = "dashboard.html";
};

document.getElementById("contactsBtn").onclick = function() {
    window.location.href = "contacts.html";
};

document.getElementById("addBtn").onclick = function() {
    window.location.href = "add-contact.html";
};

document.getElementById("locationBtn").onclick = openCurrentLocation;

document.getElementById("accountBtn").onclick = function() {
    window.location.href = "account.html";
};

document.getElementById("policeBtn").onclick = function() {
    window.location.href = "nearby-places.html?category=police";
};

document.querySelectorAll(".helpline-btn").forEach((button) => {
    button.addEventListener("click", function() {
        const number = this.dataset.number;
        if (!number) return;
        window.location.href = `tel:${number}`;
    });
});

voiceTriggerToggleBtn?.addEventListener("click", function() {
    if (voiceTriggerEnabled) {
        stopVoiceRecognition();
        return;
    }

    startVoiceRecognition();
});

voiceSosToggle?.addEventListener("change", saveVoiceTriggerSettings);
voiceSirenToggle?.addEventListener("change", saveVoiceTriggerSettings);

document.getElementById("stopSirenOverlayBtn")?.addEventListener("click", () => {
    stopSiren();
    showToast(t("Emergency siren stopped."), "info");
});

document.querySelectorAll(".icon-box").forEach(icon => {
    icon.addEventListener("click", function() {
        document.querySelectorAll(".icon-box").forEach(i => i.classList.remove("active"));
        this.classList.add("active");
    });
});

if (window.location.pathname.includes("dashboard.html") || window.location.pathname === "/" || window.location.pathname === "/index.html") {
    const homeIcon = document.getElementById("homeBtn")?.closest(".icon-box");
    if (homeIcon) {
        homeIcon.classList.add("active");
    }
}

setTimeout(() => {
    requestLocationPermission();
}, 1000);

initFakeCallWatcher({ currentPage: "dashboard.html" });
initSafetyTimerWatcher({
    currentPage: "dashboard.html",
    onTick: (timer, remainingMs) => renderSafetyTimer(timer, remainingMs),
    onTriggerSOS: async () => {
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});

document.getElementById("closeTravelModalBtn").onclick = function() {
    travelTimerModal.classList.add("hidden");
};

document.getElementById("cancelTravelSetupBtn").onclick = function() {
    travelTimerModal.classList.add("hidden");
};

document.getElementById("startTravelTimerBtn").onclick = function() {
    const destination = document.getElementById("travelDestinationInput").value.trim();
    const travelMinutes = document.getElementById("travelDurationInput").value.trim();

    if (!destination || !travelMinutes) {
        alertT("Please enter your destination and travel time.");
        return;
    }

    const started = startSafetyTimer(destination, travelMinutes);
    if (!started) {
        alertT("Could not start the safety timer. Please check the travel time.");
        return;
    }

    travelTimerModal.classList.add("hidden");
    document.getElementById("travelDestinationInput").value = "";
    document.getElementById("travelDurationInput").value = "";
    renderSafetyTimer(getSafetyTimer(), Number(travelMinutes) * 60 * 1000);
    showToast(t("Travel check-in started. Remember to confirm when you arrive."), "success");
};

document.getElementById("reachedSafeBtn").onclick = function() {
    completeSafetyTimer();
    renderSafetyTimer(null, 0);
    showToast(t("Glad you reached safely. Your timer has been completed."), "success");
};

document.getElementById("cancelTravelBtn").onclick = function() {
    cancelSafetyTimer();
    renderSafetyTimer(null, 0);
    showToast(t("Travel check-in cancelled."), "info");
};

travelTimerModal?.addEventListener("click", function(event) {
    if (event.target === travelTimerModal) {
        travelTimerModal.classList.add("hidden");
    }
});

window.addEventListener("beforeunload", stopSiren);
window.addEventListener("beforeunload", stopVoiceRecognition);

window.openCurrentLocation = openCurrentLocation;
window.showToast = showToast;
window.testLocation = testLocation;

console.log("Dashboard loaded successfully");
console.log("Tip: Run 'testLocation()' in console to test location functionality");
