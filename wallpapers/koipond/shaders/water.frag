#version 440
// Composites pond floor + fish through the water surface.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float time;
    float unit;
    float causticStrength;
    vec2 resolution;
    vec2 cells;
    vec4 waterColor;     // rgb, murkiness
    vec4 deepColor;
    vec4 lightColor;     // rgb, overall brightness
    vec4 skyColor;       // rgb, reflection strength
    vec2 origin;         // of this view within the pond, px
    vec2 span;           // the whole pond, px
};
layout(binding = 1) uniform sampler2D bedTex;
layout(binding = 2) uniform sampler2D fishTex;
layout(binding = 3) uniform sampler2D waveTex;
layout(binding = 4) uniform sampler2D causticTex;

#include "noise.glsl"

// Smooth B-spline lookup, so the coarse wave grid never shows.
float height(vec2 uv)
{
    vec2 p = uv * cells - 0.5;
    vec2 i = floor(p), f = p - i;
    vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
    vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
    vec2 w3 = f * f * f / 6.0;
    vec2 w2 = 1.0 - w0 - w1 - w3;
    vec2 g0 = w0 + w1, g1 = w2 + w3;
    vec2 a = (i - 0.5 + w1 / g0) / cells;
    vec2 b = (i + 1.5 + w3 / g1) / cells;
    return (texture(waveTex, vec2(a.x, a.y)).r * g0.x + texture(waveTex, vec2(b.x, a.y)).r * g1.x) * g0.y
         + (texture(waveTex, vec2(a.x, b.y)).r * g0.x + texture(waveTex, vec2(b.x, b.y)).r * g1.x) * g1.y;
}

// Gentle ever-present swell.
vec2 swell(vec2 p)
{
    vec2 g = vec2(0.0);
    g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.021 + time * 0.9);
    g += vec2(-0.5, 0.87) * cos(dot(p, vec2(-0.5, 0.87)) * 0.034 - time * 1.15 + 1.3) * 0.7;
    g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 0.052 + time * 1.5 + 4.0) * 0.45;
    float n = noise(p / 46.0 + time * 0.22) - noise(p / 46.0 + 17.0 - time * 0.18);
    return g * 0.5 + vec2(n, -n) * 0.9;
}

void main()
{
    vec2 uv = qt_TexCoord0;
    vec2 p = (uv * resolution + origin) / unit;
    vec2 pondUv = (uv * resolution + origin) / span;

    vec2 e = 1.0 / cells;
    float hx0 = height(pondUv - vec2(e.x, 0.0)), hx1 = height(pondUv + vec2(e.x, 0.0));
    float hy0 = height(pondUv - vec2(0.0, e.y)), hy1 = height(pondUv + vec2(0.0, e.y));
    float hc = height(pondUv);
    vec2 grad = vec2(hx1 - hx0, hy1 - hy0);
    float focus = hx0 + hx1 + hy0 + hy1 - 4.0 * hc;

    vec2 sw = swell(p);
    vec2 bend = sw * 1.5 + grad * 34.0;
    vec2 off = bend * unit / resolution;

    vec3 bed = texture(bedTex, uv + off).rgb;
    float caustic = texture(causticTex, uv + off * 2.2).r;

    // Cloudy variation in how far down you can see.
    float murk = fbm(p / 380.0 + vec2(time * 0.012, -time * 0.008));
    float fog = clamp(waterColor.a + (murk - 0.5) * 0.65, 0.0, 1.0);
    vec3 body = mix(deepColor.rgb, waterColor.rgb, smoothstep(0.25, 0.8, murk));

    float shine = caustic * causticStrength;
    vec3 col = bed * (0.66 + shine * 1.35 - clamp(focus, -0.5, 0.5) * 1.6);
    col = mix(col, body, fog);
    col += waterColor.rgb * shine * 0.16;

    vec4 fish = texture(fishTex, uv + off * 0.75);
    float fishLit = 0.93 + shine * 0.42 - clamp(focus, -0.4, 0.4) * 0.8;
    col = col * (1.0 - fish.a) + fish.rgb * fishLit;
    col = mix(col, body, 0.07);

    col *= lightColor.rgb * lightColor.a;

    // Sky on the surface: soft sheen plus hard glints on steep ripples.
    vec3 n = normalize(vec3(-sw * 0.035 - grad * 1.5, 1.0));
    vec3 hv = normalize(vec3(-0.34, -0.5, 0.8) + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, hv), 0.0), 70.0);
    float slope = dot(n.xy, vec2(-0.53, -0.85));
    float sheen = smoothstep(0.45, 0.95, fbm(p / vec2(520.0, 360.0) + sw * 0.03 + 5.0));
    col += skyColor.rgb * skyColor.a * (spec * 1.3 + sheen * 0.07 + clamp(slope, -0.6, 0.6) * 0.62);

    // Vignette.
    vec2 v = pondUv - 0.5;
    col *= 1.0 - 0.75 * dot(v, v);
    // A whisper of dither keeps the dark gradients from banding.
    col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
    fragColor = vec4(max(col, 0.0), 1.0) * qt_Opacity;
}
