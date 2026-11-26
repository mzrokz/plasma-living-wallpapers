import QtQuick

// One koi, or its shadow. The grid is bent along the spine by koi.vert.
ShaderEffect {
    id: mesh

    property bool isShadow: false
    property real bodyLength: 100
    property real depth: 0.3
    property real variety: 0
    property vector4d p0
    property vector4d p1
    property vector4d p2
    property vector4d p3
    property vector4d p4
    property vector4d p5
    property color baseColor
    property color patchA
    property color patchB
    property vector4d marks
    property vector4d fins
    property vector4d fogColor
    property vector2d shift: Qt.vector2d(0, 0)
    property real blur: 0.02

    mesh: GridMesh {
        resolution: Qt.size(mesh.isShadow ? 24 : 36, 10)
    }
    cullMode: ShaderEffect.NoCulling
    vertexShader: "shaders/koi.vert.qsb"
    fragmentShader: isShadow ? "shaders/koi_shadow.frag.qsb" : "shaders/koi.frag.qsb"
}
