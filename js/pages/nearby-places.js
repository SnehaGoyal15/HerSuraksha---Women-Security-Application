import { getCurrentUser, isLoggedIn } from "../firebase/auth.js";
import { addSavedPlace, getSavedPlaces, deleteSavedPlace } from "../firebase/firestore.js";
import { initFakeCallWatcher } from "../utils/fake-call-scheduler.js";
import { initSafetyTimerWatcher } from "../utils/safety-timer.js";
import { alertT, applyTranslations, confirmT, t, translateTemplate } from "../utils/language.js";
import { triggerSOS } from "./sos-button.js";

if (!isLoggedIn()) {
    window.location.href = "login.html";
}

const user = getCurrentUser();
const placesList = document.getElementById("placesList");
const statusMessage = document.getElementById("statusMessage");
const addPlaceModal = document.getElementById("addPlaceModal");
const placeCategory = document.getElementById("placeCategory");
const placeName = document.getElementById("placeName");
const placeLink = document.getElementById("placeLink");

const categoryParam = new URLSearchParams(window.location.search).get("category");
const allowedCategories = ["police", "hospital", "atm", "saved"];
let activeCategory = allowedCategories.includes(categoryParam) ? categoryParam : "police";
let userLocation = null;
let savedPlaces = [];
let renderRequestId = 0;
applyTranslations();

const categoryMeta = {
    police: {
        label: t("Police Stations"),
        badge: t("Police"),
        query: "police station near me",
        overpass: '["amenity"="police"]'
    },
    hospital: {
        label: t("Hospitals"),
        badge: t("Hospitals"),
        query: "hospital near me",
        overpass: '["amenity"="hospital"]'
    },
    atm: {
        label: t("ATMs"),
        badge: t("ATMs"),
        query: "atm near me",
        overpass: '["amenity"="atm"]'
    },
    saved: {
        label: t("Your Saved Places"),
        badge: t("Saved by you"),
        query: "",
        overpass: ""
    }
};

function showStatus(message, type = "info") {
    statusMessage.textContent = message;
    statusMessage.className = `feedback-strip ${type}`;
    statusMessage.classList.remove("hidden");
}

function hideStatus() {
    statusMessage.classList.add("hidden");
    statusMessage.textContent = "";
    statusMessage.className = "feedback-strip hidden";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getSavedPlacesForCategory(category) {
    return savedPlaces.filter(place => place.category === category);
}

function formatDistance(distance) {
    if (!Number.isFinite(distance)) return t("Saved by you");
    if (distance < 1000) return `${Math.round(distance)} ${t("m away")}`;
    return `${(distance / 1000).toFixed(1)} ${t("km away")}`;
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    const earthRadius = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
}

async function getUserLocation() {
    const cachedLat = sessionStorage.getItem("userLat");
    const cachedLng = sessionStorage.getItem("userLng");

    if (cachedLat && cachedLng) {
        userLocation = { lat: Number(cachedLat), lng: Number(cachedLng) };
        return userLocation;
    }

    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error(t("Geolocation is not supported by your browser.")));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                sessionStorage.setItem("userLat", userLocation.lat);
                sessionStorage.setItem("userLng", userLocation.lng);
                resolve(userLocation);
            },
            () => reject(new Error(t("Unable to get location:"))),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

async function fetchNearbyPlaces(category) {
    const coords = userLocation || await getUserLocation();
    const overpassFilter = categoryMeta[category].overpass;
    const query = `
[out:json][timeout:15];
(
  node${overpassFilter}(around:5000,${coords.lat},${coords.lng});
  way${overpassFilter}(around:5000,${coords.lat},${coords.lng});
  relation${overpassFilter}(around:5000,${coords.lat},${coords.lng});
);
out center tags;
`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
        const response = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query,
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error("Overpass request failed");
        }

        const data = await response.json();
        const places = (data.elements || [])
            .map((element, index) => {
                const lat = element.lat ?? element.center?.lat;
                const lng = element.lon ?? element.center?.lon;
                if (typeof lat !== "number" || typeof lng !== "number") {
                    return null;
                }

                const distance = calculateDistance(coords.lat, coords.lng, lat, lng);
                const tags = element.tags || {};
                const addressParts = [
                    tags["addr:housename"],
                    tags["addr:housenumber"],
                    tags["addr:street"],
                    tags["addr:city"]
                ].filter(Boolean);

                return {
                    id: `overpass-${category}-${index}`,
                    name: tags.name || categoryMeta[category].label.slice(0, -1),
                    address: addressParts.join(", ") || t("Address unavailable"),
                    distance,
                    lat,
                    lng,
                    source: "live"
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.distance - b.distance);

        return places;
    } finally {
        clearTimeout(timer);
    }
}

