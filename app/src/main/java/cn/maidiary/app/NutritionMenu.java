package cn.maidiary.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class NutritionMenu {
    static final String URL = CampaignParser.ORIGIN + "/nutrition_calculator";
    private static final Pattern DATA = Pattern.compile("var\\s+raw_data\\s*=\\s*(\\{[^\\r\\n]*\\})\\s*;");
    private static final Pattern ORDINARY_SERVING = Pattern.compile("默认|1个|1份|1块|1杯|一杯");

    static Map<String, Integer> read(String html) throws JSONException {
        Map<String, Integer> result = new HashMap<>();
        Matcher match = DATA.matcher(html);
        if (!match.find()) return result;
        JSONObject menu = new JSONObject(match.group(1));
        JSONObject products = menu.getJSONObject("Product");
        JSONObject types = menu.getJSONObject("ProductType");
        Iterator<String> ids = products.keys();
        while (ids.hasNext()) {
            JSONObject product = products.getJSONObject(ids.next());
            String name = normalized(product.optString("title", ""));
            JSONArray variants = product.optJSONArray("ProductType");
            if (name.isEmpty() || variants == null) continue;
            boolean bareNameResolved = false;
            for (int i = 0; i < variants.length(); i++) {
                JSONObject type = types.optJSONObject(variants.optString(i));
                if (type == null) continue;
                String portion = normalized(type.optString("title", ""));
                Integer kcal = calories(type.optJSONArray("nutrition"));
                boolean labeledInName = !portion.isEmpty() && name.endsWith("（" + portion + "）");
                if (variants.length() == 1 && (labeledInName || ORDINARY_SERVING.matcher(portion).matches())) {
                    addUnique(result, name, kcal);
                    bareNameResolved = true;
                }
                if (!portion.isEmpty() && !labeledInName && !portion.equals("默认")) {
                    addUnique(result, name + "（" + portion + "）", kcal);
                }
            }
            if (!bareNameResolved) result.put(name, null);
        }
        return result;
    }

    static String normalized(String value) {
        return value.trim().replace('(', '（').replace(')', '）').replaceAll("\\s+（", "（");
    }

    private static Integer calories(JSONArray nutrition) {
        if (nutrition == null || nutrition.isNull(1)) return null;
        double kj = nutrition.optDouble(1, Double.NaN);
        if (Double.isNaN(kj) || Double.isInfinite(kj) || kj < 0 || kj > 100_000) return null;
        return (int) Math.round(kj / 4.184);
    }

    private static void addUnique(Map<String, Integer> values, String name, Integer kcal) {
        values.put(name, values.containsKey(name) ? null : kcal);
    }

    private NutritionMenu() {}
}
