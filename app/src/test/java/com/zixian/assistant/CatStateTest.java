package com.zixian.assistant;

import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class CatStateTest {
    private static final long NOW = 1_000_000L;
    private static final long HOUR = 3_600_000L;

    @Test public void petBuildsBondWithoutMutatingOldState() throws Exception {
        JSONObject old = CatState.fresh(NOW);
        JSONObject next = CatState.act(old, "pet", NOW);
        assertEquals(2, next.getInt("bond"));
        assertEquals(83, next.getDouble("happiness"), .001);
        assertEquals(75, old.getDouble("happiness"), .001);
        assertEquals("happy", CatState.view(next, NOW).getString("pose"));
        assertEquals("idle", CatState.view(next, NOW + 6000).getString("pose"));
    }

    @Test public void repeatedClicksCannotFarmBondOrOverfeed() throws Exception {
        JSONObject first = CatState.act(CatState.fresh(NOW), "feed", NOW);
        JSONObject repeated = CatState.act(first, "feed", NOW + 100);
        assertEquals(first.getInt("bond"), repeated.getInt("bond"));
        assertEquals(first.getLong("last_feed"), repeated.getLong("last_feed"));
        JSONObject full = CatState.act(repeated, "feed", NOW + 11000);
        assertEquals(3, full.getInt("bond"));
        assertTrue(full.getDouble("fullness") <= 100);
    }

    @Test public void playingSpendsEnergyAndRequiresFood() throws Exception {
        JSONObject state = CatState.act(CatState.fresh(NOW), "play", NOW);
        assertEquals(77, state.getDouble("energy"), .001);
        assertEquals(76, state.getDouble("fullness"), .001);
        assertEquals(87, state.getDouble("happiness"), .001);
        assertEquals("playing", CatState.view(state, NOW).getString("pose"));
        state.put("fullness", 0);
        JSONObject blocked = CatState.act(state, "play", NOW + 7000);
        assertEquals(4, blocked.getInt("bond"));
        assertEquals(1, blocked.getInt("interactions"));
    }

    @Test public void sleepRecoversEnergyAndBlocksFeedingUntilAwake() throws Exception {
        JSONObject sleeping = CatState.act(CatState.fresh(NOW), "rest", NOW);
        JSONObject later = CatState.view(sleeping, NOW + 2 * HOUR);
        assertEquals(100, later.getDouble("energy"), .001);
        assertEquals(76, later.getDouble("fullness"), .001);
        assertEquals("sleeping", later.getString("pose"));
        JSONObject blocked = CatState.act(sleeping, "feed", NOW + 2 * HOUR);
        assertEquals(0, blocked.getInt("bond"));
        JSONObject awake = CatState.act(blocked, "rest", NOW + 2 * HOUR + 1000);
        assertFalse(awake.getBoolean("sleeping"));
    }

    @Test public void repeatedSnapshotsDoNotApplyDecayTwice() throws Exception {
        JSONObject saved = CatState.fresh(NOW);
        assertEquals(CatState.view(saved, NOW + HOUR).getDouble("fullness"),
                CatState.view(saved, NOW + HOUR).getDouble("fullness"), 0);
        assertEquals(80, saved.getDouble("fullness"), 0);
        JSONObject rollback = CatState.view(saved, NOW - HOUR);
        assertEquals(80, rollback.getDouble("fullness"), 0);
        assertEquals(1, rollback.getInt("days"));
        JSONObject longAbsence = CatState.view(saved, NOW + 30 * 24 * HOUR);
        assertTrue(longAbsence.getDouble("fullness") >= 0);
        assertTrue(longAbsence.getDouble("energy") >= 0);
    }

    @Test public void settingsPreserveCareHistoryAndReturnAllThemes() throws Exception {
        JSONObject saved = CatState.act(CatState.fresh(NOW), "pet", NOW);
        JSONObject input = new JSONObject().put("name", "  煤球  ").put("collar", "gold")
                .put("theme", "clear").put("animations", false).put("showStats", false);
        JSONObject updated = CatState.settings(saved, input, NOW + 1000);
        assertEquals("煤球", updated.getString("name"));
        assertEquals("gold", updated.getString("collar"));
        assertEquals("clear", updated.getString("theme"));
        assertEquals(2, updated.getInt("bond"));
        assertEquals(NOW, updated.getLong("adoptedAt"));
        assertFalse(updated.getBoolean("animations"));
    }

    @Test(expected = JSONException.class) public void rejectsUnknownWidgetAction() throws Exception {
        CatState.act(CatState.fresh(NOW), "reset_everything", NOW);
    }

    @Test public void oldSavesGainWhiteDefaultsWithoutLosingHistory() throws Exception {
        JSONObject old = CatState.act(CatState.fresh(NOW), "pet", NOW);
        old.remove("whiteName"); old.remove("whiteCollar");
        old.put("name", "煤球").put("collar", "gold");
        JSONObject view = CatState.view(old, NOW);
        assertEquals("小银", view.getString("whiteName"));
        assertEquals("mint", view.getString("whiteCollar"));
        assertEquals("煤球", view.getString("name"));
        assertEquals("gold", view.getString("collar"));
        assertEquals(2, view.getInt("bond"));
        assertEquals(NOW, view.getLong("adoptedAt"));
        assertFalse(old.has("whiteName"));
    }

    private JSONObject options() throws Exception {
        return new JSONObject().put("name", "煤球").put("collar", "pink").put("whiteName", " 雪球 ")
                .put("whiteCollar", "gold").put("theme", "mint").put("animations", false).put("showStats", true);
    }

    @Test public void bothCatsHaveIndependentSettingsAndAllNineCollars() throws Exception {
        JSONObject old = CatState.act(CatState.fresh(NOW), "pet", NOW);
        for (String black : new String[]{"pink", "mint", "gold"}) {
            for (String white : new String[]{"pink", "mint", "gold"}) {
                JSONObject updated = CatState.settings(old, options().put("collar", black).put("whiteCollar", white), NOW + 1000);
                assertEquals("雪球", updated.getString("whiteName"));
                assertEquals("煤球", updated.getString("name"));
                assertEquals(black, updated.getString("collar"));
                assertEquals(white, updated.getString("whiteCollar"));
                assertEquals(2, updated.getInt("bond"));
                assertEquals(NOW, updated.getLong("adoptedAt"));
                assertTrue(CatState.view(updated, NOW + 1000).getString("message").contains("雪球"));
                assertTrue(CatState.act(updated, "feed", NOW + 1000).getString("message").contains("雪球"));
            }
        }
        assertEquals("小银", old.getString("whiteName"));
        JSONObject saved = CatState.settings(old, options(), NOW);
        JSONObject partial = options(); partial.remove("whiteName"); partial.remove("whiteCollar");
        JSONObject kept = CatState.settings(saved, partial, NOW);
        assertEquals("雪球", kept.getString("whiteName"));
        assertEquals("gold", kept.getString("whiteCollar"));
    }

    @Test public void invalidWhiteSettingsAreRejectedWithoutChangingSavedState() throws Exception {
        JSONObject old = CatState.fresh(NOW);
        String original = old.toString();
        for (String invalid : new String[]{"", "   ", "一二三四五六七八九十一二三", "雪\u0001球"}) {
            try { CatState.settings(old, options().put("whiteName", invalid), NOW); fail("accepted invalid white nickname"); }
            catch (JSONException expected) { assertTrue(expected.getMessage().contains("小白")); }
        }
        try { CatState.settings(old, options().put("whiteCollar", "../other"), NOW); fail("accepted invalid white collar"); }
        catch (JSONException expected) { assertTrue(expected.getMessage().contains("项圈")); }
        assertEquals(original, old.toString());
        assertEquals("一二三四五六七八九十一二", CatState.settings(old,
                options().put("whiteName", "一二三四五六七八九十一二"), NOW).getString("whiteName"));
    }

    @Test(expected = JSONException.class) public void rejectsUnsafeAssetSettings() throws Exception {
        CatState.settings(CatState.fresh(NOW), new JSONObject().put("name", "小墨")
                .put("collar", "../other").put("theme", "blush"), NOW);
    }
}
