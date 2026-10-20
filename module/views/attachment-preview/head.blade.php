@php
  $theme = config('view.theme') ?? env('APP_THEME');
  $themeBaseUrl = $theme ? url('/theme/' . $theme) : null;
@endphp

@if($themeBaseUrl)
<link rel="stylesheet" href="{{ $themeBaseUrl }}/attachment-preview.min.css">
<script src="{{ $themeBaseUrl }}/attachment-preview.min.js" data-attachment-preview-base="{{ $themeBaseUrl }}/" defer @if($cspNonce ?? false) nonce="{{ $cspNonce }}" @endif></script>
@endif
