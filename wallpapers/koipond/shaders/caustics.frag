#version 440
// Slow web of focused light, rendered small and stretched over the pond.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float time;
    vec2 size;           // design units
    vec2 origin;         // of this view within the pond, design units
};

#include "noise.glsl"

float web(vec2 p, float t)
{
    vec2 i = floor(p), f = fract(p);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x) {
            vec2 g = vec2(x, y);
            vec2 h = hash22(i + g);
            vec2 r = g + 0.5 + 0.42 * sin(t + 6.2831 * h) - f;
            float d = length(r);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
        }
    return pow(1.0 - smoothstep(0.0, 0.42, f2 - f1), 2.6);
}

void main()
{
    vec2 p = qt_TexCoord0 * size + origin;
    vec2 warp = vec2(noise(p / 70.0 + time * 0.12), noise(p / 70.0 - time * 0.1 + 31.0)) - 0.5;
    p += warp * 58.0;
    float a = web(p / 122.0 + vec2(time * 0.03, time * 0.02), time * 0.55);
    float b = web(mat2(0.8, 0.6, -0.6, 0.8) * p / 88.0 - time * 0.025, time * 0.68 + 4.0);
    float c = a * 0.62 + b * 0.5 + a * b * 1.3;
    c *= 0.35 + 0.95 * noise(p / 300.0 + time * 0.04);
    fragColor = vec4(vec3(clamp(c, 0.0, 1.0)), 1.0) * qt_Opacity;
}
