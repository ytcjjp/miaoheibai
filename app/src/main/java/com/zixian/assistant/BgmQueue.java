package com.zixian.assistant;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

final class BgmQueue {
    private final int size;
    private final Random random;
    private final List<Integer> bag = new ArrayList<>();

    BgmQueue(int size, Random random) {
        if (size < 1) throw new IllegalArgumentException("Empty playlist");
        this.size = size;
        this.random = random;
    }

    int next(int current) {
        if (bag.isEmpty()) {
            for (int i = 0; i < size; i++) bag.add(i);
            Collections.shuffle(bag, random);
            // Keep cycle boundaries from repeating the song that just ended.
            if (size > 1 && bag.get(0) == current) Collections.swap(bag, 0, 1);
        }
        return bag.remove(0);
    }
}
