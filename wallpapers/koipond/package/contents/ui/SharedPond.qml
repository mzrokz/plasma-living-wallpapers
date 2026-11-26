pragma Singleton
import QtQuick

// The pond that spans every monitor. Plasma runs all its wallpapers in one QML engine, so
// this is the same object in each of them. It also keeps their settings alike.
PondHost {
    id: shared

    property var settings: null
    property var walls: []          // wallpapers, each with an adopt(key, value)

    // A wallpaper takes on the settings of those already here, unless it was just switched
    // over by hand, when its own win.
    function enter(wall, values, insist) {
        walls = walls.filter(w => w !== wall).concat(wall);
        if (!settings)
            settings = Object.assign({}, values);
        for (const key in values) {
            if (insist)
                offer(wall, key, values[key]);
            else
                wall.adopt(key, settings[key]);
        }
    }

    function exit(wall) {
        walls = walls.filter(w => w !== wall);
        if (!walls.length)
            settings = null;
    }

    function offer(wall, key, value) {
        if (!settings || settings[key] === value)
            return;
        settings[key] = value;
        for (const w of walls)
            if (w !== wall)
                w.adopt(key, value);
    }
}
