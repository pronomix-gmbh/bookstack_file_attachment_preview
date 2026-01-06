@inject('headContent', 'BookStack\Theming\CustomHtmlHeadContentProvider')
@if(setting('app-custom-head') && !request()->routeIs('settings.category'))
<!-- Start: custom user content -->
{!! $headContent->forWeb() !!}
<!-- End: custom user content -->
@endif

@php
  $theme = config('app.theme') ?? env('APP_THEME');
  $themeBaseUrl = $theme ? url('/theme/' . $theme) : null;
  $jszipCdn = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  $docxCdn = 'https://cdn.jsdelivr.net/npm/docx-preview@0.1.15/dist/docx-preview.min.js';
  $xlsxCdn = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  $previewCssUrl = $themeBaseUrl ? $themeBaseUrl . '/attachment-preview.min.css' : null;
  $previewJsUrl = $themeBaseUrl ? $themeBaseUrl . '/attachment-preview.min.js' : null;
@endphp

<!-- attachment-preview: theme={{ $theme ?? 'none' }}, base={{ $themeBaseUrl ?? 'none' }}, cdn=jsdelivr -->

@if($previewCssUrl)
<link rel="stylesheet" href="{{ $previewCssUrl }}">
@endif


<script src="{{ $jszipCdn }}" defer @if($cspNonce ?? false) nonce="{{ $cspNonce }}" @endif></script>
<script src="{{ $docxCdn }}" defer @if($cspNonce ?? false) nonce="{{ $cspNonce }}" @endif></script>
<script src="{{ $xlsxCdn }}" defer @if($cspNonce ?? false) nonce="{{ $cspNonce }}" @endif></script>

@if($previewJsUrl)
<script src="{{ $previewJsUrl }}" defer @if($cspNonce ?? false) nonce="{{ $cspNonce }}" @endif></script>
@endif
