import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getCurrentUser, isLoggedIn } from "../firebase/auth.js";
import { db } from "../firebase/firebase-config.js";
import { initFakeCallWatcher } from "../utils/fake-call-scheduler.js";
import { initSafetyTimerWatcher } from "../utils/safety-timer.js";
import { alertT, applyTranslations, t, translateTemplate } from "../utils/language.js";
import { triggerSOS } from "./sos-button.js";

if (!isLoggedIn()) {
    window.location.href = "login.html";
}

const user = getCurrentUser();
const notesInput = document.getElementById("emergencyNotesInput");
const notesStatus = document.getElementById("notesStatus");
const saveNotesBtn = document.getElementById("saveNotesBtn");
const clearNotesBtn = document.getElementById("clearNotesBtn");
const savedNotesList = document.getElementById("savedNotesList");
let savedNotes = [];
applyTranslations();

function setStatus(message, type = "") {
    if (!notesStatus) return;
    notesStatus.textContent = message;
    notesStatus.className = `notes-status ${type}`.trim();
}

function openCurrentLocation() {
    if (!navigator.geolocation) {
        alertT("Geolocation is not supported by your browser.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            sessionStorage.setItem("userLat", latitude);
            sessionStorage.setItem("userLng", longitude);
            window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, "_blank");
        },
        (error) => {
            alert(`${t("Unable to get location:")} ${error.message}`);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatSavedTime(value) {
    if (!value) return t("Saved recently");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("Saved recently");
    return date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
    });
}

function renderSavedNotes() {
    if (!savedNotesList) return;

    if (!savedNotes.length) {
        savedNotesList.innerHTML = `<div class="notes-empty">${t("No saved notes yet. Write one above and tap Save Notes.")}</div>`;
        return;
    }

    savedNotesList.innerHTML = savedNotes
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .map((note) => `
            <article class="saved-note-card">
                <div class="saved-note-text">${escapeHtml(note.text)}</div>
                <div class="saved-note-footer">
                    <span class="saved-note-time">${escapeHtml(formatSavedTime(note.createdAt))}</span>
                    <button class="delete-note-btn" data-note-id="${escapeHtml(note.id)}">${t("Delete")}</button>
                </div>
            </article>
        `)
        .join("");
}

async function loadNotes() {
    if (!user?.userId) {
        setStatus(t("Please log in to use notes."), "error");
        return;
    }

    try {
        const userRef = doc(db, "users", user.userId);
        const userSnap = await getDoc(userRef);
        const data = userSnap.exists() ? userSnap.data() : {};
        savedNotes = Array.isArray(data.emergencyNotesList) ? data.emergencyNotesList : [];
        renderSavedNotes();
        setStatus(savedNotes.length ? t("Your saved notes are loaded below.") : t("Write details and save them to your account."));
    } catch (error) {
        console.error("Could not load notes:", error);
        setStatus(t("Could not load your notes right now."), "error");
    }
}

async function saveNotes() {
    if (!user?.userId) {
        setStatus(t("Please log in to save notes."), "error");
        return;
    }

    const noteText = notesInput.value.trim();
    if (!noteText) {
        setStatus(t("Write a note first before saving."), "error");
        return;
    }

    saveNotesBtn.disabled = true;
    setStatus(t("Saving your notes..."));

    try {
        const userRef = doc(db, "users", user.userId);
        const newNote = {
            id: `${Date.now()}`,
            text: noteText,
            createdAt: new Date().toISOString()
        };
        const updatedNotes = [newNote, ...savedNotes];
        await updateDoc(userRef, {
            emergencyNotesList: updatedNotes,
            emergencyNotesUpdatedAt: new Date()
        });
        savedNotes = updatedNotes;
        notesInput.value = "";
        renderSavedNotes();
        setStatus(t("Emergency notes saved to your account."), "success");
    } catch (error) {
        console.error("Could not save notes:", error);
        setStatus(t("Could not save your notes. Please try again."), "error");
    } finally {
        saveNotesBtn.disabled = false;
    }
}

function clearNotes() {
    notesInput.value = "";
    setStatus(t("Editor cleared. Your saved note cards below are unchanged."));
}

async function deleteNote(noteId) {
    if (!user?.userId) return;

    const updatedNotes = savedNotes.filter((note) => note.id !== noteId);

    try {
        const userRef = doc(db, "users", user.userId);
        await updateDoc(userRef, {
            emergencyNotesList: updatedNotes,
            emergencyNotesUpdatedAt: new Date()
        });
        savedNotes = updatedNotes;
        renderSavedNotes();
        setStatus(t("Saved note deleted."), "success");
    } catch (error) {
        console.error("Could not delete note:", error);
        setStatus(t("Could not delete this note right now."), "error");
    }
}

if (user?.name) {
    const firstName = user.name.split(" ")[0];
    document.getElementById("welcomeMessage").textContent = translateTemplate("notes_header", { name: firstName });
}

saveNotesBtn?.addEventListener("click", saveNotes);
clearNotesBtn?.addEventListener("click", clearNotes);

notesInput?.addEventListener("input", () => {
    setStatus(t("Unsaved changes in notes."));
});

savedNotesList?.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-note-id]");
    if (!deleteButton) return;
    deleteNote(deleteButton.dataset.noteId);
});

document.getElementById("calculatorBtn")?.addEventListener("click", () => {
    window.location.href = "stealth.html";
});

document.getElementById("helpBtn")?.addEventListener("click", () => {
    window.location.href = "help.html";
});

document.getElementById("homeBtn")?.addEventListener("click", () => {
    window.location.href = "dashboard.html";
});

document.getElementById("contactsBtn")?.addEventListener("click", () => {
    window.location.href = "contacts.html";
});

document.getElementById("addBtn")?.addEventListener("click", () => {
    window.location.href = "add-contact.html";
});

document.getElementById("locationBtn")?.addEventListener("click", openCurrentLocation);

document.getElementById("accountBtn")?.addEventListener("click", () => {
    window.location.href = "account.html";
});

document.querySelectorAll(".icon-box").forEach((icon) => {
    icon.addEventListener("click", function() {
        document.querySelectorAll(".icon-box").forEach((item) => item.classList.remove("active"));
        this.classList.add("active");
    });
});

loadNotes();

initFakeCallWatcher({ currentPage: "notes.html" });
initSafetyTimerWatcher({
    currentPage: "notes.html",
    onTriggerSOS: async () => {
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});
