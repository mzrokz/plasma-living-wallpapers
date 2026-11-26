import QtQuick
import QtQuick.Window
import org.kde.plasma.plasmoid
import "."

WallpaperItem {
    id: root

    readonly property var fixedHours: [0, 6.5, 12.5, 18.4, 23]
    property real clockHour: 12

    function readClock() {
        const now = new Date();
        clockHour = now.getHours() + now.getMinutes() / 60;
    }

    // One pond across the monitors, and one set of settings for it.
    readonly property bool spanning: root.configuration.SharedPond
    readonly property var settings: ({
        KoiCount: root.configuration.KoiCount, KoiSize: root.configuration.KoiSize,
        SwimSpeed: root.configuration.SwimSpeed, FryCount: root.configuration.FryCount,
        CursorMode: root.configuration.CursorMode, ClickFeeds: root.configuration.ClickFeeds,
        RippleStrength: root.configuration.RippleStrength, WaterTheme: root.configuration.WaterTheme,
        TimeOfDay: root.configuration.TimeOfDay, Caustics: root.configuration.Caustics,
        Rain: root.configuration.Rain, PadCount: root.configuration.PadCount,
        Flowers: root.configuration.Flowers, PetalCount: root.configuration.PetalCount,
        Fireflies: root.configuration.Fireflies, Fps: root.configuration.Fps,
        PixelSize: root.configuration.PixelSize, PauseMode: root.configuration.PauseMode
    })
    property var known: null        // settings as of the last change

    function adopt(key, value) {
        if (root.configuration[key] === value)
            return;
        root.configuration[key] = value;
        root.configuration.writeConfig();
    }

    onSettingsChanged: {
        if (!known)
            return;
        const before = known;
        known = settings;
        if (!spanning)
            return;
        for (const key in settings)
            if (settings[key] !== before[key])
                SharedPond.offer(root, key, settings[key]);
    }

    function span(insist) {
        if (spanning)
            SharedPond.enter(root, settings, insist);
        else
            SharedPond.exit(root);
    }

    onSpanningChanged: if (known) Qt.callLater(span, true)

    Component.onCompleted: {
        readClock();
        known = settings;
        span(false);
        pond.ready = true;
    }
    Component.onDestruction: SharedPond.exit(root)

    Timer {
        interval: 60000
        repeat: true
        running: root.configuration.TimeOfDay === 0
        onRunningChanged: root.readClock()
        onTriggered: root.readClock()
    }

    PondScene {
        id: pond
        anchors.fill: parent
        ready: false
        running: !(windows.item && windows.item.covered)
        sharedHost: root.spanning ? SharedPond : null
        place: Qt.point(Screen.virtualX, Screen.virtualY)

        fps: root.configuration.Fps
        koiCount: root.configuration.KoiCount
        koiSize: root.configuration.KoiSize / 100
        swimSpeed: root.configuration.SwimSpeed / 100
        fryCount: root.configuration.FryCount
        padCount: root.configuration.PadCount
        flowers: root.configuration.Flowers
        petalCount: root.configuration.PetalCount
        fireflies: root.configuration.Fireflies
        cursorMode: root.configuration.CursorMode
        clickFeeds: root.configuration.ClickFeeds
        rippleStrength: root.configuration.RippleStrength / 100
        causticStrength: root.configuration.Caustics / 100
        rain: root.configuration.Rain / 100
        waterTheme: root.configuration.WaterTheme
        pixelSize: root.configuration.PixelSize
        hour: root.configuration.TimeOfDay === 0 ? root.clockHour : root.fixedHours[root.configuration.TimeOfDay]
    }

    // The desktop's icons and widgets sit above the wallpaper and take its mouse
    // events, so watch from an invisible sheet laid over the whole window. Its handlers
    // only ever take passive grabs: selecting icons, dragging widgets and the context
    // menu all still work.
    Item {
        id: sheet
        parent: root.Window.window ? root.Window.window.contentItem : root
        anchors.fill: parent
        z: 1e6

        function move(p) {
            const l = root.mapFromItem(sheet, p.x, p.y);
            pond.moveCursor(l.x, l.y);
        }

        HoverHandler {
            id: hover
            blocking: false
            onPointChanged: if (hovered) sheet.move(point.position)
            onHoveredChanged: if (!hovered) pond.leaveCursor()
        }
        PointHandler {
            id: drag
            acceptedButtons: Qt.LeftButton
            onPointChanged: if (active) sheet.move(point.position)
            onActiveChanged: if (!active && !hover.hovered) pond.leaveCursor()
        }
        TapHandler {
            acceptedButtons: Qt.LeftButton
            gesturePolicy: TapHandler.DragThreshold
            onTapped: eventPoint => {
                const l = root.mapFromItem(sheet, eventPoint.position.x, eventPoint.position.y);
                pond.tap(l.x, l.y);
            }
        }
    }

    // In a Loader because the task manager is missing on the lock screen.
    Loader {
        id: windows
        active: root.configuration.PauseMode > 0
        source: "WindowWatcher.qml"
        onLoaded: {
            item.includeMaximized = Qt.binding(() => root.configuration.PauseMode === 2);
            item.screenGeometry = Qt.binding(() => Qt.rect(pond.Screen.virtualX, pond.Screen.virtualY, pond.Screen.width, pond.Screen.height));
        }
    }
}
