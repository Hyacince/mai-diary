package cn.maidiary.app;

import java.io.IOException;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class CampaignParser {
    static final String ORIGIN = "https://www.mcdonalds.com.cn";
    private static final Pattern ARTICLE = Pattern.compile(
            "<a\\b[^>]*?\\bhref\\s*=\\s*[\"'](?:https://www\\.mcdonalds\\.com\\.cn)?(/news/[a-zA-Z0-9_-]+)/?[\"']",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CARD = Pattern.compile(
            "<h4\\b[^>]*>(.+?)</h4>.*?<time\\b[^>]*>\\s*(\\d{4})[.\\-/](\\d{1,2})[.\\-/](\\d{1,2})\\s*</time>",
            Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern FOOD_NEWS = Pattern.compile(
            "新品|上新|新口味|限定|美味|限时|汉堡|鸡腿堡|麦旋风|甜品|新地|雪冰|麦满分");
    private static final Pattern CONTENT = Pattern.compile(
            "<div\\b[^>]{0,300}\\bclass\\s*=\\s*[\"'][^\"']*\\bcmsMainBox\\b[^\"']*[\"'][^>]*>",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SECTION = Pattern.compile("【([^【】]{1,100})】");
    private static final Pattern SEASONAL = Pattern.compile("季节(?:性|限定)?|限定品|限时|上新|推出新品");
    private static final String TEXT_DATE = "(?:(20\\d{2})年)?(\\d{1,2})月(\\d{1,2})日";
    private static final Pattern PERIOD = Pattern.compile(TEXT_DATE
            + "(?:\\d{1,2}[:：]\\d{2}(?:[:：]\\d{2})?)?起?(?:至|到|[-~—])" + TEXT_DATE);
    private static final Pattern FOOD_NAME = Pattern.compile("[a-zA-Z0-9\\u4e00-\\u9fff·“”]{2,25}");
    private static final Pattern SERVING_SUFFIX = Pattern.compile("[（(](?:迷你|[小中大](?:杯|份)?|[1-9][0-9]?(?:块|个|份|杯))[）)]$");
    private static final Pattern PROMOTION = Pattern.compile(
            "套餐|件套|买送|免费|半价|上新|活动|限定券|优惠|兑换|元购|任享|周末|新品|指定|供应|周边|造型|玩具|玩偶|摆件|模型|挂件|抱枕|钥匙扣|抽奖|获赠|赠品|任意|选择|购买|包含|餐厅|可换");
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");
    // The left-hand side of an actual fries/drink pairing identifies the main, even when the section is named after the deal.
    private static final Pattern PAIRED_MAIN = Pattern.compile(
            "(?:是指|[，,；;：:]|购买一份|或)([a-zA-Z0-9\\u4e00-\\u9fff·]{2,22})搭配(?:中薯条|薯条|一杯)");
    private static final Pattern SET_MAIN = Pattern.compile(
            "(?:[（(](?:含)?|包含[：:])([a-zA-Z0-9\\u4e00-\\u9fff·]{2,22})(?:[×*]1|1份)(?=[，,+＋、])");
    private static final Pattern NEW_RELEASE = Pattern.compile(
            "(?:限时推出|全新推出|新品[「“]|全新上市[：:])([^。；;\\n]{2,110})");
    private static final Pattern SPLIT_RELEASE = Pattern.compile("[、，,和及]");

    static final class Article {
        final String url;
        final LocalDate date;
        final boolean foodHeadline;
        Article(String url, LocalDate date, String title) {
            this.url = url;
            this.date = date;
            this.foodHeadline = FOOD_NEWS.matcher(title).find();
        }
    }

    static Map<String, Article> articles(String html) {
        Map<String, Article> result = new LinkedHashMap<>();
        Matcher matches = ARTICLE.matcher(html);
        while (matches.find()) {
            int end = html.indexOf("</a>", matches.end());
            if (end < 0 || end - matches.end() > 2600) continue;
            Matcher card = CARD.matcher(html.substring(matches.end(), end));
            if (!card.find()) continue;
            String url = ORIGIN + matches.group(1) + "/";
            try {
                LocalDate date = LocalDate.of(Integer.parseInt(card.group(2)), Integer.parseInt(card.group(3)),
                        Integer.parseInt(card.group(4)));
                Article existing = result.get(url);
                if (existing == null || existing.date.isBefore(date)) {
                    result.put(url, new Article(url, date, card.group(1)));
                }
            } catch (DateTimeException invalidDate) {
                // Date stamps are required for sorting and age checks.
            }
        }
        return result;
    }

    static Map<String, String> foods(String html, LocalDate published, LocalDate today) throws IOException {
        Matcher content = CONTENT.matcher(html);
        if (!content.find()) throw new IOException("官网活动页面格式暂时无法识别");
        String text = TAGS.matcher(html.substring(content.end())).replaceAll("")
                .replace("&nbsp;", "").replace("&#160;", "").replace("&amp;", "&")
                .replaceAll("[\\s\\u00a0\\u3000]+", "");
        int footer = text.indexOf("分享到");
        if (footer >= 0) text = text.substring(0, footer);
        Map<String, String> products = new LinkedHashMap<>();
        Matcher sections = SECTION.matcher(text);
        if (!sections.find()) {
            // Editorial announcements often use prose in place of bracketed promotion terms.
            if (published.isBefore(today.minusDays(14))) return products;
            if (activeWindow(text, published, today) != -1) collectRelease(text, products);
            return products;
        }
        String heading;
        int bodyStart;
        do {
            heading = sections.group(1);
            bodyStart = sections.end();
            boolean more = sections.find();
            String terms = text.substring(bodyStart, more ? sections.start() : text.length());
            int window = activeWindow(terms, published, today);
            if (window == 1 || (window == 0 && !published.isBefore(today.minusDays(14)))) {
                if (SEASONAL.matcher(terms).find()) {
                    for (String sectionName : heading.split("[&＆、]")) {
                        String name = sectionName.replaceFirst("^麦咖啡", "");
                        if (terms.contains(name)) add(products, name);
                    }
                }
                if (window == 1 && (heading.contains("件套") || terms.contains("产品组成包含")
                        || terms.contains("三件套包含") || terms.contains("两件套包含"))) {
                    collectMains(terms, PAIRED_MAIN, products);
                    collectMains(terms, SET_MAIN, products);
                    if (heading.contains("早餐")) {
                        for (String name : products.keySet()) {
                            if (terms.contains(name)) products.put(name, "早餐");
                        }
                    }
                }
                collectRelease(terms, products);
            }
            if (!more) break;
        } while (true);
        return products;
    }

    /** 1 = current, -1 = explicitly outside the window, 0 = no parseable date range. */
    static int activeWindow(String text, LocalDate published, LocalDate today) {
        Matcher range = PERIOD.matcher(text);
        if (!range.find()) return 0;
        try {
            int firstYear = range.group(1) == null ? published.getYear() : Integer.parseInt(range.group(1));
            int month = Integer.parseInt(range.group(2));
            LocalDate first = LocalDate.of(firstYear, month, Integer.parseInt(range.group(3)));
            int endMonth = Integer.parseInt(range.group(5));
            int endYear = range.group(4) == null ? firstYear + (endMonth < month ? 1 : 0)
                    : Integer.parseInt(range.group(4));
            LocalDate last = LocalDate.of(endYear, endMonth, Integer.parseInt(range.group(6)));
            return !today.isBefore(first) && !today.isAfter(last) ? 1 : -1;
        } catch (DateTimeException invalidDate) {
            return 0;
        }
    }

    private static void collectMains(String text, Pattern pattern, Map<String, String> products) {
        Matcher matches = pattern.matcher(text);
        while (matches.find()) {
            String name = matches.group(1);
            int alternative = name.lastIndexOf('或');
            if (alternative >= 0) name = name.substring(alternative + 1);
            int afterDefinition = name.lastIndexOf("是指");
            if (afterDefinition >= 0) name = name.substring(afterDefinition + 2);
            if ("汉堡".equals(classify(name)) || "早餐".equals(classify(name))) add(products, name);
        }
    }

    private static void collectRelease(String text, Map<String, String> products) {
        Matcher releases = NEW_RELEASE.matcher(text);
        while (releases.find()) {
            String clause = releases.group(1).split("[等」”]", 2)[0];
            for (String name : SPLIT_RELEASE.split(clause)) add(products, name);
        }
    }

    private static void add(Map<String, String> products, String name) {
        String category = classify(name);
        if (category != null) products.put(name, category);
    }

    private static String classify(String name) {
        name = SERVING_SUFFIX.matcher(name).replaceFirst("");
        if (!FOOD_NAME.matcher(name).matches() || PROMOTION.matcher(name).find()) return null;
        if (name.endsWith("麦满分") || name.endsWith("薯饼") || name.contains("早餐") || name.contains("厚松饼")) return "早餐";
        if (name.endsWith("堡") || name.endsWith("卷")) return "汉堡";
        if (name.matches(".*(?:雪冰|冰沙|奶铁|咖啡|拿铁|茶|汽水|特饮|气泡饮)$")) return "饮品";
        if (name.matches(".*(?:麦旋风|麦炫风|圆筒|新地|冰淇淋|派|甜筒)$")) return "甜品";
        if (name.endsWith("薯条")) return "薯条";
        if (name.matches(".*(?:鸡翅|鸡球|鸡排|炸鸡|鸡柳|脆汁鸡|麦乐鸡)$")) return "鸡肉小食";
        if (name.matches(".*(?:芝士条|双全盒|鸡块|鸡盒|薯球)$")) return "小食";
        return null;
    }

    private CampaignParser() {}
}
