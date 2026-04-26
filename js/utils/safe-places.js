// Geoapify API - Fixed Categories (Police Station Working Now)

const GEOAPIFY_API_KEY = "62e65b2c69d24051acec58496ac479e5";

let userLocation = null;

export async function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                resolve(userLocation);
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}

export async function findNearbySafePlaces(lat, lng, radius = 2000) {
    const places = [];
    
    // ✅ CORRECTED CATEGORIES (Geoapify format)
    const categoriesList = [
        { cat: "amenity/police", name: "Police Station", icon: "👮", type: "police", phone: "100" },
        { cat: "amenity/hospital", name: "Hospital", icon: "🏥", type: "hospital", phone: "102" },
        { cat: "amenity/pharmacy", name: "Pharmacy", icon: "💊", type: "pharmacy", phone: null },
        { cat: "amenity/atm", name: "ATM", icon: "🏧", type: "atm", phone: null },
        { cat: "amenity/cafe", name: "Cafe", icon: "☕", type: "safe_haven", phone: null },
        { cat: "shop/mall", name: "Shopping Mall", icon: "🏬", type: "safe_haven", phone: null }
    ];
    
    for (const category of categoriesList) {
        try {
            const url = `https://api.geoapify.com/v2/places?categories=${category.cat}&filter=circle:${lng},${lat},${radius}&limit=10&apiKey=${GEOAPIFY_API_KEY}`;
            
            console.log(`Searching for ${category.name}...`);
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.features && data.features.length > 0) {
                for (const feature of data.features) {
                    const props = feature.properties;
                    const coords = feature.geometry.coordinates;
                    
                    const distance = calculateDistance(lat, lng, coords[1], coords[0]);
                    
                    places.push({
                        ...category,
                        id: props.place_id,
                        name: props.name || `${category.name}`,
                        address: props.address_line2 || props.street || `${distance}m away`,
                        lat: coords[1],
                        lng: coords[0],
                        distance: distance,
                        openNow: props.opening_hours?.open_now || false,
                        phone: category.phone || (props.phone ? props.phone : null)
                    });
                }
                console.log(`✅ Found ${data.features.length} ${category.name}(s)`);
            } else {
                console.log(`ℹ️ No ${category.name} found nearby`);
            }
            
        } catch (error) {
            console.warn(`⚠️ Error fetching ${category.name}:`, error.message);
        }
    }
    
    // Remove duplicates and sort by distance
    const uniquePlaces = [];
    const seen = new Set();
    for (const place of places) {
        const key = `${place.name}_${Math.round(place.distance / 100) * 100}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniquePlaces.push(place);
        }
    }
    
    uniquePlaces.sort((a, b) => a.distance - b.distance);
    
    console.log(`📍 Total safe places found: ${uniquePlaces.length}`);
    
    return uniquePlaces;
}

export function getEmergencyNumbers() {
    return [
        { name: "Police", number: "100", icon: "👮", color: "#1a237e" },
        { name: "Women Helpline", number: "1091", icon: "👩", color: "#c2185b" },
        { name: "Ambulance", number: "102", icon: "🚑", color: "#c62828" },
        { name: "National Helpline", number: "112", icon: "🆘", color: "#8B0000" }
    ];
}