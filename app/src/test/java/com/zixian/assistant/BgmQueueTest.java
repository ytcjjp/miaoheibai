package com.zixian.assistant;

import java.util.HashSet;
import java.util.Random;
import java.util.Set;
import org.junit.Test;
import static org.junit.Assert.*;

public final class BgmQueueTest {
    @Test public void cyclesVisitEveryTrackWithoutRepeatingAtBoundaries() {
        for (int seed = 0; seed < 100; seed++) {
            BgmQueue queue = new BgmQueue(3, new Random(seed));
            int previous = -1;
            for (int cycle = 0; cycle < 20; cycle++) {
                Set<Integer> tracks = new HashSet<>();
                for (int song = 0; song < 3; song++) {
                    int next = queue.next(previous);
                    assertNotEquals(previous, next);
                    assertTrue(next >= 0 && next < 3);
                    tracks.add(next);
                    previous = next;
                }
                assertEquals(3, tracks.size());
            }
        }
    }

    @Test public void newServiceDoesNotRepeatPreviouslySavedSong() {
        for (int previous = 0; previous < 3; previous++) {
            for (int seed = 0; seed < 50; seed++) {
                assertNotEquals(previous, new BgmQueue(3, new Random(seed)).next(previous));
            }
        }
    }

    @Test public void singleTrackPlaylistRemainsUsable() {
        BgmQueue queue = new BgmQueue(1, new Random(1));
        assertEquals(0, queue.next(-1));
        assertEquals(0, queue.next(0));
    }

    @Test(expected = IllegalArgumentException.class) public void rejectsEmptyPlaylist() {
        new BgmQueue(0, new Random());
    }
}
