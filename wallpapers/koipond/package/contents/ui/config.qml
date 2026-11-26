import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Kirigami.FormLayout {
    id: root
    twinFormLayouts: parentLayout

    property alias formLayout: root

    property alias cfg_KoiCount: koiCount.value
    property alias cfg_KoiSize: koiSize.value
    property alias cfg_SwimSpeed: swimSpeed.value
    property alias cfg_FryCount: fryCount.value
    property alias cfg_CursorMode: cursorMode.currentIndex
    property alias cfg_ClickFeeds: clickFeeds.checked
    property alias cfg_RippleStrength: rippleStrength.value
    property alias cfg_WaterTheme: waterTheme.currentIndex
    property alias cfg_TimeOfDay: timeOfDay.currentIndex
    property alias cfg_Caustics: caustics.value
    property alias cfg_Rain: rain.value
    property alias cfg_PadCount: padCount.value
    property alias cfg_Flowers: flowers.checked
    property alias cfg_PetalCount: petalCount.value
    property alias cfg_Fireflies: fireflies.checked
    property alias cfg_SharedPond: sharedPond.checked
    property int cfg_Fps
    property int cfg_PixelSize
    property alias cfg_PauseMode: pauseMode.currentIndex

    component Percent: RowLayout {
        property alias value: slider.value
        property alias from: slider.from
        property alias to: slider.to
        QQC2.Slider {
            id: slider
            from: 0
            to: 200
            stepSize: 5
            snapMode: QQC2.Slider.SnapAlways
            Layout.preferredWidth: Kirigami.Units.gridUnit * 12
        }
        QQC2.Label {
            text: Math.round(slider.value) + "%"
            Layout.preferredWidth: Kirigami.Units.gridUnit * 3
        }
    }

    readonly property bool each: Qt.application.screens.length > 1

    QQC2.CheckBox {
        id: sharedPond
        Kirigami.FormData.label: "Monitors:"
        text: "One pond across all monitors"
        visible: root.each
    }
    QQC2.Label {
        text: "Settings here apply to every monitor sharing the pond."
        font: Kirigami.Theme.smallFont
        opacity: 0.7
        visible: root.each && sharedPond.checked
    }

    Kirigami.Separator {
        Kirigami.FormData.label: "Fish"
        Kirigami.FormData.isSection: true
    }
    QQC2.SpinBox {
        id: koiCount
        Kirigami.FormData.label: root.each ? "Koi per monitor:" : "Koi:"
        from: 0
        to: 40
    }
    Percent {
        id: koiSize
        Kirigami.FormData.label: "Koi size:"
        from: 40
        to: 200
    }
    Percent {
        id: swimSpeed
        Kirigami.FormData.label: "Swimming speed:"
        from: 30
        to: 250
    }
    QQC2.SpinBox {
        id: fryCount
        Kirigami.FormData.label: root.each ? "Minnows per monitor:" : "Minnows:"
        from: 0
        to: 60
    }

    Kirigami.Separator {
        Kirigami.FormData.label: "Interaction"
        Kirigami.FormData.isSection: true
    }
    QQC2.ComboBox {
        id: cursorMode
        Kirigami.FormData.label: "Around the cursor, koi are:"
        model: ["Natural: curious when still, startled when fast", "Shy: keep away", "Friendly: follow", "Oblivious"]
    }
    QQC2.CheckBox {
        id: clickFeeds
        Kirigami.FormData.label: "Clicking:"
        text: "Drops food (otherwise splashes)"
    }
    Percent {
        id: rippleStrength
        Kirigami.FormData.label: "Ripples:"
    }

    Kirigami.Separator {
        Kirigami.FormData.label: "Pond"
        Kirigami.FormData.isSection: true
    }
    QQC2.ComboBox {
        id: waterTheme
        Kirigami.FormData.label: "Water:"
        model: ["Jade", "Lagoon", "Ink", "Clear spring", "Moss garden"]
    }
    QQC2.ComboBox {
        id: timeOfDay
        Kirigami.FormData.label: "Light:"
        model: ["Follow the clock", "Dawn", "Day", "Dusk", "Night"]
    }
    Percent {
        id: caustics
        Kirigami.FormData.label: "Dancing light:"
    }
    Percent {
        id: rain
        Kirigami.FormData.label: "Rain:"
        to: 100
    }
    QQC2.SpinBox {
        id: padCount
        Kirigami.FormData.label: root.each ? "Lily pads per monitor:" : "Lily pads:"
        from: 0
        to: 18
    }
    QQC2.CheckBox {
        id: flowers
        text: "Water lilies"
    }
    QQC2.SpinBox {
        id: petalCount
        Kirigami.FormData.label: root.each ? "Drifting petals per monitor:" : "Drifting petals:"
        from: 0
        to: 40
    }
    QQC2.CheckBox {
        id: fireflies
        text: "Fireflies at night"
    }

    Kirigami.Separator {
        Kirigami.FormData.label: "Display"
        Kirigami.FormData.isSection: true
    }
    QQC2.ComboBox {
        readonly property var choices: [1, 2, 3, 4, 6]
        Kirigami.FormData.label: "Style:"
        model: ["Smooth", "Fine pixels", "Pixel art", "Chunky pixels", "Very chunky pixels"]
        currentIndex: Math.max(0, choices.indexOf(root.cfg_PixelSize))
        onActivated: index => root.cfg_PixelSize = choices[index]
    }
    QQC2.ComboBox {
        readonly property var choices: [30, 60, 120, 0]
        Kirigami.FormData.label: "Frame rate:"
        model: ["30 fps", "60 fps", "120 fps", "Match display"]
        currentIndex: Math.max(0, choices.indexOf(root.cfg_Fps))
        onActivated: index => root.cfg_Fps = choices[index]
    }
    QQC2.ComboBox {
        id: pauseMode
        Kirigami.FormData.label: "Pause:"
        model: ["Never", "Behind fullscreen windows", "Behind fullscreen or maximized windows"]
    }
}
