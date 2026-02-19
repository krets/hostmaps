<?php
require_once 'config.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rental Property Map Generator</title>
    <link rel="stylesheet" href="style.css">
    <!-- Google Material Icons -->
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
</head>
<body>

<div class="container">
    <div class="sidebar">
        <h1>Map Generator</h1>
        
        <div class="input-group">
            <input type="text" id="address-input" placeholder="Enter rental property address">
            <button id="locate-btn">Locate</button>
        </div>

        <div id="attractions-list">
            <p class="placeholder-text">Enter an address to find nearby attractions.</p>
        </div>

        <div class="actions">
            <button id="download-btn" disabled>Download Map (PNG)</button>
        </div>
    </div>

    <div id="map"></div>
</div>

<script>
    const GOOGLE_MAPS_API_KEY = "<?php echo GOOGLE_MAPS_FRONTEND_KEY; ?>";
</script>
<script src="app.js"></script>
<!-- Load Google Maps API -->
<script src="https://maps.googleapis.com/maps/api/js?key=<?php echo GOOGLE_MAPS_FRONTEND_KEY; ?>&libraries=places,marker,geometry&loading=async&v=weekly&callback=initMap" async defer></script>

</body>
</html>