function renderPlaces(items, category) {
    if (!items.length) {
        placesList.innerHTML = `
            <div class="empty-card">
                ${escapeHtml(translateTemplate("nearby_empty_category", { label: categoryMeta[category].label.toLowerCase() }))}
            </div>
        `;
        return;
    }

    placesList.innerHTML = items
        .map((place) => {
            const destinationLink = place.source === "live"
                ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`
                : place.mapsLink;
            const deleteAction = place.category
                ? `<button class="delete-btn" data-delete-id="${place.id}">Delete</button>`
                : "";

            return `
                <article class="place-card">
                    <div class="place-main">
                        <span class="place-badge">${escapeHtml(categoryMeta[place.category || category].badge)}</span>
                        <h3 class="place-name">${escapeHtml(place.name)}</h3>
                        <p class="place-address">${escapeHtml(place.address || t("Saved by you"))}</p>
                        <p class="place-distance">${escapeHtml(formatDistance(place.distance))}</p>
                    </div>
                    <div class="place-actions">
                        <button class="map-btn" data-map-link="${escapeHtml(destinationLink)}">Open in Google Maps</button>
                        ${deleteAction}
                    </div>
                </article>
            `;
        })
        .join("");
}

async function loadSavedPlaces() {
    if (!user?.userId) {
        savedPlaces = [];
        return;
    }

    savedPlaces = await getSavedPlaces(user.userId);
}

async function renderActiveCategory() {
    const requestId = ++renderRequestId;
    placesList.innerHTML = `<div class="loading-card">${t("Loading places...")}</div>`;
    hideStatus();

    if (activeCategory === "saved") {
        const customPlaces = getSavedPlacesForCategory("saved");
        renderPlaces(customPlaces, "saved");
        if (!customPlaces.length) {
            showStatus(t("You have not saved any custom places yet. Tap Add Your Place to add one."), "info");
        }
        return;
    }

    const fallbackPlaces = getSavedPlacesForCategory(activeCategory);
    if (fallbackPlaces.length) {
        renderPlaces(fallbackPlaces, activeCategory);
        showStatus(translateTemplate("nearby_fallback_saved", { label: categoryMeta[activeCategory].label.toLowerCase() }), "info");
    }

    try {
        const livePlaces = await fetchNearbyPlaces(activeCategory);
        if (requestId !== renderRequestId) {
            return;
        }
        const combinedPlaces = [...livePlaces, ...fallbackPlaces];

        if (!combinedPlaces.length) {
            throw new Error("No live results found");
        }

        renderPlaces(combinedPlaces, activeCategory);
        showStatus(
            fallbackPlaces.length
                ? translateTemplate("nearby_showing_live_and_saved", { label: categoryMeta[activeCategory].label.toLowerCase() })
                : translateTemplate("nearby_showing_live_only", { label: categoryMeta[activeCategory].label.toLowerCase() }),
            "success"
        );
    } catch (error) {
        if (requestId !== renderRequestId) {
            return;
        }
        renderPlaces(fallbackPlaces, activeCategory);
        if (fallbackPlaces.length) {
            showStatus(translateTemplate("nearby_fallback_saved", { label: categoryMeta[activeCategory].label.toLowerCase() }), "info");
        } else {
            showStatus(translateTemplate("nearby_fallback_none", { label: categoryMeta[activeCategory].label.toLowerCase() }), "error");
        }
    }
}

function setActiveCategory(category) {
    activeCategory = category;
    document.querySelectorAll(".category-btn").forEach((button) => {
        button.classList.toggle("active", button.dataset.category === category);
    });
    renderActiveCategory();
}

function openAddPlaceModal() {
    addPlaceModal.classList.remove("hidden");
    placeCategory.value = activeCategory === "saved" ? "saved" : activeCategory;
}

function closeAddPlaceModal() {
    addPlaceModal.classList.add("hidden");
    placeName.value = "";
    placeLink.value = "";
}

function getGoogleMapsSearchLink(category) {
    const query = categoryMeta[category]?.query;
    if (!query) {
        return "https://www.google.com/maps";
    }
    return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

async function savePlace() {
    if (!user?.userId) {
        alertT("Please log in before saving a place.");
        return;
    }

    const category = placeCategory.value;
    const name = placeName.value.trim();
    const mapsLink = placeLink.value.trim();

    if (!category) {
        alertT("Please select a category first.");
        return;
    }

    if (!name || !mapsLink) {
        alertT("Please enter the place name and Google Maps link.");
        return;
    }

    const newPlace = {
        userId: user.userId,
        category,
        name,
        mapsLink,
        address: t("Saved by you"),
        distance: Number.POSITIVE_INFINITY
    };
    
    const placeId = await addSavedPlace(newPlace);
    if (!placeId) {
        alertT("Could not save your place. Please try again.");
        return;
    }

    await loadSavedPlaces();
    closeAddPlaceModal();
    showStatus(t("Your place has been saved successfully."), "success");
    setActiveCategory(category);
}

async function deletePlace(placeId) {
    const confirmed = confirmT("Do you want to delete this saved place?");
    if (!confirmed) return;

    const deleted = await deleteSavedPlace(placeId);
    if (!deleted) {
        alertT("Could not delete this place. Please try again.");
        return;
    }

    await loadSavedPlaces();
    renderActiveCategory();
}

document.getElementById("addPlaceBtn").addEventListener("click", openAddPlaceModal);
document.getElementById("closeModalBtn").addEventListener("click", closeAddPlaceModal);
document.getElementById("savePlaceBtn").addEventListener("click", savePlace);
document.getElementById("openMapsBtn").addEventListener("click", () => {
    const category = placeCategory.value;
    if (!category) {
        alertT("Please select a category first.");
        return;
    }

    alertT('1. Select a place in Google Maps\n2. Tap Share\n3. Copy link\n4. Come back here and paste it');
    window.open(getGoogleMapsSearchLink(category), "_blank");
});

addPlaceModal.addEventListener("click", (event) => {
    if (event.target === addPlaceModal) {
        closeAddPlaceModal();
    }
});

document.querySelectorAll(".category-btn").forEach((button) => {
    button.addEventListener("click", () => setActiveCategory(button.dataset.category));
});

placesList.addEventListener("click", (event) => {
    const mapButton = event.target.closest("[data-map-link]");
    if (mapButton) {
        window.open(mapButton.dataset.mapLink, "_blank");
        return;
    }

    const deleteButton = event.target.closest("[data-delete-id]");
    if (deleteButton) {
        deletePlace(deleteButton.dataset.deleteId);
    }
});

document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.href = "dashboard.html";
});

document.getElementById("contactsBtn").addEventListener("click", () => {
    window.location.href = "contacts.html";
});

document.getElementById("addBtn").addEventListener("click", () => {
    window.location.href = "add-contact.html";
});

document.getElementById("locationBtn").addEventListener("click", async () => {
    try {
        const coords = userLocation || await getUserLocation();
        window.open(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`, "_blank");
    } catch (error) {
        alertT("Unable to get your current location. Please try again.");
    }
});

document.getElementById("accountBtn").addEventListener("click", () => {
    window.location.href = "account.html";
});

document.getElementById("helpBtn").addEventListener("click", () => {
    window.location.href = "help.html";
});

document.querySelectorAll(".icon-box").forEach((icon) => {
    icon.addEventListener("click", function() {
        document.querySelectorAll(".icon-box").forEach((item) => item.classList.remove("active"));
        this.classList.add("active");
    });
});

async function init() {
    if (user?.name) {
        const firstName = user.name.split(" ")[0];
        document.getElementById("welcomeMessage").textContent = translateTemplate("nearby_header", { name: firstName });
    }

    document.querySelectorAll(".category-btn").forEach((button) => {
        button.classList.toggle("active", button.dataset.category === activeCategory);
    });

    await loadSavedPlaces();
    try {
        await getUserLocation();
    } catch (error) {
        showStatus(t("Location access is needed for live nearby places. You can still use your saved places."), "info");
    }
    renderActiveCategory();
}

init();

initFakeCallWatcher({ currentPage: "nearby-places.html" });
initSafetyTimerWatcher({
    currentPage: "nearby-places.html",
    onTriggerSOS: async () => {
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});
