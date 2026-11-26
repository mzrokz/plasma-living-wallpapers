layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float bodyLength;   // px
    float depth;        // 0 surface .. 1 bottom
    float variety;      // 0 patches, 1 asagi, 2 tancho
    vec4 p0;
    vec4 p1;
    vec4 p2;
    vec4 p3;
    vec4 p4;
    vec4 p5;
    vec4 baseColor;
    vec4 patchA;
    vec4 patchB;
    vec4 marks;         // seed, coverage A, coverage B, metallic
    vec4 fins;          // left sweep, right sweep, dorsal sway, phase
    vec4 fogColor;
    vec2 shift;         // px, used by the shadow
    float blur;         // body lengths, used by the shadow
};
