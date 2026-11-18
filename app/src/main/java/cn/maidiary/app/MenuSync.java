package cn.maidiary.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;

/** Reads the public China promotions page and the named foods in recent campaigns. */
final class MenuSync {
    private static final int MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

    static final class Result {
        final JSONArray items;
        final boolean partial;
        Result(JSONArray items, boolean partial) {
            this.items = items;
            this.partial = partial;
        }
    }

    static List<CampaignParser.Article> recent(Map<String, CampaignParser.Article> articles, LocalDate today) {
        List<CampaignParser.Article> result = new ArrayList<>();
        for (CampaignParser.Article article : articles.values()) {
            if (!article.date.isAfter(today) && !article.date.isBefore(today.minusDays(60))) result.add(article);
        }
        result.sort(Comparator.comparing((CampaignParser.Article article) -> article.date).reversed());
        return result.subList(0, Math.min(30, result.size()));
    }

    static Result fetch() throws Exception {
        long deadline = System.nanoTime() + 42_000_000_000L;
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        Map<String, CampaignParser.Article> candidates = new LinkedHashMap<>();
        int indexesRead = 0;
        IOException lastFailure = null;
        for (String path : new String[]{"/news/sales", "/news/news_list"}) {
            try {
                Map<String, CampaignParser.Article> cards = CampaignParser.articles(download(CampaignParser.ORIGIN + path, deadline));
                if (cards.isEmpty()) throw new IOException("官网新品目录暂时无法识别，请稍后重试");
                for (CampaignParser.Article article : cards.values()) {
                    if (path.endsWith("sales") || article.foodHeadline) candidates.putIfAbsent(article.url, article);
                }
                indexesRead++;
            } catch (IOException failure) {
                lastFailure = failure;
            }
        }
        if (indexesRead == 0) throw lastFailure;
        List<CampaignParser.Article> articles = recent(candidates, today);
        LinkedHashMap<String, JSONObject> items = new LinkedHashMap<>();
        int pagesRead = 0;
        for (CampaignParser.Article article : articles) {
            if (System.nanoTime() >= deadline || Thread.currentThread().isInterrupted()) break;
            try {
                Map<String, String> foods = CampaignParser.foods(download(article.url, deadline), article.date, today);
                for (Map.Entry<String, String> food : foods.entrySet()) {
                    String name = food.getKey();
                    if (items.containsKey(name)) continue;
                    JSONObject item = new JSONObject();
                    item.put("id", "limited-" + UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8)));
                    item.put("name", name);
                    item.put("category", food.getValue());
                    item.put("kcal", JSONObject.NULL);
                    item.put("sourceUrl", article.url);
                    item.put("publishedDate", article.date.toString());
                    items.put(name, item);
                }
                pagesRead++;
            } catch (IOException failure) {
                lastFailure = failure;
            }
        }
        if (!articles.isEmpty() && pagesRead == 0 && lastFailure != null) throw lastFailure;
        if (!articles.isEmpty() && pagesRead == 0) throw new IOException("官网活动页连接失败，请联网后重试");
        boolean partial = indexesRead != 2 || pagesRead < articles.size();
        if (items.isEmpty() && partial) {
            throw new IOException("部分活动页未能读取，请稍后重试");
        }
        if (!items.isEmpty() && !Thread.currentThread().isInterrupted()) {
            try {
                Map<String, Integer> calories = NutritionMenu.read(download(NutritionMenu.URL, deadline));
                for (JSONObject food : items.values()) {
                    Integer kcal = calories.get(NutritionMenu.normalized(food.getString("name")));
                    if (kcal != null) food.put("kcal", kcal);
                }
            } catch (IOException | JSONException unavailableNutrition) {
                // A missing or redesigned calculator must not discard the named campaign foods.
            }
        }
        return new Result(new JSONArray(items.values()), partial);
    }

    private static String download(String address, long deadline) throws IOException {
        int timeout = (int) Math.min(6500, (deadline - System.nanoTime()) / 1_000_000);
        if (timeout <= 0) throw new IOException("连接官网超时");
        HttpsURLConnection connection = (HttpsURLConnection) new URL(address).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(timeout);
            connection.setReadTimeout(timeout);
            connection.setRequestProperty("Accept", "text/html");
            connection.setRequestProperty("Accept-Language", "zh-CN");
            connection.setUseCaches(false);
            connection.setRequestProperty("Cache-Control", "no-cache");
            if (connection.getResponseCode() != 200) throw new IOException("官网暂未返回菜单，请稍后重试");
            try (InputStream input = connection.getInputStream();
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    if (System.nanoTime() >= deadline) throw new IOException("连接官网超时");
                    if (output.size() + length > MAX_DOCUMENT_BYTES) throw new IOException("官网数据过大");
                    output.write(buffer, 0, length);
                }
                return output.toString("UTF-8");
            }
        } finally {
            connection.disconnect();
        }
    }

    private MenuSync() {}
}
