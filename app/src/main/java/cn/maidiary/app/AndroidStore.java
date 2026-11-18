package cn.maidiary.app;

import android.app.Activity;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class AndroidStore {
    private static final Object DISK = new Object();
    private final Activity activity;
    private final WebView web;
    private final AtomicFile ledger;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final AtomicBoolean syncing = new AtomicBoolean();
    private volatile boolean closed;

    AndroidStore(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        ledger = new AtomicFile(new File(activity.getFilesDir(), "ledger.json"));
    }

    @JavascriptInterface
    public String read() {
        synchronized (DISK) {
            try {
                return new String(ledger.readFully(), StandardCharsets.UTF_8);
            } catch (FileNotFoundException absent) {
                if (!ledger.getBaseFile().exists()) return "";
                throw new IllegalStateException("无法读取本地账本", absent);
            } catch (IOException unavailable) {
                throw new IllegalStateException("无法读取本地账本", unavailable);
            }
        }
    }

    @JavascriptInterface
    public boolean write(String json) {
        synchronized (DISK) {
            if (json == null || closed) return false;
            FileOutputStream out = null;
            try {
                new JSONObject(json);
                out = ledger.startWrite();
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
                ledger.finishWrite(out);
                return true;
            } catch (IOException | JSONException failure) {
                if (out != null) ledger.failWrite(out);
                return false;
            }
        }
    }

    @JavascriptInterface
    public synchronized void syncMenu() {
        if (closed || !syncing.compareAndSet(false, true)) return;
        network.execute(() -> {
            JSONObject result = new JSONObject();
            try {
                MenuSync.Result menu = MenuSync.fetch();
                JSONArray items = menu.items;
                result.put("ok", true);
                result.put("items", items);
                result.put("partial", menu.partial);
                result.put("message", items.length() == 0 ? "官网当前没有可同步的限时商品" : "官网商品已获取");
            } catch (Exception failure) {
                try {
                    result.put("ok", false);
                    result.put("items", new JSONArray());
                    result.put("message", syncError(failure));
                } catch (JSONException impossible) {
                    throw new IllegalStateException(impossible);
                }
            }
            String argument = JSONObject.quote(result.toString())
                    .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
            activity.runOnUiThread(() -> {
                if (closed) return;
                web.evaluateJavascript("if (typeof window.onMenuSyncResult === 'function') "
                                + "window.onMenuSyncResult(" + argument + ")",
                        unused -> syncing.set(false));
            });
        });
    }

    private static String syncError(Exception error) {
        if (error instanceof SocketTimeoutException) return "连接官网超时，请稍后重试";
        if (error instanceof UnknownHostException) return "无法连接官网，请检查网络后重试";
        String message = error.getMessage();
        if (message != null && (message.startsWith("官网") || message.startsWith("部分活动页")
                || message.startsWith("连接官网"))) return message;
        return "同步失败，请检查网络后重试";
    }

    synchronized void close() {
        closed = true;
        network.shutdownNow();
    }
}
