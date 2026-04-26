import { getCurrentUser } from "../firebase/auth.js";
import { getContacts } from "../firebase/firestore.js";
import { startLiveTracking8Hours, stopLiveTracking } from "../utils/live-location.js";
import { confirmT, t, translateTemplate } from "../utils/language.js";

let sosInProgress = false;
let sosCountdownInProgress = false;

function showToast(message, type) {
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast) toast.remove();
    }, 5000);
}

async function getCurrentLocationForEmail() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ lat: 0, lng: 0 });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            () => {
                resolve({ lat: 0, lng: 0 });
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

function showSosCountdownModal() {
    if (document.getElementById("globalSosCountdownModal")) {
        document.getElementById("globalSosCountdownModal").remove();
    }

    const modal = document.createElement("div");
    modal.id = "globalSosCountdownModal";
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        z-index: 12000;
    `;

    modal.innerHTML = `
        <div style="width:100%;max-width:420px;background:white;border-radius:26px;padding:28px 24px;text-align:center;box-shadow:0 24px 45px rgba(0,0,0,0.28);">
            <div style="display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:999px;background:#fff0f0;color:#8B0000;font-size:13px;font-weight:800;margin-bottom:14px;">SOS Countdown</div>
            <h2 style="color:#2a2a2a;font-size:30px;margin-bottom:12px;line-height:1.2;">Sending SOS in <span id="globalSosCountdownValue">5</span> seconds</h2>
            <p style="color:#666;font-size:15px;line-height:1.6;margin-bottom:20px;">Your emergency alert will be sent automatically unless you cancel it.</p>
            <button id="globalCancelSosCountdownBtn" style="border:none;background:#f0f0f0;color:#5c5c5c;padding:13px 20px;border-radius:999px;font-size:14px;font-weight:700;cursor:pointer;min-width:140px;">Cancel</button>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

function waitForSosCountdown() {
    if (sosCountdownInProgress) {
        showToast(t("SOS countdown already running..."), "info");
        return Promise.resolve(false);
    }

    sosCountdownInProgress = true;

    return new Promise((resolve) => {
        const modal = showSosCountdownModal();
        const valueEl = modal.querySelector("#globalSosCountdownValue");
        const cancelBtn = modal.querySelector("#globalCancelSosCountdownBtn");
        let secondsLeft = 5;
        let finished = false;

        const cleanup = (shouldSend) => {
            if (finished) return;
            finished = true;
            clearInterval(intervalId);
            modal.remove();
            sosCountdownInProgress = false;
            resolve(shouldSend);
        };

        const intervalId = setInterval(() => {
            secondsLeft -= 1;
            if (valueEl) {
                valueEl.textContent = String(Math.max(0, secondsLeft));
            }

            if (secondsLeft <= 0) {
                cleanup(true);
            }
        }, 1000);

        cancelBtn?.addEventListener("click", () => {
            showToast(t("SOS cancelled."), "info");
            cleanup(false);
        });

        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                showToast(t("SOS cancelled."), "info");
                cleanup(false);
            }
        });
    });
}

function sanitizePhoneNumber(phone) {
    if (!phone) return "";
    return String(phone).replace(/[^\d+]/g, "");
}

function showPriorityCallBanner(contact) {
    if (!contact || !contact.phone) return;

    const existingBanner = document.getElementById("priorityCallBanner");
    if (existingBanner) existingBanner.remove();

    const phoneNumber = sanitizePhoneNumber(contact.phone);
    if (!phoneNumber) return;

    const banner = document.createElement("div");
    banner.id = "priorityCallBanner";
    banner.style.cssText = `
        position: fixed;
        top: 88px;
        left: 10px;
        right: 10px;
        background: linear-gradient(135deg, #8B0000, #c11f1f);
        color: white;
        padding: 14px 16px;
        border-radius: 14px;
        z-index: 9999;
        box-shadow: 0 6px 16px rgba(0,0,0,0.25);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
    `;

    banner.innerHTML = `
        <div>
            <div style="font-weight:700;">Priority contact ready</div>
            <div style="font-size:13px; opacity:0.92;">Call ${contact.name || "priority contact"} at ${contact.phone}</div>
        </div>
        <button id="priorityCallBannerBtn" style="border:none; background:white; color:#8B0000; border-radius:999px; padding:10px 16px; font-weight:700; cursor:pointer;">Call Now</button>
    `;

    banner.querySelector("#priorityCallBannerBtn")?.addEventListener("click", () => {
        window.location.href = `tel:${phoneNumber}`;
    });

    document.body.appendChild(banner);

    setTimeout(() => {
        banner.remove();
    }, 12000);
}

function attemptPriorityCall(contact) {
    if (!contact || !contact.phone) return false;

    const phoneNumber = sanitizePhoneNumber(contact.phone);
    if (!phoneNumber) return false;

    showPriorityCallBanner(contact);

    setTimeout(() => {
        window.location.href = `tel:${phoneNumber}`;
    }, 800);

    return true;
}

