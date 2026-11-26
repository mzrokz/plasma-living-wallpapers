#version 440
layout(location = 0) in vec2 vBody;
layout(location = 1) in vec2 vTangent;
layout(location = 0) out vec4 fragColor;

#include "koi_uniforms.glsl"
#include "koi_shape.glsl"
#include "noise.glsl"

const vec2 LIGHT = vec2(-0.53, -0.85);

float cover(float e, float aa) { return clamp(e / aa + 0.5, 0.0, 1.0); }

vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

vec3 skin(vec2 q)
{
    float seed = marks.x;
    vec2 m = vec2(q.x * 5.2, q.y * 7.5) + seed * vec2(17.3, 9.1);
    vec2 warp = vec2(noise(m * 2.1), noise(m * 2.1 + 7.7)) - 0.5;
    float nA = fbm(m + warp * 0.7);
    float nB = fbm(m * 1.55 + warp * 0.5 + 41.0);

    vec3 col = baseColor.rgb;
    if (variety < 0.5) {
        // Colour mostly sits on the back, and fades out towards tail and nose.
        float back = 1.0 - 0.28 * smoothstep(0.55, 1.0, abs(q.y) / bodyWidth(q.x));
        float span = smoothstep(0.02, 0.09, q.x) * (1.0 - smoothstep(0.7, 0.78, q.x));
        float a = smoothstep(0.0, 0.035, nA * back * (0.55 + 0.45 * span) - (1.0 - marks.y));
        col = mix(col, patchA.rgb, a);
        float b = smoothstep(0.0, 0.03, nB * back - (1.0 - marks.z));
        col = mix(col, patchB.rgb, b);
    } else if (variety < 1.5) {
        float side = smoothstep(0.5, 0.85, abs(q.y) / bodyWidth(q.x) + (nA - 0.5) * 0.35);
        col = mix(col, patchA.rgb, side);
        float cheek = smoothstep(0.17, 0.08, q.x) * smoothstep(0.02, 0.05, abs(q.y));
        col = mix(col, patchA.rgb, cheek * 0.8);
        col = mix(col, patchB.rgb, smoothstep(0.19, 0.13, q.x) * (1.0 - cheek) * 0.75);
    } else {
        float r = length((q - vec2(0.135, 0.0)) * vec2(0.85, 1.0)) + (nA - 0.5) * 0.02;
        col = mix(col, patchA.rgb, smoothstep(0.052, 0.046, r));
    }
    return col;
}

vec4 finColor(vec3 e, vec3 tint, float aa, float opacity, float rays)
{
    float m = cover(e.x, aa);
    float ray = 0.5 + 0.5 * sin(e.z * rays);
    ray = mix(0.72, 1.0, ray);
    float a = m * opacity * mix(1.0, 0.45, smoothstep(0.35, 1.0, e.y)) * ray;
    vec3 c = tint * mix(0.92, 1.12, ray);
    return vec4(c * a, a);
}

