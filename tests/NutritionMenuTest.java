package cn.maidiary.app;

import org.json.JSONException;
import java.util.Map;

/** Run with a JDK and the org.json runtime, using synthetic offline nutrition fixtures. */
public final class NutritionMenuTest {
    private static String product(String name, String types) {
        return "{\"title\":\"" + name + "\",\"ProductType\":[" + types + "]}";
    }

    private static String type(String name, String kj) {
        return "{\"title\":\"" + name + "\",\"nutrition\":[0," + kj + "]}";
    }

    public static void main(String[] args) throws JSONException {
        String page = "<script>var raw_data = {\"Product\":{"
                + "\"a\":" + product("秋日鸡腿堡", "\"1\"")
                + ",\"b\":" + product("秋日雪冰", "\"2\",\"3\"")
                + ",\"c\":" + product("秋日甜筒", "\"4\"")
                + ",\"d\":" + product("同名鸡排", "\"1\"")
                + ",\"e\":" + product("同名鸡排", "\"5\"")
                + ",\"f\":" + product("豆乳拿铁", "\"2\"")
                + ",\"g\":" + product("无糖红茶", "\"6\"")
                + "},\"ProductType\":{\"1\":" + type("1个", "2092")
                + ",\"2\":" + type("小", "418.4") + ",\"3\":" + type("大", "836.8")
                + ",\"4\":" + type("1个", "null") + ",\"5\":" + type("1个", "418.4")
                + ",\"6\":" + type("默认", "0") + "}};</script>";
        Map<String, Integer> kcal = NutritionMenu.read(page);
        equal(500, kcal.get("秋日鸡腿堡"));
        equal(100, kcal.get(NutritionMenu.normalized("秋日雪冰 (小)")));
        equal(200, kcal.get("秋日雪冰（大）"));
        equal(0, kcal.get("无糖红茶"));
        equal(null, kcal.get("秋日雪冰"));
        equal(null, kcal.get("秋日雪冰（中）"));
        equal(null, kcal.get("秋日甜筒"));
        equal(null, kcal.get("秋日芝士鸡腿堡"));
        equal(null, kcal.get("同名鸡排"));
        equal(null, kcal.get("豆乳拿铁"));
        if (!NutritionMenu.read("<p>改版</p>").isEmpty()) throw new AssertionError();
        System.out.println("NutritionMenuTest passed");
    }

    private static void equal(Integer expected, Integer actual) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new AssertionError("Expected " + expected + ", got " + actual);
        }
    }
}
