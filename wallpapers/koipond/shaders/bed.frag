#version 440
// Pebbled pond floor. Rendered once and cached, so it can afford to be expensive.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float unit;          // px per design unit
    vec2 resolution;
    vec4 sandColor;
    vec4 stoneColor;
    vec4 mossColor;
    vec2 origin;         // of this view within the pond, px
};

#include "noise.glsl"

// Scatter rounded stones, one per cell; where they overlap, the taller one wins.
// They gather where fbm(p / patchSize) falls in the range lo..hi.
void stones(inout vec3 col, vec2 p, float size, float patchSize, float lo, float hi, float most, float seed)
{
    vec2 q = p / size;
    vec2 cell = floor(q);
    float top = 0.0, occlusion = 0.0;
    vec3 best = vec3(0.0);
    float bestMask = 0.0;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x) {
            vec2 c = cell + vec2(x, y);
            vec2 r1 = hash22(c + seed * 17.0);
            vec2 r2 = hash22(c + seed * 29.0 + 71.0);
            // Decided per stone, not per pixel, so none come out sliced.
            float density = most * smoothstep(lo, hi, fbm((c + 0.5) * size / patchSize + 3.0));
            if (r2.x > density)
                continue;
            vec2 d = q - (c + 0.5 + (r1 - 0.5) * 0.7);
            float turn = r2.y * 6.2831853;
            d = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * d;
            float radius = mix(0.36, 0.62, hash21(c + seed + 3.0));
            vec2 e = d / (radius * vec2(1.0, mix(0.66, 0.95, r1.x)));
            e += (vec2(noise(d * 2.6 + r1 * 40.0), noise(d * 2.6 + r2 * 40.0)) - 0.5) * 0.34;
            // Superellipse: flatter sides than an egg, no corners.
            float rr = pow(pow(abs(e.x), 2.5) + pow(abs(e.y), 2.5), 0.4);
            occlusion = max(occlusion, smoothstep(1.28, 0.95, rr));
            float mask = smoothstep(1.0, 1.0 - 2.4 / size / radius, rr);
            if (mask <= 0.0)
                continue;
            float dome = sqrt(max(0.0, 1.0 - rr * rr));
            float z = dome * radius + r1.y * 0.3;
            if (z * mask < top)
                continue;
            top = z * mask;

            float tone = hash21(c + seed + 11.0);
            vec3 k = mix(stoneColor.rgb * 0.62, stoneColor.rgb * 1.28, tone * tone);
            k = mix(k, sandColor.rgb * 1.05, 0.55 * hash21(c + seed + 23.0));
            k *= 0.84 + 0.32 * fbm(d * 5.0 + tone * 30.0);
            k *= 0.95 + 0.1 * noise(p / 1.7);
            vec2 n = e / max(rr, 0.1) * pow(min(rr, 1.0), 2.2);
            n = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * n;
            k *= 0.6 + 0.42 * dome + 0.3 * dot(n, vec2(-0.53, -0.85));
            best = k;
            bestMask = mask;
        }
    col *= 1.0 - 0.62 * occlusion;
    col = mix(col, best, bestMask);
}

void main()
{
    vec2 p = (qt_TexCoord0 * resolution + origin) / unit;
    vec3 col = sandColor.rgb * (0.72 + 0.5 * fbm(p / 34.0)) * (0.9 + 0.2 * noise(p / 2.2));
    stones(col, p, 21.0, 420.0, 0.0, 0.8, 0.95, 1.0);
    stones(col, p, 34.0, 420.0, 0.0, 0.9, 0.85, 2.0);
    stones(col, p, 62.0, 420.0, 0.3, 0.6, 0.62, 3.0);
    stones(col, p, 128.0, 520.0, 0.4, 0.66, 0.42, 4.0);

    float moss = smoothstep(0.5, 0.78, fbm(p / 150.0 + 60.0) + 0.16 * (noise(p / 7.0) - 0.5));
    col = mix(col, mossColor.rgb * (0.55 + 0.8 * noise(p / 4.0)), moss * 0.6);
    // Broad shallows and hollows.
    col *= 0.5 + 0.7 * fbm(p / 640.0 + 90.0);
    fragColor = vec4(col, 1.0) * qt_Opacity;
}