async function executeSOS(options = {}) {
    if (sosInProgress) {
        showToast(t("SOS already in progress..."), "error");
        return;
    }

    sosInProgress = true;

    const user = getCurrentUser();
    if (!user) {
        showToast(t("Please login first"), "error");
        sosInProgress = false;
        return;
    }

    let contacts = await getContacts(user.userId);
    if (contacts.length === 0) {
        showToast(t("No emergency contacts found! Please add contacts first."), "error");
        sosInProgress = false;
        return;
    }

    contacts.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    const priorityContact = contacts.find((contact) => sanitizePhoneNumber(contact.phone));
    if (options.limit && Number.isFinite(options.limit)) {
        contacts = contacts.slice(0, options.limit);
    }

    const sosBtn = document.getElementById("sosCard");
    const originalText = sosBtn ? sosBtn.innerHTML : "";

    try {
        if (sosBtn) {
            sosBtn.innerHTML = `<span style="opacity:0.7;">${t("Starting live tracking...")}</span>`;
        }

        const liveTrackingLink = await startLiveTracking8Hours();
        const location = await getCurrentLocationForEmail();
        const currentTime = new Date().toLocaleString();
        const endTime = new Date(Date.now() + (8 * 60 * 60 * 1000)).toLocaleString();

        if (sosBtn) {
            sosBtn.innerHTML = `<span style="opacity:0.7;">${t("Sending alerts...")}</span>`;
        }

        const emailContacts = contacts.filter((contact) => contact.email && contact.email.trim() !== "");
        const failedEmails = [];
        let emailCount = 0;

        if (emailContacts.length > 0) {
            if (typeof emailjs === "undefined") {
                throw new Error("EmailJS not loaded");
            }

            const emailResults = await Promise.allSettled(
                emailContacts.map((contact) => {
                    const templateParams = {
                        to_email: contact.email.trim(),
                        name: user.name || "User",
                        time: currentTime,
                        liveTrackingLink,
                        endTime,
                        duration: "8",
                        locationUrl: `https://www.google.com/maps?q=${location.lat},${location.lng}`
                    };

                    return emailjs.send("her-suralh-service", "template_4vlif4s", templateParams);
                })
            );

            emailResults.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    emailCount++;
                } else {
                    const failedEmail = emailContacts[index]?.email || "unknown";
                    console.error(`Email failed for ${failedEmail}:`, result.reason);
                    failedEmails.push(failedEmail);
                }
            });
        }

        setTimeout(() => {
            if (sosBtn) {
                sosBtn.innerHTML = originalText;
            }
            sosInProgress = false;
        }, 2000);

        const contextLabel = options.reason === "safety_timer" ? "Travel timer SOS" : "SOS";
        showToast(`${contextLabel} sent to ${emailCount} contact${emailCount > 1 ? 's' : ''}!`, 'success');

        setTimeout(() => {
            showToast('Live tracking active for 8 hours! Location updates every 30 sec', 'info');
        }, 1500);

        setTimeout(() => {
            showToast('Keep GPS ON for accurate tracking', 'info');
        }, 3000);

        if (failedEmails.length > 0) {
            setTimeout(() => {
                showToast(`Failed to send to: ${failedEmails.length} contact(s)`, 'error');
            }, 4500);
        }

        showTrackingBanner(endTime, liveTrackingLink);

        if (options.reason !== "safety_timer" && priorityContact) {
            setTimeout(() => {
                const didAttemptCall = attemptPriorityCall(priorityContact);
                if (didAttemptCall) {
                    showToast(`Calling priority contact: ${priorityContact.name || priorityContact.phone}`, "info");
                }
            }, 700);
        }
    } catch (error) {
        console.error("SOS Error:", error);
        showToast(t("Failed to trigger SOS. Please check internet connection."), "error");
        if (sosBtn) {
            sosBtn.innerHTML = originalText;
        }
        sosInProgress = false;
    }
}

export async function triggerSOS(options = {}) {
    if (!options.skipCountdown) {
        const shouldSend = await waitForSosCountdown();
        if (!shouldSend) {
            return false;
        }
    }

    await executeSOS(options);
    return true;
}

function showTrackingBanner(endTime, trackingLink) {
    const existingBanner = document.getElementById('liveTrackingBanner');
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement('div');
    banner.id = 'liveTrackingBanner';
    banner.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 10px;
        right: 10px;
        background: linear-gradient(135deg, #ff4444, #cc0000);
        color: white;
        padding: 12px 16px;
        border-radius: 12px;
        text-align: center;
        font-size: 13px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        cursor: pointer;
        animation: slideUp 0.3s ease;
    `;

    banner.innerHTML = `
        LIVE TRACKING ACTIVE (8 hours)<br>
        <small>Location updating every 30 seconds</small><br>
        <small>Ends at: ${new Date(endTime).toLocaleTimeString()}</small>
        <hr style="margin: 8px 0; border-color: rgba(255,255,255,0.3);">
        <small>Tap to stop tracking</small>
    `;

    banner.onclick = () => {
        if (confirmT("Stop live tracking?\n\nYour contacts will no longer be able to see your location.")) {
            stopLiveTracking();
            banner.remove();
            showToast(t("Live tracking stopped"), "success");
        }
    };

    document.body.appendChild(banner);
}

export function checkReturnFromCall() {
    console.log("Checked return from call");
}

window.triggerSOS = triggerSOS;
