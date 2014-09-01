<?php
// Birdman Twitter API Proxy
// implements https://dev.twitter.com/docs/auth/authorizing-request

// Tokens, keys, secrets and URLs
$oauth_access_token = '522908689-s4N7o3KNMIIrRZsBg6gOLSpnmEaZ6zoXhojKvJqx';
$oauth_access_token_secret = 'cYHlEo7k6EmmiFl8w8X7VXeL8MOd4jyK0197ECulY8ZWj';
$app_key = 'DD3CUH03wtuBX4HwCZS0FKxl4';
$app_secret = 'QL30fh2ljo77T1PhTViY46miWA1VqZ79McvUH8lfa6phS7Zxv8';
$api_base_url = 'https://api.twitter.com/1.1/';

$oauth = array(
    'oauth_consumer_key' => $app_key,
    'oauth_nonce' => time(),
    'oauth_signature_method' => 'HMAC-SHA1',
    'oauth_token' => $oauth_access_token,
    'oauth_timestamp' => time(),
    'oauth_version' => '1.0'
);

// Pass query straight through to twitter call.
$url = 'search/tweets.json?' . $_SERVER['QUERY_STRING'];

// Process URL args
$url_parts = parse_url($url);
parse_str($url_parts['query'], $url_arguments);

// Complete URL with https, host, path and query
$full_url = $api_base_url . $url;
$base_url = $api_base_url . $url_parts['path'];

// Base string: Percent encode every key and value that will be signed, sorted by key.
// https://dev.twitter.com/docs/auth/creating-signature
function buildBaseString ($baseURI, $method, $params) {
	$r = array();
	ksort($params);
	foreach ($params as $key => $value) {
		$r[] = "$key=" . rawurlencode($value);
	}
	return $method . "&" . rawurlencode($baseURI) . '&' . rawurlencode(implode('&', $r));
}

// Create oauth signature: build base string, concatenate secrets for hmac and base64 result.
$base_info = buildBaseString($base_url, 'GET', array_merge($oauth, $url_arguments));
$composite_key = rawurlencode($app_secret) . '&' . rawurlencode($oauth_access_token_secret);
$oauth_signature = base64_encode(hash_hmac('sha1', $base_info, $composite_key, true));
$oauth['oauth_signature'] = $oauth_signature;

// Build oauth header from oauth context
function buildAuthorizationHeader ($oauth) {
	$r = 'Authorization: OAuth ';
	$values = array();

	foreach ($oauth as $key => $value)
		$values[] = "$key=\"" . rawurlencode($value) . "\"";

	$r .= implode(', ', $values);
	return $r;
}

$header = array(
    buildAuthorizationHeader($oauth),
    'Expect:'
);

$options = array(
    CURLOPT_HTTPHEADER => $header,
    CURLOPT_HEADER => false,
    CURLOPT_URL => $full_url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_SSL_VERIFYPEER => false
);

// Call Twitter API with curl
$call = curl_init();
curl_setopt_array($call, $options);
$result = curl_exec($call);
$info = curl_getinfo($call);
curl_close($call);


// Pass through content headers to original caller.
if (isset($info['content_type']) && isset($info['size_download'])) {
    header('Content-Type: ' . $info['content_type']);
    header('Content-Length: ' . $info['size_download']);
}

echo $result;

?>
