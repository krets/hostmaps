<?php
// api.php
header('Content-Type: application/json');
require_once 'config.php';

$action = $_GET['action'] ?? '';

if (!$action) {
    echo json_encode(['error' => 'No action specified']);
    exit;
}

function makeApiCall($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
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
                'center' => ['latitude' => (float)$lat, 'longitude' => (float)$lng],
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
    curl_close($ch);
    $data = json_decode($response, true);
    return $data['places'] ?? [];
}

function textSearchAttractions($lat, $lng, $query, $radius = 5000.0) {
    $url = "https://places.googleapis.com/v1/places:searchText";
    $postData = [
        'textQuery' => $query,
        'locationRestriction' => [ // Strict restriction within circle
            'circle' => [
                'center' => ['latitude' => (float)$lat, 'longitude' => (float)$lng],
                'radius' => (float)$radius
            ]
        ],
        'maxResultCount' => 10
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
    curl_close($ch);
    $data = json_decode($response, true);
    return $data['places'] ?? [];
}

if ($action === 'text_search') {
    $lat = $_GET['lat'] ?? '';
    $lng = $_GET['lng'] ?? '';
    $query = $_GET['query'] ?? '';
    
    if (!$lat || !$lng || !$query) {
        echo json_encode(['error' => 'Lat, Lng, and Query required']);
        exit;
    }
    
    // Manual search up to 50km
    $results = textSearchAttractions($lat, $lng, $query, 50000.0); 
    echo json_encode(['places' => $results]);
    exit;
}

if ($action === 'geocode') {
    $address = urlencode($_GET['address'] ?? '');
    $url = "https://maps.googleapis.com/maps/api/geocode/json?address={$address}&key=" . GOOGLE_MAPS_BACKEND_KEY;
    $data = makeApiCall($url);
    if (isset($data['results'][0]['geometry']['location'])) {
        echo json_encode($data['results'][0]['geometry']['location']);
    } else {
        echo json_encode(['error' => 'Location not found']);
    }
    exit;
}

if ($action === 'places') {
    $lat = $_GET['lat'] ?? '';
    $lng = $_GET['lng'] ?? '';
    if (!$lat || !$lng) {
        echo json_encode(['error' => 'Lat/Lng required']);
        exit;
    }

    $attractionsTypes = ['ski_resort', 'tourist_attraction', 'amusement_park', 'museum', 'aquarium', 'zoo', 'casino', 'national_park', 'concert_hall', 'performing_arts_theater', 'stadium', 'cultural_center', 'event_venue', 'amphitheatre'];
    
    // 1. Specific search for concert venues/pavilions using Text Search (Most reliable for BankNH)
    $textResults = textSearchAttractions($lat, $lng, "concert venues and amphitheaters");
    
    // 2. Nearby Attractions (5km and 30km)
    $closeAttractions = fetchPlacesFromGoogle($lat, $lng, $attractionsTypes, 5000, 20);
    $distantAttractions = fetchPlacesFromGoogle($lat, $lng, $attractionsTypes, 30000, 10);
    
    // 3. Local Dining (Remove stores to reduce noise)
    $local = fetchPlacesFromGoogle($lat, $lng, ['restaurant', 'park'], 5000, 15);

    $allPlaces = array_merge($textResults, $closeAttractions, $distantAttractions, $local);
    $uniquePlaces = [];
    $ids = [];
    foreach ($allPlaces as $p) {
        if (!in_array($p['id'], $ids)) {
            $ids[] = $p['id'];
            $uniquePlaces[] = $p;
        }
    }
    echo json_encode(['places' => $uniquePlaces]);
    exit;
}

if ($action === 'proxy') {
    $url = $_GET['url'] ?? '';
    $allowed_hosts = ['https://maps.googleapis.com/', 'http://maps.google.com/', 'https://maps.google.com/'];
    $valid = false;
    foreach ($allowed_hosts as $host) {
        if (strpos($url, $host) === 0) { $valid = true; break; }
    }
    if (!$valid) die("Invalid URL");
    if (strpos($url, 'https://maps.googleapis.com/') === 0 && strpos($url, 'key=') === false) {
        $url .= (strpos($url, '?') !== false ? '&' : '?') . "key=" . GOOGLE_MAPS_BACKEND_KEY;
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

if ($action === 'directions') {
    $origin = urlencode($_GET['origin'] ?? '');
    $destination = urlencode($_GET['destination'] ?? '');
    $url = "https://maps.googleapis.com/maps/api/directions/json?origin={$origin}&destination={$destination}&mode=driving&key=" . GOOGLE_MAPS_BACKEND_KEY;
    $data = makeApiCall($url);
    if (isset($data['routes'][0])) {
        $route = $data['routes'][0];
        $leg = $route['legs'][0];
        echo json_encode(['duration' => $leg['duration']['text'], 'distance' => $leg['distance']['text'], 'polyline' => $route['overview_polyline']['points']]);
    } else {
        echo json_encode(['error' => 'No route found']);
    }
    exit;
}
?>
