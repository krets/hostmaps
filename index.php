<?php
require_once 'config.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rental Property Map Generator</title>
    <link rel="stylesheet" href="style.css?v=20260219_4">
    <style>
        /* Fail-safe mobile trigger */
        @media (max-width: 1100px) {
            .container { display: block !important; overflow: hidden !important; }
            .sidebar { position: absolute !important; width: 100% !important; height: 100% !important; z-index: 1000 !important; }
            .sidebar.hidden { transform: translateX(-100%) !important; }
            #map { height: 100vh !important; width: 100% !important; }
            .mobile-toggle-btn { display: block !important; }
        }
    </style>
    <!-- Google Material Icons -->
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
</head>
<body>

<div class="container">
    <div class="sidebar">
        <h1>Map Generator</h1>
        
        <div class="input-group">
            <input type="text" id="address-input" list="recent-addresses" placeholder="Enter rental property address">
            <datalist id="recent-addresses"></datalist>
            <button id="locate-btn">Locate</button>
        </div>
        
        <div class="input-group" style="border-top: 1px solid #ddd; padding-top: 20px;">
            <input type="text" id="place-search-input" placeholder="Search for specific place...">
            <button id="search-place-btn">Search</button>
        </div>

        <button id="view-map-btn" class="mobile-toggle-btn" style="display:none; margin-bottom:10px; background-color: #666;">View Map</button>

        <div id="attractions-list">
            <p class="placeholder-text">Enter an address to find nearby attractions.</p>
        </div>

        <div class="actions">
            <button id="download-btn" disabled>Download Map (PNG)</button>
        </div>
    </div>

    <button id="show-list-btn" class="mobile-toggle-btn" style="display:none; position:absolute; bottom:20px; right:20px; z-index:100; background-color: #4285f4; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">Edit List</button>
    <div id="map"></div>
</div>

<script>
    const GOOGLE_MAPS_API_KEY = "<?php echo GOOGLE_MAPS_FRONTEND_KEY; ?>";
</script>
<script src="app.js?v=20260219_7"></script>
<!-- Load Google Maps API -->
<script src="https://maps.googleapis.com/maps/api/js?key=<?php echo GOOGLE_MAPS_FRONTEND_KEY; ?>&libraries=places,marker,geometry&loading=async&v=weekly&callback=initMap" async defer></script>

</body>
</html>
