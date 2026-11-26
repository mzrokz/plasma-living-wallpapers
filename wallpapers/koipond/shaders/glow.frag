#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec4 tint;
};

void main()
{
    float r = length(qt_TexCoord0 - 0.5) * 2.0;
    float a = exp(-r * r * 9.0) * 0.35 + exp(-r * r * 160.0);
    a *= smoothstep(1.0, 0.7, r);
    // Alpha 0 makes the premultiplied blend additive.
    fragColor = vec4(tint.rgb * a, 0.0) * qt_Opacity;
}
