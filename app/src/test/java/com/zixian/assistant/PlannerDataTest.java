package com.zixian.assistant;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class PlannerDataTest {
    private JSONObject item(String id) throws Exception {
        return new JSONObject().put("id", id).put("title", "猫咪的备忘")
                .put("body", "<script>literal text</script>").put("updatedAt", 1234).put("dueAt", 0);
    }

    @Test public void preservesNotesAndTaskCompletion() throws Exception {
        JSONObject data = new JSONObject(PlannerData.EMPTY);
        data.getJSONArray("notes").put(item("note"));
        data.getJSONArray("tasks").put(item("task").put("done", true));
        JSONObject result = PlannerData.validate(data.toString());
        assertEquals("<script>literal text</script>", result.getJSONArray("notes").getJSONObject(0).getString("body"));
        assertTrue(result.getJSONArray("tasks").getJSONObject(0).getBoolean("done"));
        assertFalse(result.getJSONArray("notes").getJSONObject(0).getBoolean("done"));
    }

    @Test(expected = JSONException.class) public void rejectsDuplicateIdsAcrossLists() throws Exception {
        JSONObject data = new JSONObject(PlannerData.EMPTY);
        data.getJSONArray("notes").put(item("same"));
        data.getJSONArray("tasks").put(item("same"));
        PlannerData.validate(data.toString());
    }

    @Test(expected = JSONException.class) public void eventsRequireTargetDate() throws Exception {
        JSONObject data = new JSONObject(PlannerData.EMPTY);
        data.getJSONArray("events").put(item("event"));
        PlannerData.validate(data.toString());
    }

    @Test(expected = JSONException.class) public void rejectsUnboundedRecords() throws Exception {
        JSONObject data = new JSONObject(PlannerData.EMPTY);
        JSONArray notes = data.getJSONArray("notes");
        for (int i = 0; i < 501; i++) notes.put(item("n" + i));
        PlannerData.validate(data.toString());
    }

    @Test(expected = JSONException.class) public void rejectsBlankTitles() throws Exception {
        JSONObject data = new JSONObject(PlannerData.EMPTY);
        data.getJSONArray("notes").put(item("note").put("title", "  "));
        PlannerData.validate(data.toString());
    }
}
