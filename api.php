<?php
// api.php
header('Content-Type: application/json');
require_once 'config.php';

$action = $_GET['action'] ?? '';

// Basic error handling
if (!$action) {
    echo json_encode(['error' => 'No action specified']);
    exit;
}

function makeApiCall($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    // In production, verify SSL. For dev, sometimes skipped, but better to keep default (true).
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        return ['error' => 'API request failed', 'details' => $response, 'code' => $httpCode];
    }
    return json_decode($response, true);
}

function fetchPlacesFromGoogle($lat, $lng, $types, $radius, $count = 10) {
    $url = "https://places.googleapis.com/v1/places:searchNearby";
    
    $postData = [
        'includedTypes' => $types,
        'maxResultCount' => $count,
        'locationRestriction' => [
            'circle' => [
                'center' => [
                    'latitude' => (float)$lat,
                    'longitude' => (float)$lng
                ],
                'radius' => (float)$radius
            ]
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Goog-Api-Key: ' . GOOGLE_MAPS_BACKEND_KEY,
        'X-Goog-FieldMask: places.displayName,places.location,places.primaryType,places.id' 
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
         // Log error internally if needed, return empty for resilience
         return [];
    }
    
    $data = json_decode($response, true);
    return $data['places'] ?? [];
}

// 1. Geocode Address
if ($action === 'geocode') {
    $address = urlencode($_GET['address'] ?? '');
    if (!$address) {
        echo json_encode(['error' => 'Address is required']);
        exit;
    }

    $url = "https://maps.googleapis.com/maps/api/geocode/json?address={$address}&key=" . GOOGLE_MAPS_BACKEND_KEY;
    $data = makeApiCall($url);

    if (isset($data['results'][0]['geometry']['location'])) {
        echo json_encode($data['results'][0]['geometry']['location']);
    } else {
        echo json_encode(['error' => 'Location not found', 'raw' => $data]);
    }
    exit;
}

// 2. Get Nearby Attractions (Places API New)
if ($action === 'places') {
    $lat = $_GET['lat'] ?? '';
    $lng = $_GET['lng'] ?? '';
    
    if (!$lat || !$lng) {
        echo json_encode(['error' => 'Lat and Lng are required']);
        exit;
    }

    // Strategy: Two searches.
    // 1. Major Attractions (Wide Radius: 20km)
    // 2. Local Dining/Parks (Short Radius: 5km)
    
    $attractionsTypes = ['ski_resort', 'tourist_attraction', 'amusement_park', 'museum', 'aquarium', 'zoo', 'casino', 'national_park'];
    $localTypes = ['restaurant', 'park', 'store'];

    // Fetch in parallel if possible, but sequential is fine for now.
    $attractions = fetchPlacesFromGoogle($lat, $lng, $attractionsTypes, 20000, 10);
    $local = fetchPlacesFromGoogle($lat, $lng, $localTypes, 5000, 10);

    // Merge and Deduplicate
    $allPlaces = array_merge($attractions, $local);
    $uniquePlaces = [];
    $ids = [];

    foreach ($allPlaces as $p) {
        if (!in_array($p['id'], $ids)) {
            $ids[] = $p['id'];
            $uniquePlaces[] = $p;
        }
    }

    // Return structure matching original expectation
    echo json_encode(['places' => $uniquePlaces]);
    exit;
}

// 4. Proxy for Static Map (CORS support for canvas)
if ($action === 'proxy') {
    $url = $_GET['url'] ?? '';
    // Basic validation to ensure we are only proxying Google Maps
    if (!$url || strpos($url, 'https://maps.googleapis.com/') !== 0) {
        die("Invalid URL");
    }

    // Append Backend Key securely if missing
    if (strpos($url, 'key=') === false) {
        // Handle query string separator
        $separator = (strpos($url, '?') !== false) ? '&' : '?';
        $url .= $separator . "key=" . GOOGLE_MAPS_BACKEND_KEY;
    }

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $data = curl_exec($ch);
    $info = curl_getinfo($ch);
    curl_close($ch);

    header("Content-Type: " . $info['content_type']);
    header("Access-Control-Allow-Origin: *");
    echo $data;
    exit;
}

// 3. Calculate Route (Directions API)
if ($action === 'directions') {
    $origin = $_GET['origin'] ?? ''; // e.g., "lat,lng" or address
    $destination = $_GET['destination'] ?? ''; // e.g., "place_id:..." or "lat,lng"
    $mode = $_GET['mode'] ?? 'driving';

    if (!$origin || !$destination) {
        echo json_encode(['error' => 'Origin and Destination are required']);
        exit;
    }

    // Google Directions API
    $url = "https://maps.googleapis.com/maps/api/directions/json?origin=" . urlencode($origin) . "&destination=" . urlencode($destination) . "&mode=" . urlencode($mode) . "&key=" . GOOGLE_MAPS_BACKEND_KEY;
    
    $data = makeApiCall($url);

    if (isset($data['routes'][0])) {
        $route = $data['routes'][0];
        $leg = $route['legs'][0];
        
        $output = [
            'duration' => $leg['duration']['text'],
            'distance' => $leg['distance']['text'],
            'polyline' => $route['overview_polyline']['points']
        ];
        echo json_encode($output);
    } else {
        error_log("Directions API Error: " . print_r($data, true)); // Log error
        echo json_encode(['error' => 'No route found', 'raw' => $data]);
    }
    exit;
}

echo json_encode(['error' => 'Invalid action']);
?>
