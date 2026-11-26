import QtQuick
import QtQuick.Window
import "../package/contents/ui"

// Run the pond in a plain window:  qml6 dev/preview.qml
Window {
    width: 1600
    height: 900
    visible: true
    title: "Koi pond preview"

    PondScene {
        id: pond
        anchors.fill: parent
    }
    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        onPositionChanged: mouse => pond.moveCursor(mouse.x, mouse.y)
        onExited: pond.leaveCursor()
        onClicked: mouse => pond.tap(mouse.x, mouse.y)
    }
}
