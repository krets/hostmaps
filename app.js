// app.js

let map;
let markers = []; // Array of AdvancedMarkerElement for places
let propertyMarker = null; // Separate ref for property marker
let placePolylines = {}; // Map placeId -> Polyline object
let mapState = {
    center: { lat: 0, lng: 0 },
    zoom: 12,
    propertyLocation: null, // Fixed location of the rental property
    places: [], // Array of all fetched place objects
    selectedPlaces: {}, // Map placeId -> Place Object (Robust storage)
    placeRoutes: {} // Map placeId -> { polyline, duration }
};

// Use async initMap to import libraries
async function initMap() {
    // Request needed libraries.
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
    const { encoding } = await google.maps.importLibrary("geometry"); // Explicitly import geometry

    map = new Map(document.getElementById("map"), {
        center: { lat: -34.397, lng: 150.644 },
        zoom: 8,
        mapId: "DEMO_MAP_ID", // Required for AdvancedMarkerElement
    });

    // Keep mapState in sync with actual map view
    map.addListener('idle', () => {
        const center = map.getCenter();
        mapState.center = { lat: center.lat(), lng: center.lng() };
        mapState.zoom = map.getZoom();
    });

    document.getElementById("locate-btn").addEventListener("click", () => {
        const address = document.getElementById("address-input").value;
        if (address) {
            geocodeAddress(address);
        }
    });

    // Manual Search Listener
    document.getElementById("search-place-btn").addEventListener("click", () => {
        const query = document.getElementById("place-search-input").value;
        if (query) {
            searchForPlace(query);
        }
    });

    document.getElementById("download-btn").addEventListener("click", generateAndDownloadMap);
}

async function geocodeAddress(address) {
    try {
        const response = await fetch(`api.php?action=geocode&address=${encodeURIComponent(address)}`);
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        const location = { lat: data.lat, lng: data.lng };
        map.setCenter(location);
        map.setZoom(13); // Slightly wider zoom to see radius
        mapState.center = location;
        mapState.propertyLocation = location; // Store fixed property location
        mapState.zoom = 13;

        clearMap();

        const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
        const pin = new PinElement({
            background: "#4285F4",
            borderColor: "#1a73e8",
            glyphColor: "white",
        });

        propertyMarker = new AdvancedMarkerElement({
            map: map,
            position: location,
            title: "Rental Property",
            content: pin.element,
        });

        fetchNearbyPlaces(location.lat, location.lng);

    } catch (error) {
        console.error("Geocoding failed:", error);
        alert("Failed to locate address.");
    }
}

async function fetchNearbyPlaces(lat, lng) {
    try {
        const response = await fetch(`api.php?action=places&lat=${lat}&lng=${lng}`);
        const data = await response.json();

        if (data.error) {
            console.error("Places API error:", data);
            return;
        }

        const places = data.places || [];
        renderPlacesList(places);
        await renderPlaceMarkers(places);

    } catch (error) {
        console.error("Failed to fetch places:", error);
    }
}

