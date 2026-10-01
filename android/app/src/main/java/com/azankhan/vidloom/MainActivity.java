package com.azankhan.vidloom;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String START_URL = "https://avd.up.railway.app/";
    private static final int STORAGE_REQUEST = 1001;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new NativeBridge(this), "VidLoomNative");
        webView.setDownloadListener(new DirectDownloadListener(this));
        webView.loadUrl(START_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private static void requestStoragePermission(Activity activity) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
            activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(
                new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                STORAGE_REQUEST
            );
        }
    }

    private static void enqueueDownload(Context context, String url, String filename) {
        requestStoragePermission((Activity) context);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle(filename);
        request.setDescription("Downloading with VidLoom");
        request.setNotificationVisibility(
            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
        );
        request.setDestinationInExternalPublicDir(
            Environment.DIRECTORY_DOWNLOADS,
            filename
        );

        DownloadManager manager =
            (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        manager.enqueue(request);
    }

    private static class NativeBridge {
        private final Context context;
        NativeBridge(Context context) { this.context = context; }

        @JavascriptInterface
        public void download(String url, String filename) {
            enqueueDownload(context, url, filename);
        }
    }

    private static class DirectDownloadListener implements DownloadListener {
        private final Context context;
        DirectDownloadListener(Context context) { this.context = context; }

        @Override
        public void onDownloadStart(
            String url, String userAgent, String contentDisposition,
            String mimeType, long contentLength
        ) {
            enqueueDownload(context, url, "vidloom-download");
        }
    }
}
