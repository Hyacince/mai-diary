package cn.maidiary.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Gravity;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URLConnection;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ENTRY = "https://" + ASSET_HOST + "/index.html";
    private static final int PAPER = Color.rgb(249, 247, 242);
    private static final int BRAND_RED = Color.rgb(218, 41, 28);
    private WebView web;
    private AndroidStore store;

    @Override
    public void onCreate(Bundle savedState) {
        setTheme(R.style.AppTheme);
        super.onCreate(savedState);
        FrameLayout frame = new FrameLayout(this);
        LayerDrawable background = new LayerDrawable(new Drawable[] {
                new ColorDrawable(PAPER), new ColorDrawable(BRAND_RED)});
        background.setLayerGravity(1, Gravity.TOP);
        background.setLayerHeight(1, 0);
        frame.setBackground(background);
        web = new WebView(this);
        web.setBackgroundColor(PAPER);
        frame.addView(web);
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 35) {
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safeArea = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom);
                background.setLayerHeight(1, safeArea.top);
                return WindowInsets.CONSUMED;
            });
            frame.requestApplyInsets();
        }
        if (Build.VERSION.SDK_INT < 35) getWindow().setStatusBarColor(BRAND_RED);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setStatusBarContrastEnforced(false);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        WebSettings settings = web.getSettings();
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setJavaScriptEnabled(true);
        web.setWebViewClient(new LocalClient());
        store = new AndroidStore(this, web);
        web.addJavascriptInterface(store, "AndroidStore");
        web.loadUrl(ENTRY);
    }

    private final class LocalClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme())
                    && "www.mcdonalds.com.cn".equals(uri.getHost()) && uri.getPort() == -1
                    && uri.getUserInfo() == null) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                } catch (ActivityNotFoundException unavailable) {
                    Toast.makeText(MainActivity.this, "未找到可打开官网的浏览器", Toast.LENGTH_SHORT).show();
                }
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String path = uri.getPath();
            if (!"https".equals(uri.getScheme()) || !ASSET_HOST.equals(uri.getHost())
                    || uri.getUserInfo() != null || uri.getPort() != -1 || path == null
                    || !path.matches("/[a-zA-Z0-9_./-]+") || path.contains("..")
                    || !"GET".equals(request.getMethod())) {
                return missing();
            }
            String mime = URLConnection.guessContentTypeFromName(path);
            if (path.endsWith(".js") || path.endsWith(".mjs")) mime = "application/javascript";
            if (path.endsWith(".css")) mime = "text/css";
            if (path.endsWith(".svg")) mime = "image/svg+xml";
            if (path.endsWith(".webp")) mime = "image/webp";
            if (path.endsWith(".woff2")) mime = "font/woff2";
            try {
                String csp = "default-src 'self'; script-src 'self'; "
                        + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                        + "connect-src 'self'; frame-src 'none'; object-src 'none'; "
                        + "base-uri 'none'; form-action 'none'";
                return new WebResourceResponse(mime == null ? "application/octet-stream" : mime,
                        null, 200, "OK", Collections.singletonMap("Content-Security-Policy", csp),
                        getAssets().open("www" + path));
            } catch (IOException unavailable) {
                return missing();
            }
        }

        private WebResourceResponse missing() {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("typeof window.handleBack === 'function' && window.handleBack() === true",
                handled -> {
                    if (!"true".equals(handled) && !isFinishing()) super.onBackPressed();
                });
    }

    @Override
    public void onDestroy() {
        store.close();
        web.removeJavascriptInterface("AndroidStore");
        ((FrameLayout) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
