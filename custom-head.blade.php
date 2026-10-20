@inject('headContent', 'BookStack\Theming\CustomHtmlHeadContentProvider')
@if(setting('app-custom-head') && !request()->routeIs('settings.category'))
<!-- Start: custom user content -->
{!! $headContent->forWeb() !!}
<!-- End: custom user content -->
@endif

@php
  $theme = config('view.theme') ?? env('APP_THEME');
  $themeBaseUrl = $theme ? url('/theme/' . $theme) : null;

  $previewCssUrl = $themeBaseUrl ? $themeBaseUrl . '/attachment-preview.min.css' : null;
  $previewJsUrl = $themeBaseUrl ? $themeBaseUrl . '/attachment-preview.min.js' : null;
@endphp

<!-- attachment-preview: theme={{ $theme ?? 'none' }}, base={{ $themeBaseUrl ?? 'none' }} -->

@if($previewCssUrl)
<link rel="stylesheet" href="{{ $previewCssUrl }}">
@endif


@if($previewJsUrl)
<script src="{{ $previewJsUrl }}" data-attachment-preview-base="{{ $themeBaseUrl }}/" defer @if($cspNonce ?? false) nonce="{{ $cspNonce }}" @endif></script>
@endif
