<?php
// No Composer or .env file needed for this version.

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// --- CONFIGURATION ---
// Place your secret API keys here. They are secure on the server.
$OPENCAGE_API_KEY = 'a75373f1767c4920b1fcba13f2a19d40';
$OPENWEATHER_API_KEY = '0f69e0dea4ecfa48727efb4c88ac7457';

// --- UTILITY FUNCTION FOR FETCHING DATA ---
function fetchData($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    // Add a user agent header, as required by the weather.gov API
    curl_setopt($ch, CURLOPT_USERAGENT, 'WeatherDashboard/1.0 (your-email@example.com)');
    $output = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpcode >= 200 && $httpcode < 300) {
        return json_decode($output, true);
    }
    // Log errors for server-side debugging
    error_log("Failed to fetch data from: " . $url . " - HTTP code: " . $httpcode);
    return null;
}

function fetchText($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_USERAGENT, 'WeatherDashboard/1.0');
    $output = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpcode >= 200 && $httpcode < 300) {
        return $output;
    }
    error_log("Failed to fetch text from: " . $url . " - HTTP code: " . $httpcode);
    return null;
}

// --- ROUTING ---
$apiTarget = isset($_GET['api']) ? $_GET['api'] : '';
$lat = isset($_GET['lat']) ? $_GET['lat'] : '';
$lon = isset($_GET['lon']) ? $_GET['lon'] : '';
$query = isset($_GET['q']) ? $_GET['q'] : '';

// 1. Geocoding API Route
if ($apiTarget === 'geocode' && !empty($query)) {
    $url = "https://api.opencagedata.com/geocode/v1/json?q=" . urlencode($query) . "&key=" . $OPENCAGE_API_KEY . "&limit=1&countrycode=us";
    $data = fetchData($url);
    if ($data) {
        echo json_encode($data);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to geocode location.']);
    }
    exit;
}

// 2. Main Weather Data Route
if ($apiTarget === 'weather' && !empty($lat) && !empty($lon)) {
    // Get NWS gridpoints
    $pointsData = fetchData("https://api.weather.gov/points/{$lat},{$lon}");
    if (!$pointsData || !isset($pointsData['properties'])) {
        http_response_code(500);
        echo json_encode(['error' => 'Could not retrieve weather.gov grid points. The location might be outside the US.']);
        exit;
    }

    $props = $pointsData['properties'];
    $forecastUrl = $props['forecast'] ?? null;
    $hourlyUrl = $props['forecastHourly'] ?? null;
    $gridDataUrl = $props['forecastGridData'] ?? null;
    $stationsUrl = $props['observationStations'] ?? null;

    if (!$forecastUrl || !$hourlyUrl || !$gridDataUrl) {
         http_response_code(500);
         echo json_encode(['error' => 'Core forecast URLs not found for this location.']);
         exit;
    }
    
    $stationList = [];
    $stationIdForMetar = null;
    $aviationStationId = null;

    if ($stationsUrl) {
        $stationsData = fetchData($stationsUrl);
        if ($stationsData && isset($stationsData['features']) && count($stationsData['features']) > 0) {
            $stationList = $stationsData['features'];
            $stationIdForMetar = $stationList[0]['id'];
            foreach ($stationList as $station) {
                $ident = $station['properties']['stationIdentifier'] ?? null;
                if ($ident && strlen($ident) === 4 && strpos($ident, 'K') === 0) {
                    $aviationStationId = $ident;
                    break; 
                }
            }
        }
    }
    
    $windsData = null;
    if ($aviationStationId) {
        $windsData = fetchText("https://www.aviationweather.gov/windtemp/data?station={$aviationStationId}");
    }

    $allData = [
        'weather' => fetchData($forecastUrl),
        'hourly' => fetchData($hourlyUrl),
        'gridData' => fetchData($gridDataUrl),
        'alerts' => fetchData("https://api.weather.gov/alerts/active?point={$lat},{$lon}"),
        'sun' => fetchData("https://api.sunrise-sunset.org/json?lat={$lat}&lng={$lon}&formatted=0"),
        'observation' => $stationIdForMetar ? fetchData("{$stationIdForMetar}/observations/latest") : null,
        'aqi' => fetchData("https://api.openweathermap.org/data/2.5/air_pollution?lat={$lat}&lon={$lon}&appid={$OPENWEATHER_API_KEY}"),
        'winds' => $windsData,
    ];
    
    echo json_encode($allData);
    exit;
}

// Fallback for invalid requests
http_response_code(400);
echo json_encode(["error" => "Invalid request. Provide 'api=geocode&q=...' or 'api=weather&lat=...&lon=...'."]);
?>
