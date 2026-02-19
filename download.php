<?php
// download.php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    die("Only POST requests are allowed.");
}

// 1. Receive the file from the frontend (Multipart/form-data)
if (!isset($_FILES['image'])) {
    die("No image data received.");
}

$pngData = file_get_contents($_FILES['image']['tmp_name']);
$meta = $_POST['meta'] ?? '{}';
$attractionName = $_POST['attractionName'] ?? 'Map';
$filename = $_POST['filename'] ?? 'map_with_legend.png';

// Sanitize filename for security (basic check)
$filename = basename($filename); // Prevent path traversal
if (empty($filename) || !preg_match('/^[a-zA-Z0-9_\-\.]+$/', $filename)) {
    $filename = 'map_with_legend.png';
}

// 2. Metadata Injection Function (Native PHP, no GD required)
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

$finalImg = injectPngMetadata($pngData, "MapContext", $meta);



// 3. Serve File

header("Content-Type: image/png");

header("Content-Disposition: attachment; filename=\"{$filename}\"");

echo $finalImg;

?>