void main()
{
    vec2 q = vBody;
    float aa = 1.25 / bodyLength;
    float w = bodyWidth(q.x);
    float bodyMask = cover(w - abs(q.y), aa) * cover(0.795 - q.x, aa) * cover(q.x - 0.008, aa);

    vec3 pale = mix(baseColor.rgb, vec3(1.0, 0.97, 0.92), 0.35);
    vec3 finTint = variety > 0.5 && variety < 1.5 ? mix(patchA.rgb, pale, 0.45) : pale;
    if (dot(baseColor.rgb, vec3(0.333)) < 0.25)
        finTint = mix(baseColor.rgb, patchA.rgb, 0.45) + 0.06;

    // Fins that sit under the body.
    vec2 m = vec2(q.x, abs(q.y));
    float sweep = q.y < 0.0 ? fins.x : fins.y;
    vec4 col = vec4(0.0);
    float flutter = sin(fins.w * 0.7 + q.x * 30.0) * 0.003;
    vec3 tail = tailFin(vec2(q.x, q.y + flutter));
    vec3 finSkin = mix(finTint, skin(vec2(clamp(q.x, 0.0, 0.74), q.y * 0.4)), 0.35);
    col = over(finColor(tail, finSkin, aa, 0.82, 17.0), col);
    vec3 pelvic = paddle(m, vec2(0.475, bodyWidth(0.475) * 0.72), 0.62 + sweep * 0.25, 0.085, 0.026);
    col = over(finColor(pelvic, finTint, aa, 0.62, 9.0), col);
    vec3 pect = paddle(m, vec2(0.225, bodyWidth(0.225) * 0.82), 0.92 - sweep, 0.152, 0.05);
    col = over(finColor(pect, finTint, aa, 0.74, 13.0), col);

    if (bodyMask > 0.0) {
        float k = clamp(q.y / w, -1.0, 1.0);
        float nz = sqrt(max(0.0, 1.0 - k * k));
        vec2 side = vec2(-vTangent.y, vTangent.x);
        float lit = dot(side * k, LIGHT);

        vec3 c = skin(q);

        // Overlapping scales from the shoulders back.
        vec2 sc = vec2(q.x * 62.0, asin(clamp(k, -0.99, 0.99)) * 5.2);
        float row = floor(sc.x);
        vec2 cell = vec2(fract(sc.x) - 0.15, fract(sc.y + 0.5 * mod(row, 2.0)) - 0.5);
        float scale = smoothstep(0.62, 0.35, length(cell * vec2(0.85, 1.0)));
        float scaleZone = smoothstep(0.17, 0.24, q.x) * (1.0 - smoothstep(0.7, 0.78, q.x))
                        * smoothstep(60.0, 130.0, bodyLength);
        float net = variety > 0.5 && variety < 1.5 ? 0.34 : 0.1;
        c *= 1.0 - scaleZone * net * (1.0 - scale);
        c += scaleZone * marks.w * scale * 0.16 * nz;

        // Rounded body: bright ridge, darker flanks, light from the upper left.
        c *= 0.62 + 0.42 * nz + 0.2 * lit;
        float ridge = exp(-pow((k - dot(side, LIGHT) * 0.32) * 3.1, 2.0));
        c += ridge * mix(0.07, 0.26, marks.w) * (0.6 + 0.4 * scale) * smoothstep(0.03, 0.14, q.x);

        // Head: gill covers, nostrils, eyes.
        float gill = abs(length((q - vec2(0.075, 0.0)) * vec2(1.0, 0.82)) - 0.112);
        c *= 1.0 - 0.2 * smoothstep(0.008, 0.0, gill) * smoothstep(0.12, 0.16, q.x) * step(0.03, m.y);
        c *= 1.0 - 0.35 * smoothstep(0.006, 0.003, length(m - vec2(0.038, 0.016)));
        float eye = length((m - vec2(0.083, bodyWidth(0.083) * 0.84)) * vec2(0.85, 1.0));
        c = mix(c, vec3(0.05, 0.045, 0.04), smoothstep(0.0135, 0.0105, eye));
        c += 0.7 * smoothstep(0.004, 0.002, length(m - vec2(0.08, bodyWidth(0.083) * 0.84 + 0.002)));

        // Where body becomes tail.
        float bodyA = bodyMask * (1.0 - 0.5 * smoothstep(0.75, 0.795, q.x));
        col = over(vec4(c * bodyA, bodyA), col);
    }

    // Dorsal fin, folded along the back and leaning with the turn.
    float dx = (q.x - 0.31) / 0.33;
    if (dx > 0.0 && dx < 1.0) {
        float lean = fins.z * 0.028 * dx;
        float h = 0.017 * sqrt(sin(3.14159 * pow(dx, 0.75))) * (0.75 + abs(fins.z));
        float e = h - abs(q.y - lean);
        float a = cover(e, aa) * 0.5 * (0.8 + 0.2 * sin(dx * 44.0));
        vec3 dc = mix(skin(vec2(q.x, 0.0)), finTint, 0.4) * 1.05;
        col = over(vec4(dc * a, a), col);
    }

    // Deeper fish pick up the colour of the water.
    float fog = depth * fogColor.a;
    col.rgb = mix(col.rgb, fogColor.rgb * col.a, fog);
    col *= 1.0 - 0.15 * depth;
    fragColor = col * qt_Opacity;
}
