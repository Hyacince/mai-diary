package cn.maidiary.app;

import java.io.IOException;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;

/** Offline fixtures for the public promotions listing and campaign article parser. */
public final class CampaignParserTest {
    private static String card(String address) {
        return "<a href='" + address + "'><h4>秋季活动</h4><time>2026.11.02</time></a>";
    }

    public static void main(String[] args) throws IOException {
        String path = "/news/20261102-Breakfast";
        String listing = "<li onclick=\"window.location.href='/news/sales'\">分类</li>"
                + "<a href='/news/20261101-Other'>导航</a>"
                + card("https://example.com" + path) + card(path) + card(path + "/")
                + card("/news/20261103-Special?next=campaign");
        check(CampaignParser.articles(listing).keySet().equals(
                new LinkedHashSet<>(Arrays.asList(CampaignParser.ORIGIN + path + "/"))));
        check(CampaignParser.articles("<h1>网站维护</h1>").isEmpty());

        String article = "<div class='body cmsMainBox featured'>"
                + "【麦咖啡好柿多多雪冰】好柿多多雪冰为季节限定产品。"
                + "【龙焰鸡腿堡&amp;龙焰芝士棒鸡腿堡】两款分别为龙焰鸡腿堡和龙焰芝士棒鸡腿堡。部分产品为季节限定品。"
                + "【超值早餐2件套】脆薯饼搭配猪柳蛋麦满分。部分产品为季节限定品。"
                + "【秋季挂件堡】秋季挂件堡为季节限定产品。"
                + "【限定丝巾】限定丝巾为季节限定品。"
                + "【草莓冰沙】请咨询餐厅当日供应。"
                + "【免费咖啡】免费咖啡为季节限定品。"
                + "【黑椒鸡腿堡】本节仅列出活动渠道。部分产品为季节限定品。"
                + "分享到：相关新闻【其他鸡腿堡】其他鸡腿堡为季节限定品。</div>";
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("好柿多多雪冰", "饮品");
        expected.put("龙焰鸡腿堡", "汉堡");
        expected.put("龙焰芝士棒鸡腿堡", "汉堡");
        LocalDate published = LocalDate.of(2026, 11, 2);
        LocalDate today = LocalDate.of(2026, 11, 11);
        check(CampaignParser.foods(article, published, today).equals(expected));
        check(CampaignParser.foods("<div class='cmsMainBox'>只有图片</div>", published, today).isEmpty());
        String realTerms = "<div class='cmsMainBox'>【大堡口福三件套】"
                + "大堡口福三件套仅需¥23.9起是指双层脆鸡堡搭配中薯条（1份）和中可口可乐（1杯）为23.9元，"
                + "海陆双全堡搭配中薯条（1份）和中可口可乐（1杯）为26.9元。"
                + "本活动自2026年11月02日起至2026年12月01日。部分产品为季节限定品。"
                + "【麦乐送】本活动自2026年11月04日至2026年12月01日。"
                + "产品组成包含：双层板烧麦满分两件套19.9元起（双层板烧麦满分1份，大鲜萃咖啡1杯）、"
                + "双层麦辣鸡腿汉堡三件套35.9元起（双层麦辣鸡腿堡1份，中薯条1份，中杯可口可乐1杯）、"
                + "四层牛肉吉士堡三件套39.9元起（四层牛肉吉士堡1份，中薯条1份，中杯可乐1杯）。"
                + "【龙焰鸡腿堡】龙焰鸡腿堡为限定品。本活动自2026年10月08日至2026年11月03日。"
                + "【下一期鸡腿堡】下一期鸡腿堡为限定品。本活动自2026年12月08日至2027年1月03日。</div>";
        Map<String, String> liveNames = CampaignParser.foods(realTerms, published, today);
        check(liveNames.keySet().equals(new LinkedHashSet<>(Arrays.asList("双层脆鸡堡", "海陆双全堡",
                "双层板烧麦满分", "双层麦辣鸡腿堡", "四层牛肉吉士堡"))));
        check(CampaignParser.activeWindow("2026年12月30日至1月3日", published, LocalDate.of(2027, 1, 1)) == 1);
        check(CampaignParser.activeWindow("2026年10月08日10:30起至2026年11月03日", published, today) == -1);
        Map<String, CampaignParser.Article> unordered = CampaignParser.articles(card("/news/old")
                + "<a href='/news/new'><h4>新口味汉堡</h4><time>2026.11.05</time></a>"
                + "<a href='/news/future'><h4>未来活动</h4><time>2027.01.01</time></a>");
        check(MenuSync.recent(unordered, today).get(0).url.endsWith("/news/new/"));
        check(MenuSync.recent(unordered, today).size() == 2);
        try {
            CampaignParser.foods("<div>【假商品堡】假商品堡为季节限定品。</div>", published, today);
            throw new AssertionError("未识别官网页面改版");
        } catch (IOException expectedError) {
            check(expectedError.getMessage().contains("格式"));
        }
        System.out.println("CampaignParserTest passed");
    }

    private static void check(boolean result) {
        if (!result) throw new AssertionError();
    }
}
