#version 440
// Lily pad. mode 0 = leaf, mode 1 = its shadow on the pond floor.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float radius;        // px
    float seed;
    float angle;
    float mode;
    float wet;
    vec4 leafColor;
    vec4 lightColor;
};

#include "noise.glsl"

void main()
{
    vec2 q = (qt_TexCoord0 - 0.5) * 2.5;
    float r = length(q);
    float th = atan(q.y, q.x);
    float rim = 1.0 + 0.022 * sin(th * 3.0 + seed * 7.0) + 0.013 * sin(th * 7.0 - seed * 3.0)
              + 0.02 * (noise(vec2(th * 3.0, seed * 9.0)) - 0.5);

    // The notch runs from the rim almost to the centre.
    float open = 0.14 + 0.1 * fract(seed * 5.3);
    float notch = abs(th) - open * smoothstep(0.02, 0.6, r) - 0.02;
    float e = min(rim - r, notch * r);

    if (mode > 0.5) {
        float a = smoothstep(-0.14, 0.12, e) * 0.5;
        fragColor = vec4(vec3(0.0, 0.015, 0.02) * a, a) * qt_Opacity;
        return;
    }

    float aa = 1.2 / radius;
    float mask = clamp(e / aa + 0.5, 0.0, 1.0);
    if (mask <= 0.0)
        discard;

    vec3 col = leafColor.rgb * (0.62 + 0.62 * fbm(q * 2.1 + seed * 20.0));
    col = mix(col, vec3(0.36, 0.3, 0.1) * (0.5 + leafColor.g), smoothstep(0.6, 0.8, fbm(q * 3.2 + seed * 50.0)) * smoothstep(0.35, 1.0, r) * 0.55);
    col = mix(col, leafColor.rgb * vec3(1.35, 1.22, 0.8), smoothstep(0.55, 0.0, r) * 0.45);

    // Veins fork once on their way to the rim.
    float count = 17.0;
    float a0 = th * count / 6.28318 + 0.5;
    float vein = abs(fract(a0) - 0.5) * 6.28318 / count * r;
    float split = smoothstep(0.45, 0.75, r);
    float a1 = th * count * 2.0 / 6.28318 + 0.5;
    float vein2 = abs(fract(a1) - 0.5) * 3.14159 / count * r;
    float vw = mix(0.011, 0.006, r);
    float v = max(smoothstep(vw + aa, vw * 0.4, vein), smoothstep(vw + aa, vw * 0.3, vein2) * split * 0.6);
    v *= smoothstep(0.03, 0.12, r) * (1.0 - smoothstep(0.86, 1.0, r));
    col = mix(col, leafColor.rgb * 1.65 + 0.02, v * 0.2);
    // Quilted swelling between the veins.
    col *= 0.93 + 0.11 * cos(a0 * 6.28318 + 3.14159) * smoothstep(0.15, 0.5, r);

    // Slightly dished leaf lit from the upper left; undo the item's rotation.
    float c = cos(angle), s = sin(angle);
    vec2 wq = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    col *= 1.0 + 0.22 * dot(wq / max(r, 0.05), vec2(-0.53, -0.85)) * -smoothstep(0.3, 1.0, r) * 0.8;
    float lip = smoothstep(0.075, 0.0, e);
    col = mix(col, vec3(0.42, 0.22, 0.12) * (0.6 + leafColor.g), lip * 0.35);
    float edgeLight = smoothstep(0.028, 0.008, e) * clamp(0.5 + 0.5 * dot(wq / max(r, 0.05), vec2(-0.53, -0.85)), 0.0, 1.0);
    col += edgeLight * 0.16;
    col += vec3(0.05, 0.075, 0.08) * smoothstep(0.35, 0.9, fbm(wq * 1.4 + seed * 4.0)) * smoothstep(0.9, -0.6, dot(wq, vec2(0.53, 0.85)));

    // Beads of water.
    for (int i = 0; i < 4; ++i) {
        vec2 h = hash22(vec2(seed * 31.0 + float(i), float(i) * 7.0));
        vec2 b = (h - 0.5) * 1.25;
        float br = (0.02 + 0.035 * hash21(h * 91.0)) * wet;
        vec2 d = wq - b;
        float bm = smoothstep(br + aa, br - aa, length(d));
        float inner = dot(d / max(br, 1e-3), vec2(0.53, 0.85));
        col = mix(col, col * (1.0 + 0.4 * inner) + 0.03, bm);
        col += bm * 0.85 * smoothstep(br * 0.42, br * 0.15, length(d + vec2(0.35, 0.5) * br));
    }

    col *= lightColor.rgb * lightColor.a;
    fragColor = vec4(col * mask, mask) * qt_Opacity;
}
