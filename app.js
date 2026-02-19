// app.js

let map;
let markers = []; // Array of AdvancedMarkerElement for places
let propertyMarker = null; // Separate ref for property marker
let placePolylines = {}; // Map placeId -> Polyline object
let mapState = {
    center: { lat: 0, lng: 0 },
    zoom: 12,
    places: [], // Array of all fetched place objects
    selectedPlaceIds: [], // Array of strings
    placeRoutes: {} // Map placeId -> { polyline, duration }
};

// Use async initMap to import libraries
async function initMap() {
    // Request needed libraries.
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

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

function clearMap() {
    markers.forEach(m => m.map = null);
    markers = [];
    if (propertyMarker) {
        propertyMarker.map = null;
        propertyMarker = null;
    }
    Object.values(placePolylines).forEach(p => p.setMap(null));
    placePolylines = {};
    mapState.selectedPlaceIds = [];
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

        item.innerHTML = `
            <i class="material-icons attraction-icon">${iconName}</i>
            <div class="attraction-info">
                <span class="attraction-name">${place.displayName.text}</span>
                <span class="attraction-type">${place.primaryType}</span>
                <span class="route-info" id="route-${place.id}"></span>
            </div>
        `;

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
    const index = mapState.selectedPlaceIds.indexOf(place.id);
    const isSelected = index !== -1;

    if (isSelected) {
        mapState.selectedPlaceIds.splice(index, 1);
        removeRoute(place.id);
        updateMarkerStyle(place.id, false);
    } else {
        mapState.selectedPlaceIds.push(place.id);
        await addRoute(place);
        updateMarkerStyle(place.id, true);
    }

    updateUI(place.id, !isSelected);
    document.getElementById("download-btn").disabled = mapState.selectedPlaceIds.length === 0;
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
    // Ensure we use the property location (or map center if property not set, but geocode should set it)
    const origin = `${mapState.center.lat},${mapState.center.lng}`;
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

async function generateAndDownloadMap() {
    const btn = document.getElementById("download-btn");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
        // 1. Construct Static Map URL
        const width = 800;
        const height = 600;
        
        // Remove 'key' from here. The proxy will inject it.
        let staticUrl = `https://maps.googleapis.com/maps/api/staticmap?size=${width}x${height}&maptype=roadmap`;
        
        // If no markers/routes, fallback to center/zoom. 
        // But if we have markers, Static Maps API auto-fits.
        if (mapState.selectedPlaceIds.length === 0) {
             staticUrl += `&center=${mapState.center.lat},${mapState.center.lng}&zoom=${mapState.zoom}`;
        }
        
        // Markers
        staticUrl += `&markers=color:blue%7Clabel:P%7C${mapState.center.lat},${mapState.center.lng}`;
        
        const legendData = [];
        mapState.selectedPlaceIds.forEach((id, index) => {
            const place = mapState.places.find(p => p.id === id);
            const route = mapState.placeRoutes[id];
            if (place) {
                const label = String.fromCharCode(65 + (index % 26));
                staticUrl += `&markers=color:red%7Clabel:${label}%7C${place.location.latitude},${place.location.longitude}`;
                legendData.push({ label, name: place.displayName.text, duration: route ? route.duration : '' });
            }
        });

        // Polylines
        Object.values(mapState.placeRoutes).forEach(r => {
             // Style: color:red|weight:5|enc:DATA
             // We must URL encode the polyline data properly
             const stylePrefix = "color:0xff0000ff|weight:5|enc:";
             // Note: encodeURIComponent encodes | to %7C which is what we want for the URL param value
             staticUrl += `&path=${encodeURIComponent(stylePrefix)}${encodeURIComponent(r.polyline)}`;
        });

        // 2. Fetch via Proxy
        const proxyUrl = `api.php?action=proxy&url=${encodeURIComponent(staticUrl)}`;
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error("Image failed to load via proxy"));
            img.src = proxyUrl;
        });

        // 3. Draw to Canvas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        const legendHeight = 60 + (legendData.length * 30);
        canvas.width = width;
        canvas.height = height + legendHeight;

        // Background
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Map
        ctx.drawImage(img, 0, 0);

        // Legend
        ctx.fillStyle = "black";
        ctx.font = "bold 20px Arial";
        ctx.fillText("Nearby Attractions & Travel Times", 40, height + 40);
        
        ctx.font = "16px Arial";
        legendData.forEach((item, i) => {
            const y = height + 80 + (i * 30);
            ctx.fillStyle = "red";
            ctx.fillText(`[ ${item.label} ]`, 40, y);
            ctx.fillStyle = "black";
            const durationText = item.duration ? `(${item.duration} drive)` : "";
            ctx.fillText(`${item.name} ${durationText}`, 100, y);
        });

        // 4. Send to download.php for metadata and final delivery
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