async function searchForPlace(query) {
    // Ensure we have a location to search near
    const loc = mapState.propertyLocation || mapState.center;
    
    try {
        const response = await fetch(`api.php?action=text_search&lat=${loc.lat}&lng=${loc.lng}&query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.error) {
             alert("Search failed: " + data.error);
             return;
        }
        
        const newPlaces = data.places || [];
        if (newPlaces.length === 0) {
            alert("No places found matching '" + query + "' nearby.");
            return;
        }

        // Merge new places with existing
        // Filter out duplicates based on ID
        const currentIds = mapState.places.map(p => p.id);
        const uniqueNew = newPlaces.filter(p => !currentIds.includes(p.id));
        
        if (uniqueNew.length === 0) {
            alert("Place already in list.");
            return;
        }

        mapState.places = [...mapState.places, ...uniqueNew];
        
        // Update UI
        renderPlacesList(mapState.places);
        await renderPlaceMarkers(uniqueNew); // Only add markers for new ones

    } catch (e) {
        console.error("Manual search error:", e);
    }
}

function clearMap() {
    markers.forEach(m => m.map = null);
    markers = [];
    if (propertyMarker) {
        propertyMarker.map = null;
        propertyMarker = null;
    }
    Object.values(placePolylines).forEach(p => p.setMap(null));
    placePolylines = {};
    mapState.selectedPlaces = {}; // Clear map
    mapState.placeRoutes = {};
    mapState.places = [];
}

function renderPlacesList(places) {
    const list = document.getElementById("attractions-list");
    list.innerHTML = "";
    mapState.places = places;

    if (places.length === 0) {
        list.innerHTML = "<p>No attractions found nearby.</p>";
        return;
    }

    places.forEach(place => {
        const item = document.createElement("div");
        item.className = "attraction-item";
        item.dataset.id = place.id;
        
        let iconName = "place";
        if (place.primaryType === "restaurant") iconName = "restaurant";
        if (place.primaryType === "park") iconName = "park";
        if (place.primaryType === "tourist_attraction") iconName = "local_see";
        if (place.primaryType === "ski_resort") iconName = "ac_unit";

        // Check if selected (using map key)
        if (mapState.selectedPlaces[place.id]) {
            item.classList.add("selected");
        }

        item.innerHTML = `
            <i class="material-icons attraction-icon">${iconName}</i>
            <div class="attraction-info">
                <span class="attraction-name">${place.displayName.text}</span>
                <span class="attraction-type">${place.primaryType}</span>
                <span class="route-info" id="route-${place.id}"></span>
            </div>
        `;

        // Restore route info if already fetched
        if (mapState.placeRoutes[place.id]) {
             setTimeout(() => {
                 const el = document.getElementById(`route-${place.id}`);
                 if(el) el.textContent = `${mapState.placeRoutes[place.id].duration} drive`;
             }, 0);
        }

        item.addEventListener("click", () => togglePlaceSelection(place));
        list.appendChild(item);
    });
}

async function renderPlaceMarkers(places) {
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
    for (const place of places) {
        const pin = new PinElement({
            background: "#FBBC04",
            borderColor: "#1a73e8",
            glyphColor: "white",
            scale: 0.8
        });
        const marker = new AdvancedMarkerElement({
            map: map,
            position: { lat: place.location.latitude, lng: place.location.longitude },
            title: place.displayName.text,
            content: pin.element,
        });
        marker.placeId = place.id; 
        marker.addListener("click", () => togglePlaceSelection(place));
        markers.push(marker);
    }
}

async function togglePlaceSelection(place) {
    // Check if ID is in the keys
    const isSelected = !!mapState.selectedPlaces[place.id];

    if (isSelected) {
        // Deselect: Remove from map
        delete mapState.selectedPlaces[place.id];
        removeRoute(place.id);
        updateMarkerStyle(place.id, false);
    } else {
        // Select: Add to map
        mapState.selectedPlaces[place.id] = place; // Store full object
        await addRoute(place);
        updateMarkerStyle(place.id, true);
    }

    updateUI(place.id, !isSelected);
    // Check if keys array has length
    document.getElementById("download-btn").disabled = Object.keys(mapState.selectedPlaces).length === 0;
}

async function updateMarkerStyle(placeId, isSelected) {
    const marker = markers.find(m => m.placeId === placeId);
    if (!marker) return;
    const { PinElement } = await google.maps.importLibrary("marker");
    const pin = new PinElement({
        background: isSelected ? "#EA4335" : "#FBBC04",
        borderColor: "#1a73e8",
        glyphColor: "white",
        scale: isSelected ? 1.0 : 0.8
    });
    marker.content = pin.element;
}

function updateUI(placeId, isSelected) {
    const item = document.querySelector(`.attraction-item[data-id="${placeId}"]`);
    if (item) {
        if (isSelected) item.classList.add("selected");
        else item.classList.remove("selected");
    }
}

async function addRoute(place) {
    const startLoc = mapState.propertyLocation || mapState.center;
    const origin = `${startLoc.lat},${startLoc.lng}`;
    const destination = `${place.location.latitude},${place.location.longitude}`;
    try {
        const response = await fetch(`api.php?action=directions&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving`);
        const data = await response.json();
        
        if (data.error) {
            console.error("Directions API Error:", data);
            return;
        }

        const routeEl = document.getElementById(`route-${place.id}`);
        if (routeEl) routeEl.textContent = `${data.duration} drive`;

        const decodedPath = google.maps.geometry.encoding.decodePath(data.polyline);
        const polyline = new google.maps.Polyline({
            path: decodedPath,
            geodesic: true,
            strokeColor: "#FF0000",
            strokeOpacity: 0.7,
            strokeWeight: 4
        });
        polyline.setMap(map);
        placePolylines[place.id] = polyline;
        mapState.placeRoutes[place.id] = { polyline: data.polyline, duration: data.duration };
    } catch (e) {
        console.error("Failed to fetch directions:", e);
    }
}

function removeRoute(placeId) {
    if (placePolylines[placeId]) {
        placePolylines[placeId].setMap(null);
        delete placePolylines[placeId];
    }
    delete mapState.placeRoutes[placeId];
    const routeEl = document.getElementById(`route-${placeId}`);
    if (routeEl) routeEl.textContent = "";
}

function loadIcon(url) {
    const proxyUrl = `api.php?action=proxy&url=${encodeURIComponent(url)}`;
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.warn(`Failed to load icon: ${url}`);
            resolve(null);
        };
        img.src = proxyUrl;
    });
}

async function generateAndDownloadMap() {
    const btn = document.getElementById("download-btn");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
        const width = 640;
        const height = 480;
        let staticUrl = `https://maps.googleapis.com/maps/api/staticmap?size=${width}x${height}&maptype=roadmap`;
        
        // Get Selected Places from our robust map
        const selectedPlacesList = Object.values(mapState.selectedPlaces);

        if (selectedPlacesList.length === 0) {
             staticUrl += `&center=${mapState.center.lat},${mapState.center.lng}&zoom=${mapState.zoom}`;
        }
        
        const pLoc = mapState.propertyLocation || mapState.center;
        staticUrl += `&markers=icon:${encodeURIComponent("https://maps.google.com/mapfiles/kml/pal4/icon47.png")}%7C${pLoc.lat},${pLoc.lng}`;
        
        const legendData = [];
        const iconPromises = [];

        selectedPlacesList.forEach((place, index) => {
            const id = place.id;
            const route = mapState.placeRoutes[id];
            
            const label = String.fromCharCode(65 + (index % 26));
            
            // MAP: Standard Red Markers with Labels
            staticUrl += `&markers=color:red%7Clabel:${label}%7C${place.location.latitude},${place.location.longitude}`;
            
            // LEGEND: Paddle Icons
            const paddleIconUrl = `https://maps.google.com/mapfiles/kml/paddle/${label}.png`;
            
            legendData.push({ label, name: place.displayName.text, duration: route ? route.duration : '', iconUrl: paddleIconUrl });
            iconPromises.push(loadIcon(paddleIconUrl));
        });

        // Polylines
        Object.values(mapState.placeRoutes).forEach(r => {
             const stylePrefix = "color:0xff0000ff|weight:5|enc:";
             staticUrl += `&path=${encodeURIComponent(stylePrefix)}${encodeURIComponent(r.polyline)}`;
        });

        const proxyUrl = `api.php?action=proxy&url=${encodeURIComponent(staticUrl)}`;
        const imgMap = new Image();
        imgMap.crossOrigin = "anonymous";
        
        const mapPromise = new Promise((resolve, reject) => {
            imgMap.onload = () => resolve(imgMap);
            imgMap.onerror = () => reject(new Error("Map image failed to load via proxy"));
            imgMap.src = proxyUrl;
        });

        const [loadedMap, ...loadedIcons] = await Promise.all([mapPromise, ...iconPromises]);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        const itemHeight = 40;
        const legendHeight = 60 + (legendData.length * itemHeight);
        canvas.width = width;
        canvas.height = height + legendHeight;

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(loadedMap, 0, 0);

        ctx.fillStyle = "black";
        ctx.font = "bold 20px Arial";
        ctx.fillText("Nearby Attractions & Travel Times", 40, height + 40);
        
        ctx.font = "16px Arial";
        legendData.forEach((item, i) => {
            const y = height + 70 + (i * itemHeight);
            const iconImg = loadedIcons[i];
            
            if (iconImg) {
                ctx.drawImage(iconImg, 40, y - 24, 32, 32); 
            } else {
                ctx.fillStyle = "red";
                ctx.fillText(`[ ${item.label} ]`, 40, y);
            }

            ctx.fillStyle = "black";
            const durationText = item.duration ? `(${item.duration} drive)` : "";
            ctx.fillText(`${item.name} ${durationText}`, 90, y);
        });

        const dataUrl = canvas.toDataURL("image/png");
        const blob = await (await fetch(dataUrl)).blob();
        
        const formData = new FormData();
        formData.append("image", blob, "map.png");
        formData.append("attractionName", "Multi-Attraction Map");
        formData.append("meta", JSON.stringify({
            attractions: legendData,
            center: mapState.center
        }));

        const response = await fetch("download.php", {
            method: "POST",
            body: formData
        });

        if (response.ok) {
            const downloadBlob = await response.blob();
            const url = window.URL.createObjectURL(downloadBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "map_with_legend.png";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } else {
            alert("Download failed.");
        }

    } catch (error) {
        console.error("Generation failed:", error);
        alert("Failed to generate map.");
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}