
# Project Specification: Rental Property Map Generator

**Objective:** Build a web tool that allows users to input a rental property address, select nearby attractions, and generate a downloadable map (PNG) with routes and travel times.
**Timeline:** 3 Weeks
**Primary Goal:** Functionality and Cost/Security Best Practices.

## 1. System Architecture

We are using a **Hybrid Architecture** to keep the interface snappy but the credentials secure.

* **Frontend (User):** HTML/JS/CSS. Handles the interactive map and user selection.
* **Backend (Server):** PHP. Handles API authentication, data relay, and final image generation.

---

## 2. Google Maps API Setup (CRITICAL)

**Task:** You must set up the Google Cloud Project to prevent unauthorized usage and unexpected bills.

1. **Create a Google Cloud Project.**
2. **Enable these 5 APIs:**
* Maps JavaScript API
* Geocoding API
* Places API (New)
* Directions API
* Maps Static API


3. **Create Two API Keys:**
* **Key A (Public/Frontend):**
* *Usage:* Use in `index.html` `<script>` tag.
* *Restriction:* **HTTP Referrer**. Set to `https://yourdomain.com/*`.
* *Scope:* Limit strictly to **Maps JavaScript API**.


* **Key B (Secret/Backend):**
* *Usage:* Use in `config.php`. **NEVER** expose this to the browser.
* *Restriction:* **IP Address**. Set to the IP of your web host.
* *Scope:* Geocoding, Places, Directions, Static Maps.





---

## 3. Backend Specification (PHP)

**File:** `api.php`
**Role:** The "Middleman". It accepts requests from our frontend, adds the Secret Key, queries Google, and returns the result.

### Endpoint 1: Geocode Address

* **Trigger:** User clicks "Locate".
* **Input:** `address` (string)
* **Google Service:** Geocoding API.
* **Output:** JSON `{ "lat": 12.34, "lng": 56.78 }`

### Endpoint 2: Get Nearby Attractions (Cost Optimized)

* **Trigger:** Map centers on location.
* **Google Service:** Places API (New) - *Nearby Search*.
* **Constraint:** You **MUST** use "Field Masking" to request *only* Basic Data. If you request "All", it costs 10x more.
* **Required Fields:** `places.displayName`, `places.location`, `places.primaryType`, `places.id`.
* **Logic:** Filter for categories like `restaurant`, `park`, `tourist_attraction`. Return top 10.

### Endpoint 3: Calculate Route

* **Trigger:** User selects an attraction + travel mode.
* **Google Service:** Directions API.
* **Input:** `origin`, `destination`, `mode` (walking/driving/bicycling).
* **Output:**
* `duration` (text: "5 mins")
* `polyline` (The `overview_polyline` string). **Do not** decode this in PHP; send the encoded string to the frontend.



---

## 4. Frontend Specification (JS)

**File:** `app.js`

### User Interface Logic

1. **State Object:** Keep a simple object `currentMapState` to track selected attractions and their calculated routes.
2. **Map Interaction:**
* Use `google.maps.Map` to render the base map.
* When the API returns attractions, place **Markers**.
* When a user *selects* a marker/attraction in the sidebar:
1. Change marker icon color (e.g., Grey -> Red).
2. Call `api.php?action=route`.
3. Draw the returned `polyline` on the map using `google.maps.Polyline`.




3. **Icons:** Use simple Google Material Icons or standard Map pins to distinguish attraction types (e.g., Fork & Knife for food).

---

## 5. Image Generation & Metadata (The "Magic" Step)

**File:** `download.php`
**Role:** Generates the final PNG and embeds the hidden data.

**Logic Flow:**

1. **Receive Data:** Frontend `POST`s the `center`, `zoom`, `markers` (list), and `polylines` (list) to this script.
2. **Construct Static URL:** Build a Google Static Maps URL.
* *Note:* URL length limit is ~16kb. Use the `enc:` prefix for polylines to keep it short.
* Example: `&path=color:0x0000ff|weight:5|enc:YOUR_ENCODED_POLYLINE`


3. **Download Image:** Use `file_get_contents()` to fetch the image from Google.
4. **Inject Metadata:** Append a custom "tEXt" chunk to the PNG binary.

**Code Snippet for Junior (PNG Metadata):**
*Save them the headache of finding a library. This function uses native PHP.*

```php
function injectPngMetadata($pngData, $key, $value) {
    // 1. Prepare the chunk data (Key + Null Separator + Value)
    $data = $key . "\0" . $value;
    
    // 2. Calculate length and CRC
    $length = pack("N", strlen($data));
    $type = "tEXt";
    $crc = pack("N", crc32($type . $data));
    
    // 3. Assemble the chunk
    $chunk = $length . $type . $data . $crc;
    
    // 4. Insert before the IEND chunk (End of file)
    $endPos = strpos($pngData, "IEND");
    if ($endPos !== false) {
        return substr_replace($pngData, $chunk, $endPos - 4, 0);
    }
    return $pngData;
}

// Usage:
// $img = file_get_contents($googleStaticUrl);
// $meta = json_encode($_POST['user_choices']);
// $finalImg = injectPngMetadata($img, "MapContext", $meta);
// header("Content-Type: image/png");
// header("Content-Disposition: attachment; filename=map.png");
// echo $finalImg;

```

---

## 6. Deliverables Schedule

* **Week 1: The Skeleton**
* Setup GCP Project & API Keys.
* Build `api.php` relay for Geocoding and Places.
* Basic HTML page that locates an address and logs "Attractions" to the console.


* **Week 2: The Interactive Map**
* Draw markers on the map.
* Implement Directions API relay.
* Draw route lines (Polylines) on the map when an item is selected.


* **Week 3: The Polish & Export**
* Build `download.php` to fetch the Static Map.
* Implement the PNG metadata injection.
* CSS styling to make the printout look professional (add a white border or "Polaroid" style using CSS on the frontend, though the downloaded image will just be the map).



## 7. Developer Notes

* **Cost Warning:** Always check the Google Cloud "Quotas" page. If we see thousands of errors, stop and debug. Do not loop API calls.
* **Polyline Encoding:** Google Directions API returns an "encoded polyline". Pass this string directly to the Static Maps API. Do not try to decode it into an array of lat/lngs unless necessary, as that will break the URL length limit.
