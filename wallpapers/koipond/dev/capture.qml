import QtQuick
import QtQuick.Window
import QtQuick.Shapes
import "../package/contents/ui"

// Records the README footage: steps the pond at a fixed 60 Hz, renders every step and
// saves every 2nd as a PNG (30 fps) into the directory given as the last argument.
// Run it through dev/record.sh, which keeps it off your screen.
Window {
    id: win
    width: 1920; height: 1080; visible: true
    color: "black"
    property string out: Qt.application.arguments[Qt.application.arguments.length - 1]
    property int warm: 600          // 10 s settling before the first frame
    property int shots: 2 * 30 * 14 // 14 s of footage
    property int n: 0
    property bool waiting: false
    property point cur: Qt.point(-100, -100)
    property bool showCursor: false

    Item {
        id: stage
        anchors.fill: parent
        PondScene { id: pond; anchors.fill: parent; fps: -1 }
        Shape {
            visible: win.showCursor
            x: win.cur.x; y: win.cur.y
            scale: 1.6; transformOrigin: Item.TopLeft
            ShapePath {
                fillColor: "white"; strokeColor: "#222"; strokeWidth: 1.2
                startX: 0; startY: 0
                PathLine { x: 0; y: 17 } PathLine { x: 4.5; y: 13 } PathLine { x: 7.5; y: 20 }
                PathLine { x: 10.5; y: 18.8 } PathLine { x: 7.5; y: 12 } PathLine { x: 13; y: 12 }
                PathLine { x: 0; y: 0 }
            }
        }
    }

    // t: seconds into the footage
    function act(t) {
        if (t < 1.5) { showCursor = false; return; }
        if (t < 6.5) {
            // a lazy S across the middle of the pond
            const u = (t - 1.5) / 5;
            const x = 300 + u * 1300, y = 540 + Math.sin(u * Math.PI * 2) * 230;
            showCursor = true; cur = Qt.point(x, y); pond.moveCursor(x, y); return;
        }
        if (t < 7.5) { const k = (t - 6.5); const x = 1600 + (960 - 1600) * k, y = 540 + (600 - 540) * k; cur = Qt.point(x, y); pond.moveCursor(x, y); return; }
        if (Math.abs(t - 7.6) < 0.01) pond.tap(960, 600);
        if (Math.abs(t - 8.4) < 0.01) pond.tap(1010, 560);
        if (Math.abs(t - 9.0) < 0.01) pond.tap(920, 650);
        if (t > 9.5 && t < 10.5) { const k = t - 9.5; const x = 960 + 500 * k, y = 600 - 300 * k; cur = Qt.point(x, y); pond.moveCursor(x, y); }
        if (t >= 10.5 && showCursor) { showCursor = false; pond.leaveCursor(); }
    }

    function next() {
        if (n >= warm + shots) { Qt.quit(); return; }
        if (n >= warm) act((n - warm) / 60);
        pond.host.tick(1 / 60);
        n++;
        waiting = true;
        win.update();
    }
    onFrameSwapped: {
        if (!waiting) return;
        waiting = false;
        const k = n - warm;
        if (k > 0 && k % 2 === 0) {
            const name = out + "/f" + String(k / 2).padStart(4, "0") + ".png";
            stage.grabToImage(r => { r.saveToFile(name); Qt.callLater(next); });
        } else {
            Qt.callLater(next);
        }
    }
    Timer { interval: 1500; running: true; onTriggered: win.next() }
}
