#version 440
// Water lily: four whorls of pointed petals around golden stamens. `bloom` opens it.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float radius;
    float seed;
    float angle;
    float bloom;
    vec4 petalColor;
    vec4 tipColor;
    vec4 lightColor;
};

#include "noise.glsl"

const float TAU = 6.2831853;

void main()
{
    vec2 q = (qt_TexCoord0 - 0.5) * 2.4;
    float r = length(q);
    float th = atan(q.y, q.x);
    float aa = 1.4 / radius;
    vec4 col = vec4(0.0);

    float sh = smoothstep(1.12, 0.35, length(q - vec2(0.06, 0.1))) * 0.34;
    col = vec4(0.0, 0.01, 0.01, 1.0) * sh;

    for (int ring = 0; ring < 4; ++ring) {
        float k = float(ring);
        float n = 8.0 - k;
        float len = (1.0 - k * 0.2) * mix(0.55, 1.0, bloom);
        float wid = (0.185 - k * 0.012) * mix(0.75, 1.0, bloom);
        // Two passes so neighbouring petals overlap like shingles.
        for (int pass_ = 0; pass_ < 2; ++pass_) {
            float step_ = TAU / n;
            float shifted = th + k * 0.43 + seed * 6.0 + float(pass_) * step_ * 0.5;
            float id = floor(shifted / step_ + 0.5);
            float a = shifted - id * step_;
            id = mod(id, n);
            float jitter = hash21(vec2(id + float(pass_) * 31.0, k * 7.0 + seed * 13.0));
            a += (jitter - 0.5) * 0.16;
            float L = len * (0.92 + 0.12 * jitter) * (pass_ == 0 ? 0.96 : 1.0);
            vec2 l = r * vec2(cos(a), sin(a));
            float x = l.x / L;
            if (x < 0.0 || x > 1.02)
                continue;
            float h = wid * pow(max(x, 0.0), 0.5) * pow(max(1.0 - x, 0.0), 0.62) * 2.05;
            float e = h - abs(l.y);
            col.rgb *= 1.0 - 0.34 * smoothstep(-0.07, 0.01, e);
            float m = clamp(e / aa + 0.5, 0.0, 1.0);
            if (m <= 0.0)
                continue;
            float v = l.y / max(h, 1e-3);
            vec3 c = mix(petalColor.rgb, tipColor.rgb, smoothstep(0.25, 1.0, x));
            c *= 0.97 + 0.03 * sin(v * 14.0);
            // Cupped petals: lit along one side, shaded at the base of the whorl.
            vec2 dir = vec2(cos(th - a + angle), sin(th - a + angle));
            vec2 acr = vec2(-dir.y, dir.x);
            c *= 0.9 + 0.13 * dot(dir, vec2(-0.53, -0.85)) - 0.15 * v * dot(acr, vec2(-0.53, -0.85));
            c *= mix(0.5, 1.0, smoothstep(0.08, 0.6, x));
            c += 0.09 * smoothstep(0.12, 0.0, abs(v)) * x;
            c = mix(c, vec3(1.0, 0.96, 0.95), smoothstep(aa * 4.0, aa, e) * 0.22);
            col = vec4(c * m, m) + col * (1.0 - m);
        }
    }

    float core = 0.2 * mix(0.7, 1.0, bloom);
    float fringe = core * (0.82 + 0.22 * sin(th * 19.0 + seed) * sin(th * 7.0));
    float m = clamp((fringe - r) / (aa * 1.5) + 0.5, 0.0, 1.0);
    vec3 gold = mix(vec3(0.95, 0.55, 0.1), vec3(1.0, 0.84, 0.28), smoothstep(0.0, core, r));
    gold *= 0.8 + 0.35 * noise(vec2(th * 11.0, r * 40.0));
    gold = mix(gold, vec3(0.78, 0.7, 0.2), smoothstep(0.07, 0.04, r));
    col = vec4(gold * m, m) + col * (1.0 - m);

    col.rgb *= lightColor.rgb * lightColor.a;
    fragColor = col * qt_Opacity;
}
